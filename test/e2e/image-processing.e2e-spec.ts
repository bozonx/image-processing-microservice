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
    it('should process a valid image stream', async () => {
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

      const boundary = '--------------------------testboundary';
      const crlf = '\r\n';

      const params = JSON.stringify({
        output: { format: 'webp', quality: 80 },
      });

      const header1 = Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="params"${crlf}${crlf}${params}${crlf}` +
          `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="test.jpg"${crlf}Content-Type: image/jpeg${crlf}${crlf}`,
      );
      const footer = Buffer.from(`${crlf}--${boundary}--${crlf}`);

      const payload = Buffer.concat([header1, inputBuffer, footer]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: payload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');

      // Verify the response is a valid image
      const metadata = await sharp(response.rawPayload).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(100);
      expect(metadata.height).toBe(100);
      expect(metadata.width).toBe(100);
      expect(metadata.height).toBe(100);
    });

    it('should return 400 for corrupt image file', async () => {
      const boundary = '--------------------------testboundary';
      const crlf = '\r\n';

      const header = Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="corrupt.jpg"${crlf}Content-Type: image/jpeg${crlf}${crlf}`,
      );
      const corruptData = Buffer.from('this is not an image');
      const footer = Buffer.from(`${crlf}--${boundary}--${crlf}`);

      const payload = Buffer.concat([header, corruptData, footer]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: payload,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.statusCode).toBe(400);
      expect(body.message).toMatch(/Failed to process image/i);
    });

    it('should return 400 for out-of-bounds crop parameters', async () => {
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

      const boundary = '--------------------------testboundary';
      const crlf = '\r\n';

      const params = JSON.stringify({
        transform: {
          crop: { left: 50, top: 50, width: 200, height: 200 },
        },
      });

      const header1 = Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="params"${crlf}${crlf}${params}${crlf}` +
          `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="test.jpg"${crlf}Content-Type: image/jpeg${crlf}${crlf}`,
      );
      const footer = Buffer.from(`${crlf}--${boundary}--${crlf}`);

      const payload = Buffer.concat([header1, inputBuffer, footer]);

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
      expect(body.statusCode).toBe(400);
    });

    it('should return 400 for invalid flatten color string', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4,
          background: { r: 255, g: 0, b: 0, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();

      const boundary = '--------------------------testboundary';
      const crlf = '\r\n';

      const params = JSON.stringify({
        transform: {
          flatten: 'not-a-valid-color-123!!!',
        },
      });

      const header1 = Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="params"${crlf}${crlf}${params}${crlf}` +
          `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="test.png"${crlf}Content-Type: image/png${crlf}${crlf}`,
      );
      const footer = Buffer.from(`${crlf}--${boundary}--${crlf}`);

      const payload = Buffer.concat([header1, inputBuffer, footer]);

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
      expect(body.statusCode).toBe(400);
    });

    it('should return 400 for invalid resize position', async () => {
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

      const boundary = '--------------------------testboundary';
      const crlf = '\r\n';

      const params = JSON.stringify({
        transform: {
          resize: { width: 50, position: 'nonexistent_position' },
        },
      });

      const header1 = Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="params"${crlf}${crlf}${params}${crlf}` +
          `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="test.jpg"${crlf}Content-Type: image/jpeg${crlf}${crlf}`,
      );
      const footer = Buffer.from(`${crlf}--${boundary}--${crlf}`);

      const payload = Buffer.concat([header1, inputBuffer, footer]);

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
      expect(body.statusCode).toBe(400);
    });

    it('should return 400 for invalid chromaSubsampling', async () => {
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

      const boundary = '--------------------------testboundary';
      const crlf = '\r\n';

      const params = JSON.stringify({
        output: {
          format: 'jpeg',
          chromaSubsampling: 'invalid:subsampling',
        },
      });

      const header1 = Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="params"${crlf}${crlf}${params}${crlf}` +
          `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="test.jpg"${crlf}Content-Type: image/jpeg${crlf}${crlf}`,
      );
      const footer = Buffer.from(`${crlf}--${boundary}--${crlf}`);

      const payload = Buffer.concat([header1, inputBuffer, footer]);

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
      expect(body.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/process/raw', () => {
    it('should process a valid raw image stream with x-img-params header', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 0, g: 255, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const params = JSON.stringify({
        output: { format: 'webp', quality: 80 },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process/raw',
        headers: {
          'Content-Type': 'image/jpeg',
          'x-img-params': params,
        },
        payload: inputBuffer,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');

      const metadata = await sharp(response.rawPayload).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(100);
      expect(metadata.height).toBe(100);
    });
  });

  describe('POST /api/v1/exif', () => {
    it('should extract metadata from an image stream', async () => {
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

      const boundary = '--------------------------testboundary';
      const crlf = '\r\n';

      const header = Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="test.jpg"${crlf}Content-Type: image/jpeg${crlf}${crlf}`,
      );
      const footer = Buffer.from(`${crlf}--${boundary}--${crlf}`);

      const payload = Buffer.concat([header, inputBuffer, footer]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/exif',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: payload,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('exif');
    });
  });
});
