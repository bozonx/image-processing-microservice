import { describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { ImageProcessorService } from '../../src/modules/image-processing/services/image-processor.service.js';
import imageConfig from '../../src/config/image.config.js';
import sharp from 'sharp';

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [imageConfig],
        }),
      ],
      providers: [ImageProcessorService],
    }).compile();

    service = module.get<ImageProcessorService>(ImageProcessorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process image with default settings', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.process({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    });

    expect(result).toHaveProperty('buffer');
    expect(result).toHaveProperty('size');
    expect(result).toHaveProperty('mimeType');
    expect(result).toHaveProperty('dimensions');
    expect(result).toHaveProperty('stats');
    expect(result.mimeType).toBe('image/webp');
  });

  it('should resize image with maxDimension', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 2000,
        height: 2000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.process({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      transform: {
        resize: {
          maxDimension: 1000,
        },
      },
    });

    expect(result.dimensions.width).toBeLessThanOrEqual(1000);
    expect(result.dimensions.height).toBeLessThanOrEqual(1000);
  });

  it('should resize image with exact dimensions', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.process({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      transform: {
        resize: {
          width: 500,
          height: 500,
          fit: 'cover',
        },
      },
    });

    expect(result.dimensions.width).toBe(500);
    expect(result.dimensions.height).toBe(500);
  });

  it('should convert to different formats', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const formats = ['webp', 'avif', 'jpeg', 'png', 'gif', 'tiff'];

    for (const format of formats) {
      const result = await service.process({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        output: {
          format: format as any,
        },
      });

      expect(result.mimeType).toBe(`image/${format === 'jpeg' ? 'jpeg' : format}`);
    }
  });

  it('should strip metadata when requested', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await service.process({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      output: {
        stripMetadata: true,
      },
    });

    expect(result).toBeDefined();
  });

  it('should throw error for unsupported format', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    await expect(
      service.process({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        output: {
          format: 'invalid' as any,
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw error for conflicting resize parameters', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    await expect(
      service.process({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          resize: {
            maxDimension: 1000,
            width: 500,
          },
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw error for oversized image', async () => {
    const largeBuffer = Buffer.allocUnsafe(30 * 1024 * 1024); // 30MB
    
    await expect(
      service.process({
        image: largeBuffer.toString('base64'),
        mimeType: 'image/jpeg',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw error for invalid MIME type', async () => {
    await expect(
      service.process({
        image: Buffer.from('test').toString('base64'),
        mimeType: 'text/plain',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
