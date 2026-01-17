import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
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
            process: jest.fn(),
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('process', () => {
    it('should call imageProcessor.process and return result', async () => {
      const dto = { image: 'base64', mimeType: 'image/jpeg' };
      const processedResult = {
        buffer: Buffer.from('result'),
        size: 6,
        mimeType: 'image/webp',
        dimensions: { width: 100, height: 100 },
        stats: { beforeBytes: 10, afterBytes: 6, reductionPercent: 40 },
      };

      jest.spyOn(imageProcessor, 'process').mockResolvedValue(processedResult);

      const result = await controller.process(dto as any);

      expect(queueService.add).toHaveBeenCalled();
      expect(imageProcessor.process).toHaveBeenCalledWith(dto);
      expect(result).toEqual({
        ...processedResult,
        buffer: processedResult.buffer.toString('base64'),
      });
    });
  });

  describe('extractExif', () => {
    it('should call exifService.extract and return result', async () => {
      const dto = { image: 'base64', mimeType: 'image/jpeg' };
      const exifData = { Make: 'Canon' };

      jest.spyOn(exifService, 'extract').mockResolvedValue(exifData);

      const result = await controller.extractExif(dto as any);

      expect(queueService.add).toHaveBeenCalled();
      expect(exifService.extract).toHaveBeenCalled();
      expect(result).toEqual({ exif: exifData });
    });
  });
});
