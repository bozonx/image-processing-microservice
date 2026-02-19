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
    const abortController = new AbortController();
    res.raw.on('close', () => {
      // If the response is not finished, it means the client disconnected prematurely
      if (!res.raw.writableEnded) {
        abortController.abort();
      }
    });

    try {
      await this.queueService.add(
        async () => {
          if (abortController.signal.aborted) {
            throw new Error('Request aborted');
          }

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
            abortController.signal,
          );

          res.type(result.mimeType);
          res.header('Content-Disposition', `inline; filename="processed.${result.extension}"`);
          res.header('X-Image-Width', result.width.toString());
          res.header('X-Image-Height', result.height.toString());
          res.header('X-Image-Size', result.size.toString());
          res.header('Content-Length', result.size.toString());

          res.send(result.buffer);

          // Wait until the response is completely sent to the client
          await finished(res.raw);
        },
        priority,
        abortController.signal,
      );
    } catch (error) {
      if (abortController.signal.aborted) {
        // If aborted, we don't want to throw an internal server error if it was client disconnect
        // But since we are in a controller, if we don't handle it, it bubbles up.
        // NestJS might log it.
        return;
      }
      throw error;
    }
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

    const abortController = new AbortController();
    await this.queueService.add(
      async () => {
        if (abortController.signal.aborted) {
          throw new Error('Request aborted');
        }

        const limiter = this.createMaxBytesTransform(this.getMaxBytes());
        const inputStream = (req.raw as unknown as Readable).pipe(limiter);

        let resultStream: Readable | undefined;

        const cleanup = (error?: Error) => {
          abortController.abort();
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

        const closeHandler = () => {
          if (!res.raw.writableEnded && !res.raw.destroyed) {
            cleanup(new Error('Client connection closed'));
            return;
          }
          cleanup();
        };

        const errorHandler = (err: Error) => {
          cleanup(err instanceof Error ? err : new Error('Response error'));
        };

        res.raw.once('close', closeHandler);
        res.raw.once('error', errorHandler);

        try {
          const result = await this.imageProcessor.processStream(
            inputStream,
            acceptedMimeType,
            dto.transform,
            dto.output,
            undefined,
            abortController.signal,
          );

          res.type(result.mimeType);
          res.header('Content-Disposition', `inline; filename="processed.${result.extension}"`);
          res.header('X-Image-Width', result.width.toString());
          res.header('X-Image-Height', result.height.toString());
          res.header('X-Image-Size', result.size.toString());
          res.header('Content-Length', result.size.toString());

          res.send(result.buffer);
          await finished(res.raw);
        } catch (err) {
          // Clean up listeners if we error out
          res.raw.removeListener('close', closeHandler);
          res.raw.removeListener('error', errorHandler);
          throw err;
        } finally {
          cleanup();
        }
      },
      priority,
      abortController.signal,
    );
  }

  /**
   * Extracts EXIF metadata from an image stream via multipart/form-data.
   * Tasks are added to the priority queue.
   *
   * @param req - Fastify request with multipart file.
   */
  @Post('exif')
  @HttpCode(HttpStatus.OK)
  public async extractExif(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
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

    const abortController = new AbortController();
    req.raw.on('close', () => {
      if (!res.raw.writableEnded) {
        abortController.abort();
      }
    });

    const result = await this.queueService.add(
      async () => {
        if (abortController.signal.aborted) {
          throw new Error('Request aborted');
        }
        const result = (await this.exifService.extract(
          Readable.from(buffer),
          data.mimetype,
        )) as any;
        const { width, height, ...exif } = result || {};
        return { exif: Object.keys(exif).length > 0 ? exif : null, width, height };
      },
      priority,
      abortController.signal,
    );

    return result;
  }
}
