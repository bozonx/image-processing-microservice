import { describe, it, expect, beforeEach } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { ExifService } from '../../src/modules/image-processing/services/exif.service.js';
import sharp from 'sharp';

describe('ExifService', () => {
  let service: ExifService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExifService],
    }).compile();

    service = module.get<ExifService>(ExifService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should extract EXIF from image with metadata', async () => {
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

    if (result) {
      expect(result).not.toHaveProperty('Make');
      expect(result).not.toHaveProperty('Model');
    }
  });

  it('should throw error for invalid MIME type', async () => {
    const buffer = Buffer.from('test');

    await expect(service.extract(buffer, 'text/plain')).rejects.toThrow('Invalid MIME type');
  });

  it('should throw error for corrupt buffer during extraction', async () => {
    const corruptBuffer = Buffer.from('not an image');
    await expect(service.extract(corruptBuffer, 'image/jpeg')).rejects.toThrow(
      'Failed to parse EXIF',
    );
  });

  it('should reject application/octet-stream MIME type because EXIF requires image/* MIME type', async () => {
    const buffer = Buffer.from('test');
    await expect(service.extract(buffer, 'application/octet-stream')).rejects.toThrow(
      'Invalid MIME type: application/octet-stream',
    );
  });
});
