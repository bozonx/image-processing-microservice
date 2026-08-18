import { describe, it, expect, afterEach } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { ImageProcessorService } from '../../src/modules/image-processing/services/image-processor.service.js';
import {
  ImageFormat,
  type OutputDto,
  type TransformDto,
} from '../../src/modules/image-processing/dto/process-image.dto.js';
import imageConfig from '../../src/config/image.config.js';
import { withEnvVars } from '../e2e/env-helper.js';

/**
 * Builds the service with a specific limit configuration. The config factory reads the
 * environment at module-compile time, so each case compiles its own module.
 */
async function createService(): Promise<ImageProcessorService> {
  const module: TestingModule = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ load: [imageConfig] })],
    providers: [ImageProcessorService],
  }).compile();

  return module.get(ImageProcessorService);
}

const toStream = (buffer: Buffer): Readable => Readable.from(buffer);

const pngOutput: OutputDto = { format: ImageFormat.PNG };

const createImage = (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer();

/** A resize that stays within the ceiling but produces a result larger than it. */
const fitOutside: TransformDto = {
  resize: { width: 100, height: 100, fit: 'outside', withoutEnlargement: false },
};

describe('image limits', () => {
  let restoreEnv: (() => void) | undefined;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
  });

  describe('IMAGE_MAX_INPUT_PIXELS', () => {
    it('rejects an input that decodes to more pixels than allowed', async () => {
      restoreEnv = withEnvVars({ IMAGE_MAX_INPUT_PIXELS: '10000' });
      const service = await createService();
      const image = await createImage(200, 200); // 40 000 pixels

      await expect(
        service.processStream(toStream(image), 'image/png', undefined, pngOutput),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts an input within the allowance', async () => {
      restoreEnv = withEnvVars({ IMAGE_MAX_INPUT_PIXELS: '10000' });
      const service = await createService();
      const image = await createImage(50, 50); // 2 500 pixels

      const result = await service.processStream(
        toStream(image),
        'image/png',
        undefined,
        pngOutput,
      );
      expect(result.width).toBe(50);
    });
  });

  describe('IMAGE_MAX_DIMENSION', () => {
    it('rejects a requested resize larger than the ceiling', async () => {
      restoreEnv = withEnvVars({ IMAGE_MAX_DIMENSION: '100' });
      const service = await createService();
      const image = await createImage(400, 400);

      await expect(
        service.processStream(toStream(image), 'image/png', { resize: { width: 300 } }),
      ).rejects.toThrow(/exceeds the maximum allowed dimension of 100/);
    });

    it('scales an untouched image down to the ceiling', async () => {
      restoreEnv = withEnvVars({ IMAGE_MAX_DIMENSION: '100' });
      const service = await createService();
      const image = await createImage(400, 200);

      const result = await service.processStream(
        toStream(image),
        'image/png',
        undefined,
        pngOutput,
      );
      // fit: 'inside' preserves the aspect ratio rather than distorting the image.
      expect(result.width).toBe(100);
      expect(result.height).toBe(50);
    });

    it('leaves an image already within the ceiling alone', async () => {
      restoreEnv = withEnvVars({ IMAGE_MAX_DIMENSION: '100' });
      const service = await createService();
      const image = await createImage(80, 60);

      const result = await service.processStream(
        toStream(image),
        'image/png',
        undefined,
        pngOutput,
      );
      expect(result.width).toBe(80);
      expect(result.height).toBe(60);
    });

    it('honours a requested resize instead of overriding it with the ceiling', async () => {
      restoreEnv = withEnvVars({ IMAGE_MAX_DIMENSION: '100' });
      const service = await createService();
      const image = await createImage(400, 400);

      const result = await service.processStream(
        toStream(image),
        'image/png',
        { resize: { width: 40, height: 40 } },
        pngOutput,
      );
      // Sharp keeps only the last resize call, so a ceiling applied on top would silently
      // replace the caller's 40x40 with 100x100.
      expect(result.width).toBe(40);
      expect(result.height).toBe(40);
    });

    it('rejects a result pushed past the ceiling by fit: outside', async () => {
      restoreEnv = withEnvVars({ IMAGE_MAX_DIMENSION: '100' });
      const service = await createService();
      const image = await createImage(400, 200);

      await expect(
        service.processStream(toStream(image), 'image/png', fitOutside, pngOutput),
      ).rejects.toThrow(/exceeds the maximum allowed dimension of 100/);
    });

    it('applies no ceiling when the limit is disabled', async () => {
      restoreEnv = withEnvVars({ IMAGE_MAX_DIMENSION: '0' });
      const service = await createService();
      const image = await createImage(400, 400);

      const result = await service.processStream(
        toStream(image),
        'image/png',
        undefined,
        pngOutput,
      );
      expect(result.width).toBe(400);
    });
  });
});
