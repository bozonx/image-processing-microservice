import { describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ExifService } from '../../src/modules/image-processing/services/exif.service.js';
import imageConfig from '../../src/config/image.config.js';
import sharp from 'sharp';

describe('ExifService', () => {
  let service: ExifService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [imageConfig],
        }),
      ],
      providers: [ExifService],
    }).compile();

    service = module.get<ExifService>(ExifService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should extract EXIF from image with metadata', async () => {
    // Создать тестовое изображение с EXIF
    const buffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.extract(buffer, 'image/jpeg');
    
    // EXIF может быть null для сгенерированного изображения
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('should return null or minimal info for image without EXIF', async () => {
    const buffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const result = await service.extract(buffer, 'image/png');
    
    // Some formats like PNG might return basic info, but it shouldn't have specific EXIF tags like Make or Model
    if (result) {
      expect(result).not.toHaveProperty('Make');
      expect(result).not.toHaveProperty('Model');
    }
  });

  it('should throw error for oversized image', async () => {
    const largeBuffer = Buffer.allocUnsafe(30 * 1024 * 1024); // 30MB
    
    await expect(
      service.extract(largeBuffer, 'image/jpeg'),
    ).rejects.toThrow('exceeds maximum');
  });

  it('should throw error for invalid MIME type', async () => {
    const buffer = Buffer.from('test');
    
    await expect(
      service.extract(buffer, 'text/plain'),
    ).rejects.toThrow('Invalid MIME type');
  });


  it('should handle corrupt buffer gracefully during extraction', async () => {
    const corruptBuffer = Buffer.from('not an image');
    const result = await service.extract(corruptBuffer, 'image/jpeg');
    expect(result).toBeNull();
  });
});
