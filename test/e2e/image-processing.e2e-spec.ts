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

    it('should handle corrupt image file', async () => {
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

      // The server might return 500 or the stream might just error out.
      // Since we are validating edge cases, we want to know what happens.
      // Typically, if the stream errors during transmission, the status code might be 200 (headers already sent)
      // but the body incomplete. Or if it fails early, it's 500.
      // Given our implementation (failOnError: false in sharp, but then we consume stream),
      // let's see. Sharp might error when trying to output, which happens when 'res.send' piping starts.
      // Fastify might handle stream error.

      // For now, let's just assert it doesn't crash the server (which we can't easily check here effectively
      // without subsequent requests, but the test runner handles it).

      // We expect either a 500 (standard unhandled exception if caught early) or
      // maybe a 200 but with broken body.
      // However, usually API should return 400 for bad input if possible.
      // But since we stream, we might not know it's bad until we process it.

      // Let's just log status and expect it to NOT be 200 OR if it is 200, the body should not be a valid image.

      if (response.statusCode === 200) {
        // Attempt to parse result - should fail
        await expect(sharp(response.rawPayload).metadata()).rejects.toThrow();
      } else {
        expect(response.statusCode).toBeGreaterThanOrEqual(400);
      }
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
