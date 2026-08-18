import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';
import { createTestApp } from './test-app.factory.js';

/**
 * These tests go over a real TCP socket instead of `app.inject`.
 *
 * `inject` synthesises a request and never drives the Node stream lifecycle, so it cannot see
 * bugs in how the handlers react to request/response stream events. A disconnect check that
 * mistook a fully-read request body for a client hang-up made every one of these endpoints hang
 * forever in production while the whole injected suite stayed green.
 */
describe('Real socket (e2e)', () => {
  let app: NestFastifyApplication;
  let baseUrl: string;
  let image: Buffer;

  beforeAll(async () => {
    image = await sharp({
      create: { width: 600, height: 400, channels: 3, background: { r: 12, g: 34, b: 56 } },
    })
      .png()
      .toBuffer();

    app = await createTestApp();
    // Port 0 lets the OS pick a free port, so parallel test workers cannot collide.
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const imageForm = (): FormData => {
    const form = new FormData();
    form.append('file', new Blob([image], { type: 'image/png' }), 'test.png');
    return form;
  };

  it('answers a multipart process request', async () => {
    const response = await fetch(`${baseUrl}/api/v1/process`, {
      method: 'POST',
      body: imageForm(),
    });

    expect(response.status).toBe(200);
    const body = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(body).metadata();
    expect(metadata.width).toBe(600);
    expect(metadata.height).toBe(400);
  }, 15000);

  it('answers a raw process request', async () => {
    const response = await fetch(`${baseUrl}/api/v1/process/raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(image),
    });

    expect(response.status).toBe(200);
    const body = Buffer.from(await response.arrayBuffer());
    expect((await sharp(body).metadata()).width).toBe(600);
  }, 15000);

  it('answers an exif request', async () => {
    const response = await fetch(`${baseUrl}/api/v1/exif`, {
      method: 'POST',
      body: imageForm(),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { width: number; height: number };
    expect(body.width).toBe(600);
    expect(body.height).toBe(400);
  }, 15000);

  it('answers a health request', async () => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    expect(response.status).toBe(200);
  }, 15000);
});
