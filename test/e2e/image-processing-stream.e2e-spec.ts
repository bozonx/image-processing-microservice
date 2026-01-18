import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './test-app.factory.js';
import sharp from 'sharp';

describe('Image Processing Streaming (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/process/stream', () => {
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

      // We need to use "standard" multipart boundary construction because
      // fastify inject doesn't automatically handle Node's native FormData serialization/boundary yet
      // without some helpers.
      // So we will construct a simple multipart body manually for the test.

      const boundary = '--------------------------testboundary';
      const crlf = '\r\n';
      
      const params = JSON.stringify({
         output: { format: 'webp', quality: 80 }
      });

      const bodyParts = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="params"`,
        '',
        params,
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="test.jpg"`,
        `Content-Type: image/jpeg`,
        '',
        inputBuffer.toString('binary'), // This is hacky for binary data in string
        `--${boundary}--`,
        ''
      ];

      // Better way: use Buffer.concat
      const header1 = Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="params"${crlf}${crlf}${params}${crlf}` +
        `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="test.jpg"${crlf}Content-Type: image/jpeg${crlf}${crlf}`
      );
      const footer = Buffer.from(`${crlf}--${boundary}--${crlf}`);
      
      const payload = Buffer.concat([header1, inputBuffer, footer]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/process/stream',
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
    });
  });

  describe('POST /api/v1/exif/stream', () => {
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
        .toBuffer(); // Default create image has no significant EXIF but it's valid JPEG

      const boundary = '--------------------------testboundary';
      const crlf = '\r\n';
      
      const header = Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="test.jpg"${crlf}Content-Type: image/jpeg${crlf}${crlf}`
      );
      const footer = Buffer.from(`${crlf}--${boundary}--${crlf}`);
      
      const payload = Buffer.concat([header, inputBuffer, footer]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/exif/stream',
         headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: payload,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Even if no exif, it should return { exif: null } or similar as per service logic (null)
      // The controller returns { exif: ... }
      expect(body).toHaveProperty('exif');
    });
  });
});
