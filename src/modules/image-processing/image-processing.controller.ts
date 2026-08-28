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
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { Readable, Transform } from 'node:stream';
import { ImageProcessorService, type ProcessResult } from './services/image-processor.service.js';
import { ExifService } from './services/exif.service.js';
import { QueueService } from './services/queue.service.js';
import { ProcessImageDto } from './dto/process-image.dto.js';
import { ExtractExifDto } from './dto/exif.dto.js';
import { isAbortError, RequestAbortedError, watchClient } from './client-connection.js';
import { formatValidationErrors } from '../../common/utils/validation-errors.js';
import type { ImageConfig } from '../../config/image.config.js';
import { ImageSanitizerService } from './services/image-sanitizer.service.js';

/** Header carrying request parameters when the body is the image itself. */
const PARAMS_HEADER = 'x-img-params';

/** Multipart field carrying request parameters. */
const PARAMS_FIELD = 'params';

/** Default queue priority: 0 is highest, 2 is lowest. */
const DEFAULT_PRIORITY = 2;

/** A file that arrived in a multipart request. */
interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
}

/** What a multipart request carried: the named files, and the parsed `params` field. */
interface MultipartPayload<T> {
  files: Map<string, UploadedFile>;
  params?: T;
}

/** Body returned by the EXIF endpoint. */
interface ExifResponse {
  exif: Record<string, unknown> | null;
  width?: number;
  height?: number;
}

/**
 * Image processing and EXIF extraction.
 *
 * Every endpoint follows the same shape: parse the parameters, run the work inside a queue
 * slot so concurrency stays bounded, and abandon the request without an error response if the
 * caller disconnected while it was queued. That shape lives in `runQueued`, not in each method.
 */
@Controller()
export class ImageProcessingController {
  private readonly maxBytes: number;

  constructor(
    private readonly imageProcessor: ImageProcessorService,
    private readonly imageSanitizer: ImageSanitizerService,
    private readonly exifService: ExifService,
    private readonly queueService: QueueService,
    configService: ConfigService,
  ) {
    this.maxBytes = configService.getOrThrow<ImageConfig>('image').maxBytes;
  }

  /**
   * Processes an image sent as `multipart/form-data`, optionally with a watermark file.
   *
   * @param req - Request carrying the `file` part and an optional `watermark` part.
   * @param res - Reply the processed image is written to.
   */
  @Post('process')
  @HttpCode(HttpStatus.OK)
  public async process(@Req() req: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    this.assertMultipart(req);
    const headerDto = await this.parseParams(ProcessImageDto, this.header(req, PARAMS_HEADER));

    const result = await this.runQueued(req, res, headerDto.priority, async signal => {
      const { files, params } = await this.collectMultipart(req, ProcessImageDto, signal, [
        'file',
        'watermark',
      ]);
      const dto = params ?? headerDto;

      const main = files.get('file');
      if (!main) {
        throw new BadRequestException('No file uploaded');
      }

      const watermark = files.get('watermark');
      if (dto.transform?.watermark && !watermark) {
        throw new BadRequestException(
          'Watermark file is required when watermark config is provided',
        );
      }

      return this.imageProcessor.processStream(
        Readable.from(main.buffer),
        main.mimetype,
        dto.transform,
        dto.output,
        watermark,
        signal,
      );
    });

    if (result) {
      this.sendImage(res, result);
    }
  }

  /**
   * Processes an image sent as a raw body, streamed straight into the pipeline.
   *
   * @param req - Request whose body is the image.
   * @param res - Reply the processed image is written to.
   */
  @Post('process/raw')
  @HttpCode(HttpStatus.OK)
  public async processRaw(@Req() req: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    const mimeType = this.assertRawContentType(req);
    const dto = await this.parseParams(ProcessImageDto, this.header(req, PARAMS_HEADER));

    if (dto.transform?.watermark) {
      // A watermark needs a second file, and this endpoint's body is the image itself.
      throw new BadRequestException('Watermark is not supported for this endpoint');
    }

    const limiter = this.createMaxBytesTransform();
    const inputStream = (req.raw as unknown as Readable).pipe(limiter);
    // The limiter's error travels with the pipeline result; without a listener here the same
    // event would also reach the process as an unhandled 'error'.
    inputStream.on('error', () => {});

    const destroyInput = (): void => {
      if (!inputStream.destroyed) {
        inputStream.destroy();
      }
    };

    const result = await this.runQueued(
      req,
      res,
      dto.priority,
      signal =>
        this.imageProcessor.processStream(
          inputStream,
          mimeType,
          dto.transform,
          dto.output,
          undefined,
          signal,
        ),
      { onAbort: destroyInput, onFinally: destroyInput },
    );

    if (result) {
      this.sendImage(res, result);
    }
  }

  /** Removes metadata from a JPEG or WebP container without re-encoding its image payload. */
  @Post('sanitize/raw')
  @HttpCode(HttpStatus.OK)
  public async sanitizeRaw(@Req() req: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    const mimeType = this.assertRawContentType(req);
    const dto = await this.parseParams(ExtractExifDto, this.header(req, PARAMS_HEADER));
    const limiter = this.createMaxBytesTransform();
    const inputStream = (req.raw as unknown as Readable).pipe(limiter);
    inputStream.on('error', () => {});

    const destroyInput = (): void => {
      if (!inputStream.destroyed) inputStream.destroy();
    };
    const result = await this.runQueued(
      req,
      res,
      dto.priority,
      signal => {
        if (signal.aborted) inputStream.destroy(new RequestAbortedError());
        return this.imageSanitizer.sanitizeStream(inputStream, mimeType);
      },
      { onAbort: destroyInput, onFinally: destroyInput },
    );

    if (result) this.sendImage(res, result);
  }

  /**
   * Extracts EXIF metadata from an image sent as `multipart/form-data`.
   *
   * @param req - Request carrying the `file` part.
   * @param res - Reply the metadata is written to.
   */
  @Post('exif')
  @HttpCode(HttpStatus.OK)
  public async extractExif(@Req() req: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    this.assertMultipart(req);
    const headerDto = await this.parseParams(ExtractExifDto, this.header(req, PARAMS_HEADER));

    const body = await this.runQueued(req, res, headerDto.priority, async signal => {
      const { files } = await this.collectMultipart(req, ExtractExifDto, signal, ['file']);

      const file = files.get('file');
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }

      const { width, height, ...exif } =
        (await this.exifService.extract(file.buffer, file.mimetype)) ?? {};

      const response: ExifResponse = {
        exif: Object.keys(exif).length > 0 ? exif : null,
        width: typeof width === 'number' ? width : undefined,
        height: typeof height === 'number' ? height : undefined,
      };
      return response;
    });

    if (body) {
      void res.send(body);
    }
  }

  /**
   * Runs a task in a queue slot, watching the caller's connection for the whole time.
   *
   * A caller that disconnects mid-flight gets no response at all: the socket is already gone,
   * and turning that into a 500 would only fill the logs with errors nobody caused.
   *
   * @param req - Incoming request.
   * @param res - Reply being produced.
   * @param priority - Requested queue priority, 0 highest.
   * @param task - Work to run once a slot is free.
   * @param hooks - Extra teardown for resources the task owns.
   * @returns The task's result, or undefined when the caller went away.
   */
  private async runQueued<T>(
    req: FastifyRequest,
    res: FastifyReply,
    priority: number | undefined,
    task: (signal: AbortSignal) => Promise<T>,
    hooks?: { onAbort?: () => void; onFinally?: () => void },
  ): Promise<T | undefined> {
    const connection = watchClient(req, res, hooks?.onAbort);

    try {
      return await this.queueService.add(
        signal => {
          if (signal.aborted) {
            throw new RequestAbortedError();
          }
          return task(signal);
        },
        priority ?? DEFAULT_PRIORITY,
        connection.signal,
      );
    } catch (error) {
      if (
        connection.disconnected() ||
        connection.signal.aborted ||
        res.raw.destroyed ||
        res.raw.writableEnded ||
        isAbortError(error)
      ) {
        return undefined;
      }
      throw error;
    } finally {
      connection.dispose();
      hooks?.onFinally?.();
    }
  }

  /**
   * Reads the named files and the `params` field out of a multipart body.
   *
   * The parts are consumed inside the queue slot rather than before it, so a burst of large
   * uploads waits its turn instead of all buffering at once.
   *
   * @param req - Multipart request.
   * @param cls - DTO the `params` field is validated against.
   * @param signal - Abort signal for the surrounding queue task.
   * @param fields - File field names to keep; anything else is ignored.
   * @returns The collected files and parsed parameters.
   */
  private async collectMultipart<T extends object>(
    req: FastifyRequest,
    cls: ClassConstructor<T>,
    signal: AbortSignal,
    fields: readonly string[],
  ): Promise<MultipartPayload<T>> {
    const files = new Map<string, UploadedFile>();
    let params: T | undefined;

    try {
      for await (const part of req.parts()) {
        if (signal.aborted) {
          throw new RequestAbortedError();
        }

        if (part.type === 'file' && fields.includes(part.fieldname)) {
          files.set(part.fieldname, {
            buffer: await this.readStreamToBuffer(part.file),
            mimetype: part.mimetype,
          });
        } else if (part.type === 'field' && part.fieldname === PARAMS_FIELD) {
          params = await this.parseParams(cls, String(part.value), PARAMS_FIELD);
        }
      }
    } catch (error) {
      if (error instanceof HttpException || error instanceof RequestAbortedError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Failed to process multipart payload: ${message}`);
    }

    return { files, params };
  }

  /**
   * Parses and validates request parameters from JSON.
   *
   * @param cls - DTO class to build.
   * @param raw - Raw JSON, or undefined when the caller sent none.
   * @param source - Name of the header or field, used in the error message.
   * @returns The validated DTO; an empty one when nothing was sent.
   * @throws BadRequestException when the JSON or any value is invalid.
   */
  private async parseParams<T extends object>(
    cls: ClassConstructor<T>,
    raw: string | undefined,
    source: string = PARAMS_HEADER,
  ): Promise<T> {
    if (raw === undefined || raw === '') {
      return plainToInstance(cls, {});
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Invalid ${source}: ${message}`);
    }

    const dto = plainToInstance(cls, parsed);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length > 0) {
      throw new BadRequestException(`Invalid ${source}: ${formatValidationErrors(errors)}`);
    }

    return dto;
  }

  /**
   * Writes a processed image and the headers describing it.
   *
   * @param res - Reply to write to.
   * @param result - Processed image and its metadata.
   */
  private sendImage(res: FastifyReply, result: ProcessResult): void {
    void res
      .type(result.mimeType)
      .header('Content-Disposition', `inline; filename="processed.${result.extension}"`)
      .header('X-Image-Width', result.width.toString())
      .header('X-Image-Height', result.height.toString())
      .header('X-Image-Size', result.size.toString())
      .header('Content-Length', result.size.toString())
      .send(result.buffer);
  }

  /**
   * Rejects a request that is not multipart before any of its body is read.
   *
   * @param req - Incoming request.
   * @throws BadRequestException when the content type is wrong.
   */
  private assertMultipart(req: FastifyRequest): void {
    if (!req.headers['content-type']?.includes('multipart/form-data')) {
      throw new BadRequestException('Invalid content type, expected multipart/form-data');
    }
  }

  /**
   * Resolves the MIME type of a raw image body.
   *
   * @param req - Incoming request.
   * @returns The MIME type the pipeline should decode as.
   * @throws UnsupportedMediaTypeException when the type is missing or not an image.
   */
  private assertRawContentType(req: FastifyRequest): string {
    const mimeType = this.header(req, 'content-type')?.split(';')[0]?.trim();

    if (mimeType === undefined || mimeType === '') {
      throw new UnsupportedMediaTypeException('Missing content type');
    }
    if (mimeType.startsWith('image/')) {
      return mimeType;
    }
    if (mimeType === 'application/octet-stream') {
      return mimeType;
    }

    throw new UnsupportedMediaTypeException(
      'Invalid content type, expected image/* or application/octet-stream',
    );
  }

  /**
   * Reads a header that may legally repeat.
   *
   * @param req - Incoming request.
   * @param name - Lower-case header name.
   * @returns The first value, or undefined.
   */
  private header(req: FastifyRequest, name: string): string | undefined {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  /**
   * Fails the stream once more than `FILE_MAX_BYTES_MB` has passed through it.
   *
   * @returns A transform that counts bytes and rejects an oversized body.
   */
  private createMaxBytesTransform(): Transform {
    const maxBytes = this.maxBytes;
    let totalLength = 0;

    return new Transform({
      transform(chunk: Buffer | string, _encoding, callback) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalLength += buf.length;

        if (totalLength > maxBytes) {
          callback(new PayloadTooLargeException(`File size exceeds maximum ${maxBytes} bytes`));
          return;
        }

        callback(null, buf);
      },
    });
  }

  /**
   * Buffers an upload, refusing it as soon as it grows past the size limit.
   *
   * @param stream - Part stream to read.
   * @returns The whole upload.
   * @throws PayloadTooLargeException when the limit is exceeded.
   */
  private async readStreamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let totalLength = 0;

    for await (const chunk of stream as AsyncIterable<Uint8Array | string | Buffer>) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalLength += buf.length;
      if (totalLength > this.maxBytes) {
        throw new PayloadTooLargeException(`File size exceeds maximum ${this.maxBytes} bytes`);
      }
      chunks.push(buf);
    }

    return Buffer.concat(chunks);
  }
}
