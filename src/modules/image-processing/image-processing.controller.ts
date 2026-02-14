import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { finished } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { ImageProcessorService } from './services/image-processor.service.js';
import { ExifService } from './services/exif.service.js';
import { QueueService } from './services/queue.service.js';
import { ProcessImageDto } from './dto/process-image.dto.js';
import { ExtractExifDto } from './dto/exif.dto.js';
import { formatValidationErrors } from '../../utils/validation-errors.js';
import type { ImageConfig } from '../../config/image.config.js';

/**
 * Controller for handling image processing and EXIF extraction requests.
 * All operations are offloaded to a priority queue to ensure system stability.
 */
@Controller()
export class ImageProcessingController {
  constructor(
    private readonly imageProcessor: ImageProcessorService,
    private readonly exifService: ExifService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
  ) {}

  private getHeaderValue(value: string | string[] | undefined): string | undefined {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
  }

  private async parseProcessParamsFromHeader(req: FastifyRequest): Promise<ProcessImageDto> {
    const raw = this.getHeaderValue(req.headers['x-img-params']);
    if (!raw) {
      return new ProcessImageDto();
    }

    try {
      const parsed = JSON.parse(raw);
      const dto = plainToInstance(ProcessImageDto, parsed);

      const errors = await validate(dto);
      if (errors.length > 0) {
        throw new BadRequestException(formatValidationErrors(errors));
      }

      return dto;
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      const message = e instanceof Error ? e.message : 'Unknown error';
      throw new BadRequestException(`Invalid x-img-params: ${message}`);
    }
  }

  private createMaxBytesTransform(maxBytes?: number): Transform {
    let totalLength = 0;

    return new Transform({
      transform(chunk, _encoding, callback) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalLength += buf.length;

        if (typeof maxBytes === 'number' && totalLength > maxBytes) {
          callback(new PayloadTooLargeException(`File size exceeds maximum ${maxBytes} bytes`));
          return;
        }

        callback(null, buf);
      },
    });
  }

  private getMaxBytes(): number | undefined {
    const config = this.configService.get<ImageConfig>('image');
    return config?.maxBytes;
  }

  private async readStreamToBuffer(
    stream: NodeJS.ReadableStream,
    maxBytes?: number,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let totalLength = 0;

    try {
      for await (const chunk of stream as any as AsyncIterable<Buffer>) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalLength += buf.length;
        if (typeof maxBytes === 'number' && totalLength > maxBytes) {
          throw new PayloadTooLargeException(`File size exceeds maximum ${maxBytes} bytes`);
        }
        chunks.push(buf);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to read upload stream: ${message}`);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Processes an image stream via multipart/form-data.
   * Tasks are added to the priority queue.
   *
   * @param req - Fastify request with multipart file.
   * @param res - Fastify reply to send the stream.
   */
  @Post('process')
  @HttpCode(HttpStatus.OK)
  public async process(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    // Preliminary validation: check headers before reading the body
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('multipart/form-data')) {
      throw new BadRequestException('Invalid content type, expected multipart/form-data');
    }

    // Process multiple files (main file and optional watermark)
    const parts = req.parts();
    let mainFileData: { buffer: Buffer; mimetype: string } | null = null;
    let watermarkFileData: { buffer: Buffer; mimetype: string } | null = null;
    let dto = new ProcessImageDto();

    try {
      for await (const part of parts) {
        if (part.type === 'file') {
          const buffer = await this.readStreamToBuffer(part.file, this.getMaxBytes());

          if (part.fieldname === 'file') {
            mainFileData = { buffer, mimetype: part.mimetype };
          } else if (part.fieldname === 'watermark') {
            watermarkFileData = { buffer, mimetype: part.mimetype };
          }
        } else if (part.type === 'field' && part.fieldname === 'params') {
          try {
            const fieldValue = part.value as string;
            const parsed = JSON.parse(fieldValue);
            dto = plainToInstance(ProcessImageDto, parsed);

            const errors = await validate(dto);
            if (errors.length > 0) {
              throw new BadRequestException(formatValidationErrors(errors));
            }
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            throw new BadRequestException(`Invalid params: ${message}`);
          }
        }
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to process multipart payload: ${message}`);
    }

    if (!mainFileData) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate watermark: if watermark config is provided, watermark file is required
    if (dto.transform?.watermark && !watermarkFileData) {
      throw new BadRequestException('Watermark file is required when watermark config is provided');
    }

    const priority = dto.priority ?? 2;

    // Use queue to process the image and hold the slot until the response is finished
    await this.queueService.add(async () => {
      const result = await this.imageProcessor.processStream(
        Readable.from(mainFileData.buffer),
        mainFileData.mimetype,
        dto.transform,
        dto.output,
        watermarkFileData
          ? {
              buffer: watermarkFileData.buffer,
              mimetype: watermarkFileData.mimetype,
            }
          : undefined,
      );

      res.type(result.mimeType);
      res.header('Content-Disposition', `inline; filename="processed.${result.extension}"`);

      result.stream.on('error', err => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        try {
          if (!res.raw.destroyed) {
            res.raw.destroy(err instanceof Error ? err : new Error(message));
          }
        } catch {
          // ignore
        }
      });

      // Pipe the sharp output to the response
      res.send(result.stream);

      // Wait until the response is completely sent to the client
      await finished(res.raw);
    }, priority);
  }

  @Post('process/raw')
  @HttpCode(HttpStatus.OK)
  public async processRaw(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const contentType = this.getHeaderValue(req.headers['content-type']);
    const mimeType = contentType?.split(';')[0]?.trim();

    if (!mimeType) {
      throw new UnsupportedMediaTypeException('Missing content type');
    }

    const acceptedMimeType = mimeType.startsWith('image/') ? mimeType : 'application/octet-stream';
    if (!mimeType.startsWith('image/') && mimeType !== 'application/octet-stream') {
      throw new UnsupportedMediaTypeException(
        'Invalid content type, expected image/* or application/octet-stream',
      );
    }

    const dto = await this.parseProcessParamsFromHeader(req);

    if (dto.transform?.watermark) {
      throw new BadRequestException('Watermark is not supported for this endpoint');
    }

    const priority = dto.priority ?? 2;

    await this.queueService.add(async () => {
      const limiter = this.createMaxBytesTransform(this.getMaxBytes());
      const inputStream = (req.raw as unknown as Readable).pipe(limiter);

      let resultStream: Readable | undefined;

      const cleanup = (error?: Error) => {
        try {
          if (resultStream && !resultStream.destroyed) {
            resultStream.destroy(error);
          }
        } catch {
          // ignore
        }

        try {
          if (!inputStream.destroyed) {
            inputStream.destroy(error);
          }
        } catch {
          // ignore
        }
      };

      res.raw.once('close', () => {
        if (!res.raw.writableEnded && !res.raw.destroyed) {
          cleanup(new Error('Client connection closed'));
          return;
        }

        cleanup();
      });

      res.raw.once('error', err => {
        cleanup(err instanceof Error ? err : new Error('Response error'));
      });

      const result = await this.imageProcessor.processStream(
        inputStream,
        acceptedMimeType,
        dto.transform,
        dto.output,
      );

      resultStream = result.stream;

      res.type(result.mimeType);
      res.header('Content-Disposition', `inline; filename="processed.${result.extension}"`);

      result.stream.on('error', err => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        try {
          if (!res.raw.destroyed) {
            res.raw.destroy(err instanceof Error ? err : new Error(message));
          }
        } catch {
          // ignore
        }
      });

      res.send(result.stream);
      await finished(res.raw);
      cleanup();
    }, priority);
  }

  /**
   * Extracts EXIF metadata from an image stream via multipart/form-data.
   * Tasks are added to the priority queue.
   *
   * @param req - Fastify request with multipart file.
   */
  @Post('exif')
  @HttpCode(HttpStatus.OK)
  public async extractExif(@Req() req: FastifyRequest) {
    // Preliminary validation
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('multipart/form-data')) {
      throw new BadRequestException('Invalid content type, expected multipart/form-data');
    }

    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No file uploaded');
    }

    // Parse params from form field to get priority if provided
    let dto = new ExtractExifDto();
    const paramsField = data.fields['params'];
    const paramValue =
      paramsField && !Array.isArray(paramsField) && paramsField.type === 'field'
        ? (paramsField as any).value
        : undefined;

    if (paramValue) {
      try {
        const parsed = JSON.parse(paramValue as string);
        dto = plainToInstance(ExtractExifDto, parsed);
        const errors = await validate(dto);
        if (errors.length > 0) {
          throw new BadRequestException(formatValidationErrors(errors));
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        throw new BadRequestException(`Invalid params: ${message}`);
      }
    }

    // Buffer for backpressure
    const buffer = await this.readStreamToBuffer(data.file, this.getMaxBytes());
    const priority = dto.priority ?? 2;

    const result = await this.queueService.add(async () => {
      const exif = await this.exifService.extract(Readable.from(buffer), data.mimetype);
      return { exif };
    }, priority);

    return result;
  }
}
