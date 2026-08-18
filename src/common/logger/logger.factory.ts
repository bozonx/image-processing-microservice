import type { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';
import type { AppConfig } from '../../config/app.config.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../../config/service-info.js';
import { buildApiPrefix } from '../http/api-prefix.js';

/**
 * Builds the nestjs-pino configuration for the running environment.
 *
 * Kept out of `app.module.ts` so the module file stays a wiring declaration: this factory is
 * where the fleet-wide logging contract lives — JSON in production, `pino-pretty` in
 * development, ISO-8601 under `@timestamp`, and `service`/`version`/`environment` on every line.
 *
 * @param configService - Config service holding the validated `app` namespace.
 * @returns Parameters for `LoggerModule.forRootAsync`.
 */
export const getLoggerConfig = (configService: ConfigService): Params => {
  const appConfig = configService.getOrThrow<AppConfig>('app');
  const isDev = appConfig.nodeEnv === 'development';
  const healthPath = `/${buildApiPrefix(appConfig.basePath)}/health`;

  return {
    pinoHttp: {
      level: appConfig.logLevel,
      timestamp: () => `,"@timestamp":"${new Date().toISOString()}"`,
      base: {
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
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
      // Emitted through customProps rather than the `req` serializer: Pino serializes the
      // request bindings when the child logger is created, which is before the auth hook has
      // identified the caller. customProps runs when the line is written.
      customProps: req => ({
        client: (req as unknown as { authClient?: string }).authClient,
      }),
      redact: {
        paths: ['req.headers.authorization', 'req.headers["x-api-key"]', 'req.headers.cookie'],
        censor: '[REDACTED]',
      },
      customLogLevel: (req, res, err) => {
        if (res.statusCode >= 500 || err) {
          return 'error';
        }
        if (res.statusCode >= 400) {
          return 'warn';
        }
        return 'info';
      },
      autoLogging: {
        // Health is polled every few seconds; logging it in production is pure noise.
        // Matched on the exact path — a substring test would also silence unrelated routes.
        ignore: req =>
          appConfig.nodeEnv === 'production' && (req.url?.split('?')[0] ?? '') === healthPath,
      },
    },
  };
};
