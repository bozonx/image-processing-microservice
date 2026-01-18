import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Readable, Writable } from 'node:stream';
import { ImageProcessingController } from '../../src/modules/image-processing/image-processing.controller.js';
import { ImageProcessorService } from '../../src/modules/image-processing/services/image-processor.service.js';
import { ExifService } from '../../src/modules/image-processing/services/exif.service.js';
import { QueueService } from '../../src/modules/image-processing/services/queue.service.js';

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
      _write(_chunk: any, _encoding: string, callback: (error?: Error | null) => void) {
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
      const processedResult = {
        stream: 'processed-stream',
        mimeType: 'image/webp',
        extension: 'webp',
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
      );
      expect(res.type).toHaveBeenCalledWith('image/webp');
      expect(res.send).toHaveBeenCalledWith('processed-stream');
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
      const processedResult = {
        stream: 'processed-stream',
        mimeType: 'image/webp',
        extension: 'webp',
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
      await expect(controller.process(req as any, {} as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('extractExif', () => {
    it('should call exifService.extract and return result', async () => {
      const file = {
        mimetype: 'image/jpeg',
        file: Readable.from([Buffer.from('test-data')]),
        fields: {},
      };
      const req = mockReq([file]);
      const exifData = { Make: 'Canon' };

      jest.spyOn(exifService, 'extract').mockResolvedValue(exifData);

      const result = await controller.extractExif(req as any);

      expect(queueService.add).toHaveBeenCalled();
      expect(exifService.extract).toHaveBeenCalledWith(expect.any(Readable), file.mimetype);
      expect(result).toEqual({ exif: exifData });
    });
  });
});
