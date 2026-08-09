import { jest } from '@jest/globals';
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
            add: jest.fn((task: () => Promise<any>) => task()),
            getStatus: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: unknown) => {
              if (key === 'image') {
                return { maxBytes: 10 * 1024 * 1024 };
              }
              return undefined;
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
    raw: Readable.from([]),
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
      constructor() {
        super();
        setTimeout(() => {
          this.end();
        }, 0);
      }
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
      const req = {
        headers: { 'content-type': 'application/octet-stream' },
        raw: Readable.from([Buffer.from('test-data')]),
      };
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

      jest.spyOn(imageProcessor, 'processStream').mockResolvedValue(processedResult as any);

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
      const req = {
        headers: { 'content-type': 'text/plain' },
        raw: Readable.from([Buffer.from('x')]),
      };
      await expect(controller.processRaw(req as any, {} as any)).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
    });

    it('should propagate original error when processStream fails (not mask as abort)', async () => {
      const req = {
        headers: { 'content-type': 'image/jpeg' },
        raw: Readable.from([Buffer.from('corrupt-image-data')]),
      };
      const res = mockRes();

      const originalError = new Error('Input buffer contains unsupported image format');
      jest.spyOn(imageProcessor, 'processStream').mockRejectedValue(originalError);

      await expect(controller.processRaw(req as any, res as any)).rejects.toThrow(
        'Input buffer contains unsupported image format',
      );
    });

    it('should silently handle abort when client disconnects', async () => {
      const req = {
        headers: { 'content-type': 'image/jpeg' },
        raw: Readable.from([Buffer.from('test-data')]),
      };
      const res = mockRes();

      // Simulate p-queue behavior: reject with abort error when signal aborts
      jest.spyOn(queueService, 'add').mockImplementation(async (task: () => Promise<any>, _priority?: number, signal?: AbortSignal) => {
        if (signal?.aborted) {
          throw new Error('The operation was aborted');
        }
        return new Promise((resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new Error('The operation was aborted'));
          }, { once: true });
          task().then(resolve, reject);
        });
      });

      // Simulate client disconnect by aborting after a tick
      jest.spyOn(imageProcessor, 'processStream').mockImplementation(async (_input, _mime, _t, _o, _w, signal) => {
        // Wait a tick so the abort can fire
        await new Promise(r => setTimeout(r, 10));
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
        } as any;
      });

      // Trigger abort by emitting 'close' on res.raw before processing completes
      setTimeout(() => {
        res.raw.emit('close');
      }, 5);

      await expect(controller.processRaw(req as any, res as any)).resolves.toBeUndefined();
    });

    it('should throw 413 when payload exceeds limit', async () => {
      const req = {
        headers: { 'content-type': 'image/jpeg' },
        raw: Readable.from([Buffer.alloc(11 * 1024 * 1024)]),
      };
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
        } as any;
      });

      await expect(controller.processRaw(req as any, res as any)).rejects.toThrow(
        PayloadTooLargeException,
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

      jest.spyOn(imageProcessor, 'processStream').mockResolvedValue(processedResult as any);

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

      jest.spyOn(imageProcessor, 'processStream').mockResolvedValue(processedResult as any);

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
      await expect(controller.process(req as any, {} as any)).rejects.toThrow(BadRequestException);
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
      await expect(controller.process(req as any, {} as any)).rejects.toThrow(
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
      await expect(controller.process(req as any, {} as any)).rejects.toThrow('Invalid params');
    });
  });

  describe('extractExif', () => {
    it('should call exifService.extract and return result', async () => {
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
      const result = await controller.extractExif(req as any, res as any);

      expect(queueService.add).toHaveBeenCalled();
      expect(exifService.extract).toHaveBeenCalledWith(Buffer.from('test-data'), filePart.mimetype);
      expect(result).toEqual({ exif: exifData, width: undefined, height: undefined });
    });
  });
});
