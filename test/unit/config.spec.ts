import { describe, it, expect } from '@jest/globals';
import { validateConfig } from '../../src/config/validate-config.js';
import { AppConfig } from '../../src/config/app.config.js';

describe('config & validation (unit)', () => {
  describe('validateConfig', () => {
    it('returns an instantiated and validated config when input is valid', () => {
      const validPlain = {
        enableUi: false,
        port: 3000,
        host: '127.0.0.1',
        basePath: '',
        nodeEnv: 'test',
        logLevel: 'info',
        shutdownDrainSeconds: 0,
        shutdownForceExitSeconds: 5,
      };

      const result = validateConfig(AppConfig, validPlain, 'TestApp');
      expect(result).toBeInstanceOf(AppConfig);
      expect(result.port).toBe(3000);
      expect(result.nodeEnv).toBe('test');
    });

    it('throws descriptive error when validation constraints fail', () => {
      const invalidPlain = {
        enableUi: 'not-a-boolean',
        port: 70000, // exceeds 65535
        host: '127.0.0.1',
        basePath: '',
        nodeEnv: 'invalid-env',
        logLevel: 'invalid-level',
        shutdownDrainSeconds: -1,
        shutdownForceExitSeconds: 0,
      };

      expect(() => validateConfig(AppConfig, invalidPlain, 'TestApp')).toThrow(
        /TestApp config validation error:/,
      );
    });

    it('throws error when required properties are missing', () => {
      expect(() => validateConfig(AppConfig, {}, 'TestApp')).toThrow(
        /TestApp config validation error:/,
      );
    });
  });

  describe('AppConfig constraint checks', () => {
    const baseValid = {
      enableUi: true,
      port: 8080,
      host: '0.0.0.0',
      basePath: '/test',
      nodeEnv: 'production',
      logLevel: 'warn',
      shutdownDrainSeconds: 5,
      shutdownForceExitSeconds: 10,
    };

    it('accepts valid boundary values', () => {
      expect(validateConfig(AppConfig, { ...baseValid, port: 1 }, 'App').port).toBe(1);
      expect(validateConfig(AppConfig, { ...baseValid, port: 65535 }, 'App').port).toBe(65535);
      expect(
        validateConfig(AppConfig, { ...baseValid, shutdownDrainSeconds: 0 }, 'App')
          .shutdownDrainSeconds,
      ).toBe(0);
      expect(
        validateConfig(AppConfig, { ...baseValid, shutdownDrainSeconds: 300 }, 'App')
          .shutdownDrainSeconds,
      ).toBe(300);
      expect(
        validateConfig(AppConfig, { ...baseValid, shutdownForceExitSeconds: 1 }, 'App')
          .shutdownForceExitSeconds,
      ).toBe(1);
      expect(
        validateConfig(AppConfig, { ...baseValid, shutdownForceExitSeconds: 300 }, 'App')
          .shutdownForceExitSeconds,
      ).toBe(300);
    });

    it('rejects port 0 or > 65535', () => {
      expect(() => validateConfig(AppConfig, { ...baseValid, port: 0 }, 'App')).toThrow();
      expect(() => validateConfig(AppConfig, { ...baseValid, port: 65536 }, 'App')).toThrow();
    });

    it('rejects invalid nodeEnv', () => {
      expect(() => validateConfig(AppConfig, { ...baseValid, nodeEnv: 'staging' }, 'App')).toThrow(
        /nodeEnv must be one of the following values/,
      );
    });

    it('rejects invalid logLevel', () => {
      expect(() => validateConfig(AppConfig, { ...baseValid, logLevel: 'verbose' }, 'App')).toThrow(
        /logLevel must be one of the following values/,
      );
    });
  });
});
