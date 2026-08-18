import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  BadRequestException,
  HttpException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Readable, Transform } from 'node:stream';
import { ImageProcessorService } from './services/image-processor.service.js';
import { ExifService } from './services/exif.service.js';
import { QueueService } from './services/queue.service.js';
import { ProcessImageDto } from './dto/process-image.dto.js';
import { ExtractExifDto } from './dto/exif.dto.js';
import { formatValidationErrors } from '../../common/utils/validation-errors.js';
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
      if (e instanceof HttpException) {
        throw e;
      }
      const message = e instanceof Error ? e.message : 'Unknown error';
      throw new BadRequestException(`Invalid x-img-params: ${message}`);
    }
  }

  private async parseExifParamsFromHeader(req: FastifyRequest): Promise<ExtractExifDto> {
    const raw = this.getHeaderValue(req.headers['x-img-params']);
    if (!raw) {
      return new ExtractExifDto();
    }

    try {
      const parsed = JSON.parse(raw);
      const dto = plainToInstance(ExtractExifDto, parsed);

      const errors = await validate(dto);
      if (errors.length > 0) {
        throw new BadRequestException(formatValidationErrors(errors));
      }

      return dto;
    } catch (e) {
      if (e instanceof HttpException) {
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
      for await (const chunk of stream as AsyncIterable<Uint8Array | string | Buffer>) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalLength += buf.length;
        if (typeof maxBytes === 'number' && totalLength > maxBytes) {
          throw new PayloadTooLargeException(`File size exceeds maximum ${maxBytes} bytes`);
        }
        chunks.push(buf);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
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

    const headerDto = await this.parseProcessParamsFromHeader(req);
    const priority = headerDto.priority ?? 2;

    let isClientDisconnected = false;
    const abortController = new AbortController();
    const onClientClose = () => {
      if (req.raw?.destroyed || res.raw?.destroyed || !req.raw?.complete) {
        isClientDisconnected = true;
        abortController.abort();
      }
    };

    req.raw?.on?.('close', onClientClose);
    res.raw?.on?.('close', onClientClose);

    try {
      const result = await this.queueService.add(
        async signal => {
          if (signal.aborted) {
            throw new Error('Request aborted');
          }

          // Process multipart parts inside the queue concurrency slot
          const parts = req.parts();
          let mainFileData: { buffer: Buffer; mimetype: string } | null = null;
          let watermarkFileData: { buffer: Buffer; mimetype: string } | null = null;
          let dto = headerDto;

          try {
            for await (const part of parts) {
              if (signal.aborted) {
                throw new Error('Request aborted');
              }

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
                  if (e instanceof HttpException) {
                    throw e;
                  }
                  const message = e instanceof Error ? e.message : 'Unknown error';
                  throw new BadRequestException(`Invalid params: ${message}`);
                }
              }
            }
          } catch (error) {
            if (error instanceof HttpException) {
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
            throw new BadRequestException(
              'Watermark file is required when watermark config is provided',
            );
          }

          return await this.imageProcessor.processStream(
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
            signal,
          );
        },
        priority,
        abortController.signal,
      );

      res.type(result.mimeType);
      res.header('Content-Disposition', `inline; filename="processed.${result.extension}"`);
      res.header('X-Image-Width', result.width.toString());
      res.header('X-Image-Height', result.height.toString());
      res.header('X-Image-Size', result.size.toString());
      res.header('Content-Length', result.size.toString());

      return res.send(result.buffer);
    } catch (error) {
      if (
        isClientDisconnected ||
        abortController.signal.aborted ||
        res.raw?.destroyed ||
        res.raw?.writableEnded ||
        (error instanceof Error &&
          (error.message === 'Request aborted' || error.message === 'The operation was aborted'))
      ) {
        return;
      }
      throw error;
    } finally {
      req.raw?.removeListener?.('close', onClientClose);
      res.raw?.removeListener?.('close', onClientClose);
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
    let isClientDisconnected = false;
    const abortController = new AbortController();

    const limiter = this.createMaxBytesTransform(this.getMaxBytes());
    const inputStream = (req.raw as unknown as Readable).pipe(limiter);
    inputStream.on('error', () => {
      // Prevent unhandled stream error events
    });

    const cleanup = () => {
      try {
        if (!inputStream.destroyed) {
          inputStream.destroy();
        }
      } catch {
        // ignore
      }
    };

    const onClientClose = () => {
      if (req.raw?.destroyed || res.raw?.destroyed || !req.raw?.complete) {
        isClientDisconnected = true;
        abortController.abort();
        cleanup();
      }
    };

    const onClientError = () => {
      isClientDisconnected = true;
      abortController.abort();
      cleanup();
    };

    req.raw?.on?.('close', onClientClose);
    res.raw?.on?.('close', onClientClose);
    res.raw?.on?.('error', onClientError);

    try {
      const result = await this.queueService.add(
        signal =>
          this.imageProcessor.processStream(
            inputStream,
            acceptedMimeType,
            dto.transform,
            dto.output,
            undefined,
            signal,
          ),
        priority,
        abortController.signal,
      );

      res.type(result.mimeType);
      res.header('Content-Disposition', `inline; filename="processed.${result.extension}"`);
      res.header('X-Image-Width', result.width.toString());
      res.header('X-Image-Height', result.height.toString());
      res.header('X-Image-Size', result.size.toString());
      res.header('Content-Length', result.size.toString());

      return res.send(result.buffer);
    } catch (error) {
      if (
        isClientDisconnected ||
        abortController.signal.aborted ||
        res.raw?.destroyed ||
        res.raw?.writableEnded ||
        (error instanceof Error &&
          (error.message === 'Request aborted' || error.message === 'The operation was aborted'))
      ) {
        return;
      }
      throw error;
    } finally {
      req.raw?.removeListener?.('close', onClientClose);
      res.raw?.removeListener?.('close', onClientClose);
      res.raw?.removeListener?.('error', onClientError);
      cleanup();
    }
  }

  /**
   * Extracts EXIF metadata from an image stream via multipart/form-data.
   * Tasks are added to the priority queue.
   *
   * @param req - Fastify request with multipart file.
   */
  @Post('exif')
  @HttpCode(HttpStatus.OK)
  public async extractExif(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    // Preliminary validation
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('multipart/form-data')) {
      throw new BadRequestException('Invalid content type, expected multipart/form-data');
    }

    const headerDto = await this.parseExifParamsFromHeader(req);
    const priority = headerDto.priority ?? 2;

    let isClientDisconnected = false;
    const abortController = new AbortController();

    const onClientClose = () => {
      if (req.raw?.destroyed || res.raw?.destroyed || !req.raw?.complete) {
        isClientDisconnected = true;
        abortController.abort();
      }
    };

    req.raw?.on?.('close', onClientClose);
    res.raw?.on?.('close', onClientClose);

    try {
      const responseBody = await this.queueService.add(
        async signal => {
          if (signal.aborted) {
            throw new Error('Request aborted');
          }

          const parts = req.parts();
          let fileData: { buffer: Buffer; mimetype: string } | null = null;

          try {
            for await (const part of parts) {
              if (signal.aborted) {
                throw new Error('Request aborted');
              }

              if (part.type === 'file' && part.fieldname === 'file') {
                const buffer = await this.readStreamToBuffer(part.file, this.getMaxBytes());
                fileData = { buffer, mimetype: part.mimetype };
              } else if (part.type === 'field' && part.fieldname === 'params') {
                try {
                  const fieldValue = part.value as string;
                  const parsed = JSON.parse(fieldValue);
                  const dto = plainToInstance(ExtractExifDto, parsed);

                  const errors = await validate(dto);
                  if (errors.length > 0) {
                    throw new BadRequestException(formatValidationErrors(errors));
                  }
                } catch (e) {
                  if (e instanceof HttpException) {
                    throw e;
                  }
                  const message = e instanceof Error ? e.message : 'Unknown error';
                  throw new BadRequestException(`Invalid params: ${message}`);
                }
              }
            }
          } catch (error) {
            if (error instanceof HttpException) {
              throw error;
            }
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new BadRequestException(`Failed to process multipart payload: ${message}`);
          }

          if (!fileData) {
            throw new BadRequestException('No file uploaded');
          }

          const rawExif = await this.exifService.extract(fileData.buffer, fileData.mimetype);

          const { width, height, ...exif } = rawExif ?? {};
          return {
            exif: Object.keys(exif).length > 0 ? exif : null,
            width: typeof width === 'number' ? width : undefined,
            height: typeof height === 'number' ? height : undefined,
          };
        },
        priority,
        abortController.signal,
      );

      res.send(responseBody);
      return responseBody;
    } catch (error) {
      if (
        isClientDisconnected ||
        abortController.signal.aborted ||
        res.raw?.destroyed ||
        res.raw?.writableEnded ||
        (error instanceof Error &&
          (error.message === 'Request aborted' || error.message === 'The operation was aborted'))
      ) {
        return;
      }
      throw error;
    } finally {
      req.raw?.removeListener?.('close', onClientClose);
      res.raw?.removeListener?.('close', onClientClose);
    }
  }
}
