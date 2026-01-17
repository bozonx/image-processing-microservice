import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../../config/app.config.js';
import pkg from '../../../package.json' with { type: 'json' };

export const getLoggerConfig = (configService: ConfigService): Params => {
  const appConfig = configService.get<AppConfig>('app');
  if (!appConfig) {
    throw new Error('App config not found');
  }
  const isDev = appConfig.nodeEnv === 'development';

  return {
    pinoHttp: {
      level: appConfig.logLevel,
      timestamp: () => `,"@timestamp":"${new Date().toISOString()}"`,
      base: {
        service: pkg.name || 'app',
        environment: appConfig.nodeEnv,
      },
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: false,
              translateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss.l'Z'",
              ignore: 'pid,hostname',
              messageFormat: '[{context}] {msg}',
            },
          }
        : undefined,
      serializers: {
        req: req => ({
          id: req.id,
          method: req.method,
          url: req.url,
          path: req.url?.split('?')[0],
          remoteAddress: req.ip,
          remotePort: req.socket?.remotePort,
        }),
        res: res => ({
          statusCode: res.statusCode,
        }),
        err: err => ({
          type: err.type,
          message: err.message,
          stack: err.stack,
        }),
      },
      redact: {
        paths: ['req.headers.authorization', 'req.headers["x-api-key"]'],
        censor: '[REDACTED]',
      },
      customLogLevel: (req, res, err) => {
        if (res.statusCode >= 500 || err) {
          return 'error';
        }
        if (res.statusCode >= 400) {
          return 'warn';
        }
        if (res.statusCode >= 300) {
          return 'info';
        }
        return 'info';
      },
      autoLogging: {
        ignore: req => {
          if (appConfig.nodeEnv === 'production') {
            return req.url?.includes('/health') ?? false;
          }
          return false;
        },
      },
    },
  };
};
