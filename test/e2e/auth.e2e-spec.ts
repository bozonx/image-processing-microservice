import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './test-app.factory.js';

function createBasicHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
}

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication;

  const originalEnv = {
    AUTH_BASIC_USER: process.env.AUTH_BASIC_USER,
    AUTH_BASIC_PASS: process.env.AUTH_BASIC_PASS,
    AUTH_BEARER_TOKENS: process.env.AUTH_BEARER_TOKENS,
  };

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    process.env.AUTH_BASIC_USER = originalEnv.AUTH_BASIC_USER;
    process.env.AUTH_BASIC_PASS = originalEnv.AUTH_BASIC_PASS;
    process.env.AUTH_BEARER_TOKENS = originalEnv.AUTH_BEARER_TOKENS;
  });

  describe('no auth configured', () => {
    beforeEach(async () => {
      delete process.env.AUTH_BASIC_USER;
      delete process.env.AUTH_BASIC_PASS;
      delete process.env.AUTH_BEARER_TOKENS;

      app = await createTestApp();
    });

    it('allows API without authorization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(200);
    });

    it('allows UI without authorization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ui/index.html',
      });

      // UI static might not be registered in tests; accept 200 or 404, but not 401
      expect([200, 404]).toContain(response.statusCode);
    });
  });

  describe('basic configured', () => {
    const user = 'user1';
    const pass = 'pass1';

    beforeEach(async () => {
      process.env.AUTH_BASIC_USER = user;
      process.env.AUTH_BASIC_PASS = pass;
      delete process.env.AUTH_BEARER_TOKENS;

      app = await createTestApp();
    });

    it('rejects API without authorization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(401);
    });

    it('allows API with correct basic authorization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: {
          authorization: createBasicHeader(user, pass),
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('rejects UI without basic authorization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ui/index.html',
      });

      expect(response.statusCode).toBe(401);
    });

    it('allows UI with correct basic authorization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ui/index.html',
        headers: {
          authorization: createBasicHeader(user, pass),
        },
      });

      // UI static might not be registered in tests; accept 200 or 404, but not 401
      expect([200, 404]).toContain(response.statusCode);
    });
  });

  describe('bearer configured (bearer-only)', () => {
    const token1 = 'token1';

    beforeEach(async () => {
      delete process.env.AUTH_BASIC_USER;
      delete process.env.AUTH_BASIC_PASS;
      process.env.AUTH_BEARER_TOKENS = `${token1}, token2`;

      app = await createTestApp();
    });

    it('rejects API without authorization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(401);
    });

    it('allows API with correct bearer token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: {
          authorization: `Bearer ${token1}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('does not require auth for UI when only bearer is configured', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/ui/index.html',
      });

      // UI static might not be registered in tests; accept 200 or 404, but not 401
      expect([200, 404]).toContain(response.statusCode);
    });
  });
});
