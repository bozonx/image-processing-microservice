import 'reflect-metadata';
/**
 * Unit tests global setup
 *
 * Network handling:
 * - External network calls are blocked via nock to ensure test isolation
 * - Localhost connections are allowed for local adapters
 * - All nock interceptors are cleaned after each test
 *
 * Timeout:
 * - Global timeout for unit tests is configured in jest.config.js (5 seconds)
 * - Override per-test if needed using jest.setTimeout() or passing timeout as third arg to it()
 */

import nock from 'nock';
import { beforeAll, afterEach, afterAll } from '@jest/globals';

// Block all external network calls; allow localhost for tests that use local adapters
beforeAll(() => {
  nock.disableNetConnect();
  nock.enableNetConnect('127.0.0.1');
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});

// The application's own log lines are not what these tests assert on, and pino writes them
// straight to stdout. Export LOG_LEVEL to see them: `LOG_LEVEL=debug pnpm test`.
process.env.LOG_LEVEL ??= 'silent';
