import 'reflect-metadata';
import './config/env.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app.config.js';
import { buildApiPrefix, buildUiPrefix } from './common/http/api-prefix.js';
import { SERVICE_NAME, SERVICE_VERSION } from './config/service-info.js';
import { HealthService } from './modules/health/health.service.js';
import { configureApp, createFastifyAdapter } from './configure-app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const logger = app.get(Logger);
  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<AppConfig>('app');

  await configureApp(app);

  registerShutdown(app, appConfig.shutdownDrainSeconds, logger);

  await app.listen(appConfig.port, appConfig.host);

  const globalPrefix = buildApiPrefix(appConfig.basePath);
  const uiPrefix = buildUiPrefix(appConfig.basePath);

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
