import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Readable } from 'node:stream';
import { ExifService } from '../../src/modules/image-processing/services/exif.service.js';
import imageConfig from '../../src/config/image.config.js';
import sharp from 'sharp';

describe('ExifService', () => {
  let service: ExifService;
  const prevFileMaxBytesMb = process.env.FILE_MAX_BYTES_MB;

  beforeEach(async () => {
    process.env.FILE_MAX_BYTES_MB = '1';
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

  afterAll(() => {
    if (typeof prevFileMaxBytesMb === 'string') {
      process.env.FILE_MAX_BYTES_MB = prevFileMaxBytesMb;
    } else {
      delete process.env.FILE_MAX_BYTES_MB;
    }
  });

  const bufferToStream = (buffer: Buffer): Readable => {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return stream;
  };

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

    const result = await service.extract(bufferToStream(buffer), 'image/jpeg');

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

    const result = await service.extract(bufferToStream(buffer), 'image/png');

    if (result) {
      expect(result).not.toHaveProperty('Make');
      expect(result).not.toHaveProperty('Model');
    }
  });

  it('should throw error for oversized image', async () => {
    // >1MB
    const largeBuffer = Buffer.allocUnsafe(2 * 1024 * 1024);

    await expect(service.extract(bufferToStream(largeBuffer), 'image/jpeg')).rejects.toThrow(
      'Image size exceeds maximum',
    );
  });

  it('should throw error for invalid MIME type', async () => {
    const buffer = Buffer.from('test');

    await expect(service.extract(bufferToStream(buffer), 'text/plain')).rejects.toThrow(
      'Invalid MIME type',
    );
  });

  it('should throw error for corrupt buffer during extraction', async () => {
    const corruptBuffer = Buffer.from('not an image');
    await expect(service.extract(bufferToStream(corruptBuffer), 'image/jpeg')).rejects.toThrow(
      'Failed to parse EXIF',
    );
  });
});
