import { describe, it, expect, beforeEach } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import exifr from 'exifr';
import { ImageProcessorService } from '../../src/modules/image-processing/services/image-processor.service.js';
import imageConfig from '../../src/config/image.config.js';

import { ImageFormat } from '../../src/modules/image-processing/dto/process-image.dto.js';

describe('Double-rotation prevention with metadata (unit)', () => {
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

  it('rotates pixels to upright and clears EXIF orientation tag when preserving metadata', async () => {
    // 1. Create a 200x100 (width=200, height=100) image with EXIF orientation 6 (90° CW)
    const initialBuffer = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    // Verify input has orientation 6 and raw dimensions 200x100
    const initialMeta = await sharp(initialBuffer).metadata();
    expect(initialMeta.orientation).toBe(6);
    expect(initialMeta.width).toBe(200);
    expect(initialMeta.height).toBe(100);

    // 2. Process image with autoOrient=true and stripMetadata=false (preserve metadata)
    const result = await service.processStream(
      Readable.from(initialBuffer),
      'image/jpeg',
      { autoOrient: true },
      { format: ImageFormat.JPEG, stripMetadata: false },
    );

    // 3. Verify output dimensions: autoOrient rotates 90° CW so pixels are physically 100x200
    expect(result.width).toBe(100);
    expect(result.height).toBe(200);

    // 4. Verify output metadata: orientation tag must not remain 6 (which would double-rotate)
    const outputMeta = await sharp(result.buffer).metadata();
    expect(outputMeta.width).toBe(100);
    expect(outputMeta.height).toBe(200);
    // Sharp's metadata reader on output should report undefined or 1 (upright)
    expect(outputMeta.orientation === undefined || outputMeta.orientation === 1).toBe(true);

    // Also verify via exifr parse
    const exifTags = (await exifr.parse(result.buffer)) as Record<string, unknown> | undefined;
    if (exifTags && 'Orientation' in exifTags) {
      expect([1, 'Horizontal (normal)', undefined]).toContain(exifTags.Orientation);
    }
  });
});
