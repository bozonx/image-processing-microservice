import 'reflect-metadata';
import './config/env.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp, createFastifyAdapter } from './configure-app.js';
import type { AppConfig } from './config/app.config.js';
import { SERVICE_NAME, SERVICE_VERSION } from './config/service-info.js';
import { buildApiPrefix, buildPrefixedPath } from './common/http/api-prefix.js';
import { HealthService } from './modules/health/health.service.js';

/** Exit status used when shutdown does not complete cleanly. */
const EXIT_SHUTDOWN_FAILED = 1;

async function bootstrap(): Promise<void> {
  // Buffer logs so nothing emitted during startup is lost before Pino is attached.
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, createFastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const logger = app.get(Logger);
  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<AppConfig>('app');

  await configureApp(app);

  // Deliberately not app.enableShutdownHooks(): Nest's handler closes the HTTP server
  // immediately, so the `shutting_down` health response would never be observable from
  // outside. Shutdown is driven here instead.
  registerShutdown(app, appConfig, logger);

  await app.listen(appConfig.port, appConfig.host);

  const globalPrefix = buildApiPrefix(appConfig.basePath);
  logger.log(
    `${SERVICE_NAME} ${SERVICE_VERSION} listening on http://${appConfig.host}:${appConfig.port}/${globalPrefix}`,
    'Bootstrap',
  );
  if (appConfig.enableUi) {
    const uiPrefix = buildPrefixedPath(appConfig.basePath, 'ui');
    logger.log(
      `UI available at http://${appConfig.host}:${appConfig.port}${uiPrefix}`,
      'Bootstrap',
    );
  }
  logger.log(`environment=${appConfig.nodeEnv} logLevel=${appConfig.logLevel}`, 'Bootstrap');
}

/**
 * Drains the instance on SIGTERM/SIGINT, then closes the app.
 *
 * The sequence matters: health starts reporting `shutting_down` while the server is still
 * accepting connections, so the load balancer can take this instance out of rotation before
 * any request is refused. Only after the drain window does the app close, which runs Nest's
 * shutdown hooks and lets the queue finish its in-flight work.
 *
 * Shutdown always ends in an explicit exit status. A close that hangs — a stuck queue task, a
 * socket that never finishes — exits non-zero after `shutdownForceExitSeconds` instead of
 * waiting for the orchestrator's SIGKILL, which would report the container as stopped cleanly
 * and hide the defect.
 *
 * @param app - Running application.
 * @param config - Validated app configuration holding both shutdown windows.
 * @param logger - Logger for shutdown progress.
 */
function registerShutdown(app: NestFastifyApplication, config: AppConfig, logger: Logger): void {
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    // A second signal during the drain window must not start a parallel shutdown.
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    logger.log(`${signal} received, draining for ${config.shutdownDrainSeconds}s`, 'Shutdown');
    app.get(HealthService).startDraining();

    if (config.shutdownDrainSeconds > 0) {
      await sleep(config.shutdownDrainSeconds * 1000);
    }

    const forceExit = setTimeout(() => {
      logger.error(
        `Shutdown did not complete within ${config.shutdownForceExitSeconds}s, exiting with a failure status`,
        undefined,
        'Shutdown',
      );
      process.exit(EXIT_SHUTDOWN_FAILED);
    }, config.shutdownForceExitSeconds * 1000);

    try {
      await app.close();
      clearTimeout(forceExit);
      logger.log('Shutdown complete', 'Shutdown');
      process.exit(0);
    } catch (err) {
      clearTimeout(forceExit);
      logger.error(
        'Error during shutdown',
        err instanceof Error ? err.stack : String(err),
        'Shutdown',
      );
      process.exit(EXIT_SHUTDOWN_FAILED);
    }
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}

// Nothing is logged through Pino here: these fire when the process is already unreliable,
// possibly before or after the logger exists.
/* eslint-disable no-console */
process.on('unhandledRejection', reason => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', error => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

bootstrap().catch(err => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
/* eslint-enable no-console */
