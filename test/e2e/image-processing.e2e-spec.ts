import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './test-app.factory.js';
import sharp from 'sharp';

describe('Image Processing (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/process', () => {
    it('should process a valid image', async () => {
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

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process',
        payload: {
          image: inputBuffer.toString('base64'),
          mimeType: 'image/jpeg',
          output: {
            format: 'webp',
            quality: 80,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('buffer');
      expect(body).toHaveProperty('mimeType', 'image/webp');
      expect(body.dimensions.width).toBe(100);
      expect(body.dimensions.height).toBe(100);
    });

    it('should return 400 for invalid request body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process',
        payload: {
          image: 'not_an_image',
          // missing mimeType
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/exif', () => {
    it('should extract metadata from a valid image', async () => {
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

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/exif',
        payload: {
          image: inputBuffer.toString('base64'),
          mimeType: 'image/jpeg',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('exif');
    });
  });
});
