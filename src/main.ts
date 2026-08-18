import 'reflect-metadata';
import './config/env.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app.config.js';
import type { AuthConfig } from './config/auth.config.js';
import { createAuthHook } from './common/auth/auth.hook.js';
import { buildApiPrefix } from './common/http/api-prefix.js';
import { SERVICE_NAME, SERVICE_VERSION } from './config/service-info.js';
import { HealthService } from './modules/health/health.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

async function bootstrap() {
  const bodyLimitBytes = parseInt(process.env.FILE_MAX_BYTES_MB ?? '100', 10) * 1024 * 1024;

  // Create app with bufferLogs enabled to capture early logs
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: bodyLimitBytes,
      forceCloseConnections: true,
    }),
    {
      bufferLogs: true,
    },
  );

  // Use Pino logger for the entire application
  app.useLogger(app.get(Logger));

  const logger = app.get(Logger);
  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<AppConfig>('app');
  const imageConfig = configService.getOrThrow<{ maxBytes: number }>('image');
  const authConfig = configService.get<(AuthConfig & { bearerTokenList: string[] }) | undefined>(
    'auth',
  );

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Configure global API prefix from configuration
  const globalPrefix = buildApiPrefix(appConfig.basePath);
  app.setGlobalPrefix(globalPrefix);

  const basicUser = authConfig?.basicUser;
  const basicPass = authConfig?.basicPass;
  const bearerTokens = authConfig?.bearerTokenList ?? [];

  app
    .getHttpAdapter()
    .getInstance()
    .addHook(
      'onRequest',
      createAuthHook({
        basePath: appConfig.basePath,
        uiPrefix: appConfig.enableUi ? '/ui' : '/__ui_disabled__',
        apiPrefix: '/api/v1',
        basicUser,
        basicPass,
        bearerTokens,
        publicPaths: ['/api/v1/health'],
      }),
    );

  const fastify = app.getHttpAdapter().getInstance();

  fastify.addContentTypeParser(/^image\/.+$/, (req, payload, done) => {
    done(null, payload);
  });

  fastify.addContentTypeParser('application/octet-stream', (req, payload, done) => {
    done(null, payload);
  });

  // Register multipart support for streaming uploads
  await app.register(import('@fastify/multipart'), {
    limits: {
      fileSize: imageConfig.maxBytes,
      // Allow up to 2 files (main image and watermark)
      files: 2,
      // 10MB limit for JSON fields (params)
      fieldSize: 10 * 1024 * 1024,
    },
  });

  // Register static files serving for UI
  const publicPath = join(__dirname, '..', 'public');
  const uiPrefix = appConfig.basePath ? `/${appConfig.basePath}/ui` : '/ui';
  if (appConfig.enableUi) {
    await app.register(fastifyStatic, {
      root: publicPath,
      prefix: uiPrefix,
      constraints: {},
    });

    logger.log(`📁 Serving static files from: ${publicPath}`, 'Bootstrap');
  }

  registerShutdown(app, appConfig.shutdownDrainSeconds, logger);

  await app.listen(appConfig.port, appConfig.host);

  logger.log(
    `${SERVICE_NAME} ${SERVICE_VERSION} listening on http://${appConfig.host}:${appConfig.port}/${globalPrefix}`,
    'Bootstrap',
  );
  if (appConfig.enableUi) {
    logger.log(
      `🖼️  UI available at: http://${appConfig.host}:${appConfig.port}${uiPrefix}`,
      'Bootstrap',
    );
  }
  logger.log(`📊 Environment: ${appConfig.nodeEnv}`, 'Bootstrap');
  logger.log(`📝 Log level: ${appConfig.logLevel}`, 'Bootstrap');
  logger.log(`📦 Body limit: ${Math.round(bodyLimitBytes / 1024 / 1024)}MB`, 'Bootstrap');
}

function registerShutdown(app: NestFastifyApplication, drainSeconds: number, logger: Logger): void {
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`${signal} received, draining for ${drainSeconds}s`, 'Shutdown');
    app.get(HealthService).startDraining();
    if (drainSeconds > 0) await sleep(drainSeconds * 1000);
    await app.close();
    logger.log('Shutdown complete', 'Shutdown');
    process.exit(0);
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => void shutdown(signal));
  }
}

void bootstrap();
