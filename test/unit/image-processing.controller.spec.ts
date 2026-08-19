import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Readable, Writable } from 'node:stream';
import { ImageProcessingController } from '../../src/modules/image-processing/image-processing.controller.js';
import { ImageProcessorService } from '../../src/modules/image-processing/services/image-processor.service.js';
import { ExifService } from '../../src/modules/image-processing/services/exif.service.js';
import { QueueService } from '../../src/modules/image-processing/services/queue.service.js';
import { ConfigService } from '@nestjs/config';

/** Config the controller reads at construction time. */
const IMAGE_CONFIG: Record<string, unknown> = { image: { maxBytes: 10 * 1024 * 1024 } };

/**
 * Builds a raw request whose body has fully arrived.
 *
 * `complete` is what the controller tests for a hang-up, so a double that omits it looks like
 * a caller that vanished mid-upload.
 */
const rawReq = (contentType: string, chunks: Buffer[]) => ({
  headers: { 'content-type': contentType },
  raw: Object.assign(Readable.from(chunks), { complete: true }),
});

describe('ImageProcessingController', () => {
  let controller: ImageProcessingController;
  let imageProcessor: ImageProcessorService;
  let exifService: ExifService;
  let queueService: QueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ImageProcessingController],
      providers: [
        {
          provide: ImageProcessorService,
          useValue: {
            processStream: jest.fn(),
          },
        },
        {
          provide: ExifService,
          useValue: {
            extract: jest.fn(),
          },
        },
        {
          provide: QueueService,
          useValue: {
            add: jest.fn(
              (task: (signal: AbortSignal) => Promise<any>, _p?: number, signal?: AbortSignal) =>
                task(signal ?? new AbortController().signal),
            ),
            getStatus: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: unknown) => IMAGE_CONFIG[key as string]),
            getOrThrow: jest.fn().mockImplementation((key: unknown) => {
              const value = IMAGE_CONFIG[key as string];
              if (value === undefined) {
                throw new Error(`Configuration key "${String(key)}" not found`);
              }
              return value;
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<ImageProcessingController>(ImageProcessingController);
    imageProcessor = module.get<ImageProcessorService>(ImageProcessorService);
    exifService = module.get<ExifService>(ExifService);
    queueService = module.get<QueueService>(QueueService);
  });

  const mockReq = (
    partsData: any[] = [],
    headers: Record<string, string> = { 'content-type': 'multipart/form-data' },
  ) => ({
    headers,
    raw: Object.assign(Readable.from([]), { complete: true }),
    file: jest.fn().mockImplementation(async () => {
      await Promise.resolve();
      return partsData.find(p => p.type === 'file') ?? partsData[0];
    }),
    parts: jest.fn().mockImplementation(() => {
      async function* gen() {
        await Promise.resolve();
        for (const part of partsData) {
          yield part;
        }
      }
      return gen();
    }),
  });

  const mockRes = () => {
    const raw = new (class extends Writable {
      _header = true;
      override _write(_chunk: any, _encoding: string, callback: (error?: Error | null) => void) {
        callback();
      }
    })();

    const res = {
      type: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      raw,
    };
    return res;
  };

  describe('processRaw', () => {
    it('should accept application/octet-stream', async () => {
      const req = rawReq('application/octet-stream', [Buffer.from('test-data')]);
      const res = mockRes();

      const buffer = Buffer.from('processed');
      const processedResult = {
        buffer,
        mimeType: 'image/webp',
        extension: 'webp',
        width: 100,
        height: 100,
        size: buffer.length,
      };

      jest.spyOn(imageProcessor, 'processStream').mockResolvedValue(processedResult);

      await controller.processRaw(req as any, res as any);

      expect(queueService.add).toHaveBeenCalled();
      expect(imageProcessor.processStream).toHaveBeenCalledWith(
        expect.any(Readable),
        'application/octet-stream',
        undefined,
        undefined,
        undefined,
        expect.any(AbortSignal),
      );
      expect(res.type).toHaveBeenCalledWith('image/webp');
      expect(res.send).toHaveBeenCalledWith(processedResult.buffer);
    });

    it('should reject unsupported content type', async () => {
      const req = rawReq('text/plain', [Buffer.from('x')]);
      await expect(controller.processRaw(req as any, mockRes() as any)).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
    });

    it('should propagate original error when processStream fails (not mask as abort)', async () => {
      const req = rawReq('image/jpeg', [Buffer.from('corrupt-image-data')]);
      const res = mockRes();

      const originalError = new Error('Input buffer contains unsupported image format');
      jest.spyOn(imageProcessor, 'processStream').mockRejectedValue(originalError);

      await expect(controller.processRaw(req as any, res as any)).rejects.toThrow(
        'Input buffer contains unsupported image format',
      );
    });

    it('should silently handle abort when client disconnects', async () => {
      const req = rawReq('image/jpeg', [Buffer.from('test-data')]);
      const res = mockRes();

      // Simulate p-queue behavior: reject with abort error when signal aborts
      jest
        .spyOn(queueService, 'add')
        .mockImplementation(
          async (
            task: (signal: AbortSignal) => Promise<any>,
            _priority?: number,
            signal?: AbortSignal,
          ) => {
            if (signal?.aborted) {
              throw new Error('The operation was aborted');
            }
            return new Promise((resolve, reject) => {
              signal?.addEventListener(
                'abort',
                () => {
                  reject(new Error('The operation was aborted'));
                },
                { once: true },
              );
              task(signal ?? new AbortController().signal).then(resolve, reject);
            });
          },
        );

      // Simulate client disconnect by aborting after a tick
      jest
        .spyOn(imageProcessor, 'processStream')
        .mockImplementation(async (_input, _mime, _t, _o, _w, signal) => {
          // Wait a tick so the abort can fire
          await new Promise(r => setTimeout(r, 20));
          if (signal?.aborted) {
            throw new Error('Request aborted');
          }
          return {
            buffer: Buffer.from('processed'),
            mimeType: 'image/webp',
            extension: 'webp',
            width: 100,
            height: 100,
            size: 9,
          };
        });

      // Trigger abort by destroying res.raw before processing completes
      setTimeout(() => {
        res.raw.destroy();
      }, 5);

      await expect(controller.processRaw(req as any, res as any)).resolves.toBeUndefined();
    });

    it('should throw 413 when payload exceeds limit', async () => {
      const req = rawReq('image/jpeg', [Buffer.alloc(11 * 1024 * 1024)]);
      const res = mockRes();

      jest.spyOn(imageProcessor, 'processStream').mockImplementation(async (input: Readable) => {
        for await (const _chunk of input) {
          // drain
        }
        const buffer = Buffer.from('processed');
        return {
          buffer,
          mimeType: 'image/webp',
          extension: 'webp',
          width: 100,
          height: 100,
          size: buffer.length,
        };
      });

      await expect(controller.processRaw(req as any, res as any)).rejects.toThrow(
        PayloadTooLargeException,
      );
    });

    it('should throw UnsupportedMediaTypeException when content-type is missing', async () => {
      const req = { headers: {}, raw: Object.assign(Readable.from([]), { complete: true }) };
      await expect(controller.processRaw(req as any, mockRes() as any)).rejects.toThrow(
        'Missing content type',
      );
    });

    it('should extract media type ignoring content-type parameters like charset', async () => {
      const req = rawReq('image/png; charset=utf-8', [Buffer.from('test')]);
      const res = mockRes();

      jest.spyOn(imageProcessor, 'processStream').mockResolvedValue({
        buffer: Buffer.from('p'),
        mimeType: 'image/webp',
        extension: 'webp',
        width: 10,
        height: 10,
        size: 1,
      });

      await controller.processRaw(req as any, res as any);
      expect(imageProcessor.processStream).toHaveBeenCalledWith(
        expect.any(Readable),
        'image/png',
        undefined,
        undefined,
        undefined,
        expect.any(AbortSignal),
      );
    });

    it('should throw BadRequestException if watermark is configured in params for processRaw', async () => {
      const req = {
        headers: {
          'content-type': 'image/jpeg',
          'x-img-params': JSON.stringify({ transform: { watermark: { mode: 'single' } } }),
        },
        raw: Object.assign(Readable.from([Buffer.from('test')]), { complete: true }),
      };

      await expect(controller.processRaw(req as any, mockRes() as any)).rejects.toThrow(
        'Watermark is not supported for this endpoint',
      );
    });
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('process', () => {
    it('should call imageProcessor.processStream and return stream', async () => {
      const filePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'image/jpeg',
        file: Readable.from([Buffer.from('test-data')]),
      };

      const req = mockReq([filePart]);
      const res = mockRes();
      const buffer = Buffer.from('processed');
      const processedResult = {
        buffer,
        mimeType: 'image/webp',
        extension: 'webp',
        width: 100,
        height: 100,
        size: buffer.length,
      };

      jest.spyOn(imageProcessor, 'processStream').mockResolvedValue(processedResult);

      await controller.process(req as any, res as any);

      expect(queueService.add).toHaveBeenCalled();
      expect(imageProcessor.processStream).toHaveBeenCalledWith(
        expect.any(Readable),
        filePart.mimetype,
        undefined,
        undefined,
        undefined,
        expect.any(AbortSignal),
      );
      expect(res.type).toHaveBeenCalledWith('image/webp');
      expect(res.send).toHaveBeenCalledWith(processedResult.buffer);
    });

    it('should handle watermark and params', async () => {
      const filePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'image/jpeg',
        file: Readable.from([Buffer.from('main-image')]),
      };
      const watermarkPart = {
        type: 'file',
        fieldname: 'watermark',
        mimetype: 'image/png',
        file: Readable.from([Buffer.from('watermark-image')]),
      };
      const paramsPart = {
        type: 'field',
        fieldname: 'params',
        value: JSON.stringify({
          transform: {
            watermark: { mode: 'single' },
          },
        }),
      };

      const req = mockReq([filePart, watermarkPart, paramsPart]);
      const res = mockRes();
      const buffer = Buffer.from('processed');
      const processedResult = {
        buffer,
        mimeType: 'image/webp',
        extension: 'webp',
        width: 100,
        height: 100,
        size: buffer.length,
      };

      jest.spyOn(imageProcessor, 'processStream').mockResolvedValue(processedResult);

      await controller.process(req as any, res as any);

      expect(imageProcessor.processStream).toHaveBeenCalledWith(
        expect.any(Readable),
        'image/jpeg',
        expect.objectContaining({ watermark: { mode: 'single' } }),
        undefined,
        expect.objectContaining({
          buffer: Buffer.from('watermark-image'),
          mimetype: 'image/png',
        }),
        expect.any(AbortSignal),
      );
    });

    it('should throw BadRequestException if no file', async () => {
      const req = mockReq([]);
      await expect(controller.process(req as any, mockRes() as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if watermark config provided but no file', async () => {
      const filePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'image/jpeg',
        file: Readable.from([Buffer.from('main-image')]),
      };
      const paramsPart = {
        type: 'field',
        fieldname: 'params',
        value: JSON.stringify({
          transform: {
            watermark: { mode: 'single' },
          },
        }),
      };

      const req = mockReq([filePart, paramsPart]);
      await expect(controller.process(req as any, mockRes() as any)).rejects.toThrow(
        'Watermark file is required when watermark config is provided',
      );
    });

    it('should throw BadRequestException for invalid JSON params', async () => {
      const filePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'image/jpeg',
        file: Readable.from([Buffer.from('main-image')]),
      };
      const paramsPart = {
        type: 'field',
        fieldname: 'params',
        value: '{ invalid json }',
      };

      const req = mockReq([filePart, paramsPart]);
      await expect(controller.process(req as any, mockRes() as any)).rejects.toThrow(
        'Invalid params',
      );
    });

    it('should throw BadRequestException for non-whitelisted properties in params', async () => {
      const filePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'image/jpeg',
        file: Readable.from([Buffer.from('main-image')]),
      };
      const paramsPart = {
        type: 'field',
        fieldname: 'params',
        value: JSON.stringify({
          transform: {
            reisze: { width: 100 },
          },
        }),
      };

      const req = mockReq([filePart, paramsPart]);
      await expect(controller.process(req as any, mockRes() as any)).rejects.toThrow(
        'property reisze should not exist',
      );
    });

    it('should throw PayloadTooLargeException when multipart upload exceeds limit', async () => {
      const filePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'image/jpeg',
        // Exceeds 10MB limit configured in ConfigService mock
        file: Readable.from([Buffer.alloc(11 * 1024 * 1024)]),
      };

      const req = mockReq([filePart]);
      const res = mockRes();

      await expect(controller.process(req as any, res as any)).rejects.toThrow(
        PayloadTooLargeException,
      );
    });

    it('should throw BadRequestException if content-type is not multipart', async () => {
      const req = {
        headers: { 'content-type': 'application/json' },
        raw: Object.assign(Readable.from([]), { complete: true }),
      };
      await expect(controller.process(req as any, mockRes() as any)).rejects.toThrow(
        'Invalid content type, expected multipart/form-data',
      );
    });

    it('should parse x-img-params when provided as array of headers', async () => {
      const filePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'image/jpeg',
        file: Readable.from([Buffer.from('test-data')]),
      };
      const req = {
        ...mockReq([filePart]),
        headers: {
          'content-type': 'multipart/form-data',
          'x-img-params': [JSON.stringify({ priority: 1 }), JSON.stringify({ priority: 0 })],
        },
      };
      const res = mockRes();
      jest.spyOn(imageProcessor, 'processStream').mockResolvedValue({
        buffer: Buffer.from('p'),
        mimeType: 'image/webp',
        extension: 'webp',
        width: 10,
        height: 10,
        size: 1,
      });

      await controller.process(req as any, res as any);
      expect(queueService.add).toHaveBeenCalledWith(
        expect.any(Function),
        1,
        expect.any(AbortSignal),
      );
    });

    it('should wrap unexpected multipart parsing errors in BadRequestException', async () => {
      const req = {
        headers: { 'content-type': 'multipart/form-data' },
        raw: Object.assign(Readable.from([]), { complete: true }),
        parts: jest.fn().mockImplementation(() => {
          async function* gen() {
            await Promise.resolve();
            if (Date.now() > 0) {
              throw new Error('Corrupted multipart boundary');
            }
            yield undefined;
          }
          return gen();
        }),
      };
      await expect(controller.process(req as any, mockRes() as any)).rejects.toThrow(
        'Failed to process multipart payload: Corrupted multipart boundary',
      );
    });
  });

  describe('extractExif', () => {
    it('sends the extracted metadata', async () => {
      const filePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'image/jpeg',
        file: Readable.from([Buffer.from('test-data')]),
      };
      const req = mockReq([filePart]);
      const exifData = { Make: 'Canon' };

      jest.spyOn(exifService, 'extract').mockResolvedValue(exifData);

      const res = mockRes();
      await controller.extractExif(req as any, res as any);

      expect(queueService.add).toHaveBeenCalled();
      expect(exifService.extract).toHaveBeenCalledWith(Buffer.from('test-data'), filePart.mimetype);
      // The endpoint writes through the reply; a returned value would be ignored by Nest,
      // because the handler takes @Res().
      expect(res.send).toHaveBeenCalledWith({
        exif: exifData,
        width: undefined,
        height: undefined,
      });
    });

    it('should throw BadRequestException if content-type is not multipart', async () => {
      const req = {
        headers: { 'content-type': 'application/json' },
        raw: Object.assign(Readable.from([]), { complete: true }),
      };
      await expect(controller.extractExif(req as any, mockRes() as any)).rejects.toThrow(
        'Invalid content type, expected multipart/form-data',
      );
    });

    it('should throw BadRequestException if no file is uploaded', async () => {
      const req = mockReq([]);
      await expect(controller.extractExif(req as any, mockRes() as any)).rejects.toThrow(
        'No file uploaded',
      );
    });

    it('should handle exif extraction returning null / dimensions only', async () => {
      const filePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'image/jpeg',
        file: Readable.from([Buffer.from('test-data')]),
      };
      const req = mockReq([filePart]);
      jest.spyOn(exifService, 'extract').mockResolvedValue({ width: 300, height: 200 });

      const res = mockRes();
      await controller.extractExif(req as any, res as any);

      expect(res.send).toHaveBeenCalledWith({
        exif: null,
        width: 300,
        height: 200,
      });
    });

    it('should throw PayloadTooLargeException when exif multipart upload exceeds limit', async () => {
      const filePart = {
        type: 'file',
        fieldname: 'file',
        mimetype: 'image/jpeg',
        file: Readable.from([Buffer.alloc(11 * 1024 * 1024)]),
      };
      const req = mockReq([filePart]);
      const res = mockRes();

      await expect(controller.extractExif(req as any, res as any)).rejects.toThrow(
        PayloadTooLargeException,
      );
    });
  });
});
