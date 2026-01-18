import 'reflect-metadata';
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

  if (!imageConfig || !appConfig) {
    throw new Error('Config not found');
  }

  // Calculate body limit: maxBytes * 1.5 (to account for Base64 encoding overhead)
  const bodyLimitBytes = Math.floor(imageConfig.maxBytes * 1.5);
  await tempApp.close();

  // Create app with bufferLogs enabled to capture early logs
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // We'll use Pino logger instead
      logger: false,
      bodyLimit: bodyLimitBytes,
      forceCloseConnections: true,
      closeTimeout: appConfig.shutdownTimeout,
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
  const globalPrefix = appConfig.basePath ? `${appConfig.basePath}/api/v1` : 'api/v1';
  app.setGlobalPrefix(globalPrefix);

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
  const publicPath = join(__dirname, '..', '..', 'public');
  await app.register(fastifyStatic, {
    root: publicPath,
    prefix: '/',
    constraints: {},
  });

  logger.log(`📁 Serving static files from: ${publicPath}`, 'Bootstrap');

  // Enable graceful shutdown
  app.enableShutdownHooks();

  await app.listen(appConfig.port, appConfig.host);

  logger.log(
    `🚀 NestJS service is running on: http://${appConfig.host}:${appConfig.port}/${globalPrefix}`,
    'Bootstrap',
  );
  logger.log(`🖼️  UI available at: http://${appConfig.host}:${appConfig.port}/`, 'Bootstrap');
  logger.log(`📊 Environment: ${appConfig.nodeEnv}`, 'Bootstrap');
  logger.log(`📝 Log level: ${appConfig.logLevel}`, 'Bootstrap');
  logger.log(`📦 Body limit: ${Math.round(bodyLimitBytes / 1024 / 1024)}MB`, 'Bootstrap');

  // Rely on enableShutdownHooks for graceful shutdown
}

void bootstrap();
