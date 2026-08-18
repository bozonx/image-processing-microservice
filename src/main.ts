import 'reflect-metadata';
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
  // Create temporary app to get config (using minimal Fastify adapter)
  const tempApp = await NestFactory.create(AppModule, new FastifyAdapter({ logger: false }), {
    logger: false,
  });
  const configService = tempApp.get(ConfigService);
  const imageConfig = configService.get<{ maxBytes: number }>('image');
  const appConfig = configService.get<AppConfig>('app');
  const authConfig = configService.get<(AuthConfig & { bearerTokenList: string[] }) | undefined>(
    'auth',
  );

  if (!imageConfig || !appConfig) {
    throw new Error('Config not found');
  }

  // Body limit should match raw binary uploads; multipart is handled by @fastify/multipart limits
  const bodyLimitBytes = imageConfig.maxBytes;
  await tempApp.close();

  // Create app with bufferLogs enabled to capture early logs
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // We'll use Pino logger instead
      logger: false,
      bodyLimit: bodyLimitBytes,
      forceCloseConnections: true,
      closeTimeout: Math.max(appConfig.shutdownDrainSeconds * 1000, 1000),
    } as any),
    {
      bufferLogs: true,
    },
  );

  // Use Pino logger for the entire application
  app.useLogger(app.get(Logger));

  const logger = app.get(Logger);

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
