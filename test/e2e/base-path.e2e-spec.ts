import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './test-app.factory.js';

describe('BASE_PATH (e2e)', () => {
  let app: NestFastifyApplication;
  const originalBasePath = process.env.BASE_PATH;
  const originalEnableUi = process.env.ENABLE_UI;

  beforeAll(async () => {
    process.env.BASE_PATH = '/images/';
    process.env.ENABLE_UI = 'true';
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    if (originalBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = originalBasePath;
    if (originalEnableUi === undefined) delete process.env.ENABLE_UI;
    else process.env.ENABLE_UI = originalEnableUi;
  });

  it('serves health below the normalized base path', async () => {
    const response = await app.inject({ method: 'GET', url: '/images/api/v1/health' });
    expect(response.statusCode).toBe(200);
  });

  it('serves UI below the normalized base path', async () => {
    const response = await app.inject({ method: 'GET', url: '/images/ui/index.html' });
    expect(response.statusCode).toBe(200);
  });
});
