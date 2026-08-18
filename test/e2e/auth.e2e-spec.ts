import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from './test-app.factory.js';
import { withEnvVars } from './env-helper.js';

function createBasicHeader(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
}

describe('Auth (e2e)', () => {
  let app: NestFastifyApplication | undefined;
  let restoreEnv: (() => void) | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    restoreEnv?.();
    restoreEnv = undefined;
  });

  describe('no auth configured', () => {
    beforeEach(async () => {
      restoreEnv = withEnvVars({
        AUTH_BASIC_USER: '',
        AUTH_BASIC_PASS: '',
        AUTH_BEARER_TOKENS: '',
        ENABLE_UI: 'true',
      });
      app = await createTestApp();
    });

    it('allows the API without authorization', async () => {
      const response = await app!.inject({ method: 'GET', url: '/api/v1/health' });
      expect(response.statusCode).toBe(200);
    });

    it('serves the demo UI', async () => {
      const response = await app!.inject({ method: 'GET', url: '/ui/index.html' });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('basic configured', () => {
    const user = 'user1';
    const pass = 'pass1';

    beforeEach(async () => {
      restoreEnv = withEnvVars({
        AUTH_BASIC_USER: user,
        AUTH_BASIC_PASS: pass,
        AUTH_BEARER_TOKENS: '',
        ENABLE_UI: 'false',
      });
      app = await createTestApp();
    });

    it('keeps health public so probes keep working', async () => {
      const response = await app!.inject({ method: 'GET', url: '/api/v1/health' });
      expect(response.statusCode).toBe(200);
    });

    it('keeps health public with a trailing slash', async () => {
      const response = await app!.inject({ method: 'GET', url: '/api/v1/health/' });
      expect(response.statusCode).not.toBe(401);
    });

    it('accepts correct credentials', async () => {
      const response = await app!.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { authorization: createBasicHeader(user, pass) },
      });
      expect(response.statusCode).toBe(200);
    });

    it('rejects a wrong password and offers the Basic challenge', async () => {
      const response = await app!.inject({
        method: 'POST',
        url: '/api/v1/exif',
        headers: { authorization: createBasicHeader(user, 'wrong') },
      });
      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toContain('Basic');
    });

    it('rejects an unauthenticated request to a protected route', async () => {
      const response = await app!.inject({ method: 'POST', url: '/api/v1/exif' });
      expect(response.statusCode).toBe(401);
    });

    it('guards routes outside the api prefix, so a new route is closed by default', async () => {
      const response = await app!.inject({ method: 'GET', url: '/metrics' });
      expect(response.statusCode).toBe(401);
    });

    it('does not let a query string bypass the guard', async () => {
      const response = await app!.inject({ method: 'GET', url: '/anything?x=1' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('named bearer tokens configured', () => {
    beforeEach(async () => {
      restoreEnv = withEnvVars({
        AUTH_BASIC_USER: '',
        AUTH_BASIC_PASS: '',
        AUTH_BEARER_TOKENS: 'svc-one:token-one, svc-two:token-two',
        ENABLE_UI: 'false',
      });
      app = await createTestApp();
    });

    it('keeps health public so probes keep working', async () => {
      const response = await app!.inject({ method: 'GET', url: '/api/v1/health' });
      expect(response.statusCode).toBe(200);
    });

    it('accepts any configured token', async () => {
      const response = await app!.inject({
        method: 'GET',
        url: '/api/v1/health',
        headers: { authorization: 'Bearer token-two' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('rejects a wrong token', async () => {
      const response = await app!.inject({
        method: 'POST',
        url: '/api/v1/exif',
        headers: { authorization: 'Bearer nope' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects the caller name presented as the credential', async () => {
      const response = await app!.inject({
        method: 'POST',
        url: '/api/v1/exif',
        headers: { authorization: 'Bearer svc-one:token-one' },
      });
      // The name is configuration, not a credential: only the secret half authenticates.
      expect(response.statusCode).toBe(401);
    });
  });

  describe('invalid configuration', () => {
    it('refuses to start when a bearer entry has no caller name', async () => {
      restoreEnv = withEnvVars({
        AUTH_BASIC_USER: '',
        AUTH_BASIC_PASS: '',
        AUTH_BEARER_TOKENS: 'nameless-token',
        ENABLE_UI: 'false',
      });
      await expect(createTestApp()).rejects.toThrow('AUTH_BEARER_TOKENS entry #1');
    });

    it('refuses to start when the demo UI is combined with authentication', async () => {
      restoreEnv = withEnvVars({
        AUTH_BASIC_USER: '',
        AUTH_BASIC_PASS: '',
        AUTH_BEARER_TOKENS: 'svc-one:token-one',
        ENABLE_UI: 'true',
      });
      await expect(createTestApp()).rejects.toThrow('ENABLE_UI=true');
    });

    it('refuses to start when only half of the Basic pair is set', async () => {
      restoreEnv = withEnvVars({
        AUTH_BASIC_USER: 'user1',
        AUTH_BASIC_PASS: '',
        AUTH_BEARER_TOKENS: '',
        ENABLE_UI: 'false',
      });
      await expect(createTestApp()).rejects.toThrow('must be set together');
    });
  });
});
