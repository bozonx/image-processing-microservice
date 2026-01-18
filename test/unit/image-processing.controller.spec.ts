import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
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

  const mockReq = (fileData: any) => ({
    file: jest.fn().mockResolvedValue(fileData),
  });

  const mockRes = () => ({
    type: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('process', () => {
    it('should call imageProcessor.processStream and return stream', async () => {
      const file = mockFile();
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
        file.file,
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
      const file = mockFile();
      const req = mockReq(file);
      const exifData = { Make: 'Canon' };

      jest.spyOn(exifService, 'extract').mockResolvedValue(exifData);

      const result = await controller.extractExif(req as any);

      expect(queueService.add).toHaveBeenCalled();
      expect(exifService.extract).toHaveBeenCalledWith(file.file, file.mimetype);
      expect(result).toEqual({ exif: exifData });
    });
  });
});
