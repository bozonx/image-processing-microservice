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

  const mockFile = (fields = {}) => ({
    file: 'mock-stream',
    mimetype: 'image/jpeg',
    fields,
  });

  const mockReq = (fileData: any, headers: Record<string, string> = { 'content-type': 'multipart/form-data' }) => ({
    headers,
    file: jest.fn<() => Promise<any>>().mockResolvedValue(fileData),
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
      const file = {
        ...mockFile(),
        file: Readable.from([Buffer.from('test-data')]),
      };
      const req = mockReq(file);
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
        file.mimetype,
        undefined,
        undefined,
      );
      expect(res.type).toHaveBeenCalledWith('image/webp');
      expect(res.send).toHaveBeenCalledWith('processed-stream');
    });

    it('should throw BadRequestException if no file', async () => {
      const req = mockReq(null);
      await expect(controller.process(req as any, {} as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('extractExif', () => {
    it('should call exifService.extract and return result', async () => {
      const file = {
        ...mockFile(),
        file: Readable.from([Buffer.from('test-data')]),
      };
      const req = mockReq(file);
      const exifData = { Make: 'Canon' };

      jest.spyOn(exifService, 'extract').mockResolvedValue(exifData);

      const result = await controller.extractExif(req as any);

      expect(queueService.add).toHaveBeenCalled();
      expect(exifService.extract).toHaveBeenCalledWith(expect.any(Readable), file.mimetype);
      expect(result).toEqual({ exif: exifData });
    });
  });
});
