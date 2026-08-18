import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './test-app.factory.js';
import sharp from 'sharp';

describe('Watermark (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const createTestImage = (
    width: number,
    height: number,
    color: { r: number; g: number; b: number },
  ) => {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: color,
      },
    })
      .png()
      .toBuffer();
  };

  const createMultipartPayload = (
    boundary: string,
    fileBuffer: Buffer,
    watermarkBuffer: Buffer | null,
    paramsObj: any,
  ) => {
    const crlf = '\r\n';
    const chunks: Buffer[] = [];

    // File field
    chunks.push(
      Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="main-image.png"${crlf}Content-Type: image/png${crlf}${crlf}`,
      ),
    );
    chunks.push(fileBuffer);
    chunks.push(Buffer.from(crlf));

    // Watermark field
    if (watermarkBuffer) {
      chunks.push(
        Buffer.from(
          `--${boundary}${crlf}Content-Disposition: form-data; name="watermark"; filename="watermark.png"${crlf}Content-Type: image/png${crlf}${crlf}`,
        ),
      );
      chunks.push(watermarkBuffer);
      chunks.push(Buffer.from(crlf));
    }

    // Params field
    chunks.push(
      Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="params"${crlf}${crlf}${JSON.stringify(paramsObj)}${crlf}`,
      ),
    );

    chunks.push(Buffer.from(`--${boundary}--${crlf}`));

    return Buffer.concat(chunks);
  };

  describe('POST /api/v1/process with Watermark', () => {
    it('should apply a single watermark at the default position (southeast)', async () => {
      // White background
      const mainImage = await createTestImage(500, 500, { r: 255, g: 255, b: 255 });
      // Blue square
      const watermark = await createTestImage(100, 100, { r: 0, g: 0, b: 255 });

      const boundary = '--------------------------watermarktest';
      const params = {
        transform: {
          watermark: {
            mode: 'single',
            // 20% of 500 = 100px
            scale: 20,
            opacity: 1,
            position: 'southeast',
          },
        },
        output: { format: 'png' },
      };

      const payload = createMultipartPayload(boundary, mainImage, watermark, params);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');

      // Basic validation of the resulting image
      const resultMetadata = await sharp(response.rawPayload).metadata();
      expect(resultMetadata.width).toBe(500);
      expect(resultMetadata.height).toBe(500);
    });

    it('should apply tiled watermark across the image', async () => {
      const mainImage = await createTestImage(200, 200, { r: 255, g: 255, b: 255 });
      // Red square
      const watermark = await createTestImage(20, 20, { r: 255, g: 0, b: 0 });

      const boundary = '--------------------------watermarktest';
      const params = {
        transform: {
          watermark: {
            mode: 'tile',
            // 10% of 200 = 20px
            scale: 10,
            opacity: 0.5,
            spacing: 10,
          },
        },
        output: { format: 'png' },
      };

      const payload = createMultipartPayload(boundary, mainImage, watermark, params);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(response.statusCode).toBe(200);

      const resultMetadata = await sharp(response.rawPayload).metadata();
      expect(resultMetadata.width).toBe(200);
      expect(resultMetadata.height).toBe(200);
    });

    it('should apply SVG watermark', async () => {
      // Black background
      const mainImage = await createTestImage(200, 200, { r: 0, g: 0, b: 0 });
      const svgWatermark = Buffer.from(
        '<svg width="100" height="100"><rect width="100" height="100" fill="white"/></svg>',
      );

      const boundary = '--------------------------watermarktest';
      const params = {
        transform: {
          watermark: {
            mode: 'single',
            scale: 50,
            opacity: 1,
            position: 'center',
          },
        },
        output: { format: 'png' },
      };

      // Construct multipart manually because of SVG content type
      const crlf = '\r\n';
      const payload = Buffer.concat([
        Buffer.from(
          `--${boundary}${crlf}Content-Disposition: form-data; name="params"${crlf}${crlf}${JSON.stringify(params)}${crlf}`,
        ),
        Buffer.from(
          `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="main-image.png"${crlf}Content-Type: image/png${crlf}${crlf}`,
        ),
        mainImage,
        Buffer.from(crlf),
        Buffer.from(
          `--${boundary}${crlf}Content-Disposition: form-data; name="watermark"; filename="watermark.svg"${crlf}Content-Type: image/svg+xml${crlf}${crlf}`,
        ),
        svgWatermark,
        Buffer.from(crlf),
        Buffer.from(`--${boundary}--${crlf}`),
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      const resultMetadata = await sharp(response.rawPayload).metadata();
      expect(resultMetadata.width).toBe(200);
    });

    it('should fail if watermark params are provided but no watermark file is uploaded', async () => {
      const mainImage = await createTestImage(100, 100, { r: 255, g: 255, b: 255 });
      const boundary = '--------------------------watermarktest';
      const params = {
        transform: {
          watermark: {
            mode: 'single',
          },
        },
        output: { format: 'png' },
      };

      const payload = createMultipartPayload(boundary, mainImage, null, params);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      // Based on controller logic, it should return 400 Bad Request
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toMatch(/Watermark file is required/i);
    });

    it('should scale watermark relative to resized dimensions when transform.resize is specified', async () => {
      const mainImage = await createTestImage(1000, 1000, { r: 255, g: 255, b: 255 });
      const watermark = await createTestImage(200, 200, { r: 0, g: 0, b: 255 });

      const boundary = '--------------------------watermarktest';
      const params = {
        transform: {
          resize: {
            width: 100,
            height: 100,
          },
          watermark: {
            mode: 'single',
            scale: 50,
          },
        },
        output: { format: 'png' },
      };

      const payload = createMultipartPayload(boundary, mainImage, watermark, params);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      const resultMetadata = await sharp(response.rawPayload).metadata();
      expect(resultMetadata.width).toBe(100);
      expect(resultMetadata.height).toBe(100);
    });

    it('should return 400 when tiled watermark tile count exceeds limit', async () => {
      // Kept under IMAGE_MAX_INPUT_PIXELS so this exercises the tile limit and not the pixel
      // limit: a thin watermark still produces far more tiles than the cap allows.
      const mainImage = await createTestImage(4000, 4000, { r: 255, g: 255, b: 255 });
      const watermark = await createTestImage(2000, 10, { r: 0, g: 0, b: 255 });

      const boundary = '--------------------------watermarktest';
      const params = {
        transform: {
          watermark: {
            mode: 'tile',
            scale: 1,
          },
        },
        output: { format: 'png' },
      };

      const payload = createMultipartPayload(boundary, mainImage, watermark, params);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toMatch(/exceeds limit/i);
    });

    it('should process small 10x10 image with watermark scale 1% without error', async () => {
      const mainImage = await createTestImage(10, 10, { r: 255, g: 255, b: 255 });
      const watermark = await createTestImage(50, 50, { r: 0, g: 0, b: 255 });

      const boundary = '--------------------------watermarktest';
      const params = {
        transform: {
          watermark: {
            mode: 'single',
            scale: 1,
          },
        },
        output: { format: 'png' },
      };

      const payload = createMultipartPayload(boundary, mainImage, watermark, params);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        payload,
      });

      expect(response.statusCode).toBe(200);
      const resultMetadata = await sharp(response.rawPayload).metadata();
      expect(resultMetadata.width).toBe(10);
      expect(resultMetadata.height).toBe(10);
    });
  });
});
