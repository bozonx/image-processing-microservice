import { describe, it, expect } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { getLoggerConfig } from '../../src/common/logger/logger.factory.js';
import type { AppConfig } from '../../src/config/app.config.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../../src/config/service-info.js';

describe('logger.factory (unit)', () => {
  const createMockConfigService = (overrides?: Partial<AppConfig>): ConfigService => {
    const appConfig: AppConfig = {
      enableUi: false,
      port: 8080,
      host: '0.0.0.0',
      basePath: '',
      nodeEnv: 'production',
      logLevel: 'info',
      shutdownDrainSeconds: 5,
      shutdownForceExitSeconds: 10,
      ...overrides,
    };

    return {
      getOrThrow: () => appConfig,
    } as unknown as ConfigService;
  };

  it('configures pinoHttp with production defaults', () => {
    const configService = createMockConfigService({ nodeEnv: 'production', logLevel: 'warn' });
    const params = getLoggerConfig(configService);
    const pinoHttp = params.pinoHttp as any;

    expect(pinoHttp.level).toBe('warn');
    expect(pinoHttp.base).toEqual({
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      environment: 'production',
    });
    expect(pinoHttp.transport).toBeUndefined();
    expect(pinoHttp.timestamp()).toMatch(/^,"@timestamp":"\d{4}-\d{2}-\d{2}T.*Z"$/);
  });

  it('configures pino-pretty transport in development mode', () => {
    const configService = createMockConfigService({ nodeEnv: 'development' });
    const params = getLoggerConfig(configService);
    const pinoHttp = params.pinoHttp as any;

    expect(pinoHttp.transport).toBeDefined();
    expect(pinoHttp.transport.target).toBe('pino-pretty');
    expect(pinoHttp.transport.options.colorize).toBe(true);
  });

  describe('serializers', () => {
    it('serializes req stripping query params from path and extracting connection info', () => {
      const configService = createMockConfigService();
      const params = getLoggerConfig(configService);
      const { req } = (params.pinoHttp as any).serializers;

      const mockReq = {
        id: 'req-123',
        method: 'POST',
        url: '/api/v1/process?debug=true&format=webp',
        ip: '192.168.1.1',
        socket: { remotePort: 54321 },
      };

      expect(req(mockReq)).toEqual({
        id: 'req-123',
        method: 'POST',
        url: '/api/v1/process?debug=true&format=webp',
        path: '/api/v1/process',
        remoteAddress: '192.168.1.1',
        remotePort: 54321,
      });
    });

    it('serializes res extracting statusCode', () => {
      const configService = createMockConfigService();
      const params = getLoggerConfig(configService);
      const { res } = (params.pinoHttp as any).serializers;

      expect(res({ statusCode: 200 })).toEqual({ statusCode: 200 });
      expect(res({ statusCode: 404 })).toEqual({ statusCode: 404 });
    });

    it('serializes err extracting type, message, and stack', () => {
      const configService = createMockConfigService();
      const params = getLoggerConfig(configService);
      const { err } = (params.pinoHttp as any).serializers;

      const mockErr = {
        type: 'BadRequestException',
        message: 'Invalid MIME type',
        stack: 'Error at ...',
      };

      expect(err(mockErr)).toEqual({
        type: 'BadRequestException',
        message: 'Invalid MIME type',
        stack: 'Error at ...',
      });
    });
  });

  describe('customProps', () => {
    it('extracts authClient from request', () => {
      const configService = createMockConfigService();
      const params = getLoggerConfig(configService);
      const customProps = (params.pinoHttp as any).customProps;

      expect(customProps({ authClient: 'service-a' })).toEqual({ client: 'service-a' });
      expect(customProps({})).toEqual({ client: undefined });
    });
  });

  describe('customLogLevel', () => {
    it('returns "error" for status >= 500 or when error is passed', () => {
      const configService = createMockConfigService();
      const params = getLoggerConfig(configService);
      const customLogLevel = (params.pinoHttp as any).customLogLevel;

      expect(customLogLevel({}, { statusCode: 500 }, null)).toBe('error');
      expect(customLogLevel({}, { statusCode: 503 }, null)).toBe('error');
      expect(customLogLevel({}, { statusCode: 200 }, new Error('Something failed'))).toBe('error');
    });

    it('returns "warn" for status >= 400 and < 500', () => {
      const configService = createMockConfigService();
      const params = getLoggerConfig(configService);
      const customLogLevel = (params.pinoHttp as any).customLogLevel;

      expect(customLogLevel({}, { statusCode: 400 }, null)).toBe('warn');
      expect(customLogLevel({}, { statusCode: 404 }, null)).toBe('warn');
      expect(customLogLevel({}, { statusCode: 429 }, null)).toBe('warn');
    });

    it('returns "info" for successful status codes (< 400)', () => {
      const configService = createMockConfigService();
      const params = getLoggerConfig(configService);
      const customLogLevel = (params.pinoHttp as any).customLogLevel;

      expect(customLogLevel({}, { statusCode: 200 }, null)).toBe('info');
      expect(customLogLevel({}, { statusCode: 204 }, null)).toBe('info');
      expect(customLogLevel({}, { statusCode: 304 }, null)).toBe('info');
    });
  });

  describe('autoLogging.ignore', () => {
    it('ignores health route in production (including with query params)', () => {
      const configService = createMockConfigService({ nodeEnv: 'production', basePath: '' });
      const params = getLoggerConfig(configService);
      const ignore = (params.pinoHttp as any).autoLogging.ignore;

      expect(ignore({ url: '/api/v1/health' })).toBe(true);
      expect(ignore({ url: '/api/v1/health?check=1' })).toBe(true);
      expect(ignore({ url: '/api/v1/process' })).toBe(false);
      expect(ignore({ url: '/api/v1/health-check' })).toBe(false);
    });

    it('honours basePath when checking health route in production', () => {
      const configService = createMockConfigService({
        nodeEnv: 'production',
        basePath: '/my-service',
      });
      const params = getLoggerConfig(configService);
      const ignore = (params.pinoHttp as any).autoLogging.ignore;

      expect(ignore({ url: '/my-service/api/v1/health' })).toBe(true);
      expect(ignore({ url: '/api/v1/health' })).toBe(false);
    });

    it('does not ignore health route in development', () => {
      const configService = createMockConfigService({ nodeEnv: 'development', basePath: '' });
      const params = getLoggerConfig(configService);
      const ignore = (params.pinoHttp as any).autoLogging.ignore;

      expect(ignore({ url: '/api/v1/health' })).toBe(false);
    });
  });
});
