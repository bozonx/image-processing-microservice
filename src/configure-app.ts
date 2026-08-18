import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { AppConfig } from './config/app.config.js';
import imageConfigFactory, { type ImageConfig } from './config/image.config.js';
import type { AuthConfig } from './config/auth.config.js';
import { registerAuthHook } from './common/auth/auth.hook.js';
import { buildApiPrefix, buildPrefixedPath } from './common/http/api-prefix.js';

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * Creates the HTTP adapter with the settings the fleet expects.
 *
 * The body limit has to be known before the Nest container exists, so the image configuration
 * is built here directly rather than re-read from the environment: two places parsing
 * `FILE_MAX_BYTES_MB` would be two defaults to keep in step, and the one that drifts is the
 * one that silently accepts a body the rest of the service rejects.
 *
 * @param options - Overrides, used by tests that need a different body limit.
 * @returns A configured Fastify adapter.
 */
export function createFastifyAdapter(options?: { bodyLimit?: number }): FastifyAdapter {
  const imageConfig: ImageConfig = imageConfigFactory();

  return new FastifyAdapter({
    // Pino handles logging; Fastify's own logger would duplicate every line.
    logger: false,
    bodyLimit: options?.bodyLimit ?? imageConfig.maxBytes,
    // Without this, keep-alive connections keep `app.close()` pending until the client goes
    // away, which turns a graceful shutdown into a hang the orchestrator has to SIGKILL.
    forceCloseConnections: true,
    // The service runs behind a reverse proxy, so the peer address is always the proxy's.
    // Without this every log line would record the proxy instead of the calling host.
    trustProxy: true,
  });
}

/**
 * Applies the wiring shared by `main.ts` and the e2e suite.
 *
 * Anything applied only in `main.ts` is invisible to the tests: a prefix, a content-type parser
 * or an auth change would pass the whole suite and still break in production.
 *
 * @param app - Created, not yet initialised application.
 * @throws Error when the demo UI is enabled alongside authentication.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<AppConfig>('app');
  const imageConfig = configService.getOrThrow<ImageConfig>('image');
  const authConfig = configService.getOrThrow<AuthConfig>('auth');

  // The bundled UI is a development demo: it has no way to present a Bearer token, so with
  // authentication on it would be a browsable, unauthenticated description of a closed API.
  // Refusing to start is louder than serving a panel whose every button returns 401.
  if (appConfig.enableUi && authConfig.enabled) {
    throw new Error(
      'Configuration error: ENABLE_UI=true cannot be combined with configured authentication. ' +
        'The bundled UI is an unauthenticated development demo — set ENABLE_UI=false.',
    );
  }

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  const globalPrefix = buildApiPrefix(appConfig.basePath);
  app.setGlobalPrefix(globalPrefix);

  const fastify = app.getHttpAdapter().getInstance();

  registerAuthHook(fastify, {
    basicUser: authConfig.basicUser,
    basicPass: authConfig.basicPass,
    bearerTokens: authConfig.bearerTokens,
    // Health must stay reachable for probes even when the service is otherwise closed.
    publicPaths: [`${globalPrefix}/health`],
  });

  // Raw image bodies are handed to the pipeline as a stream; parsing them would mean buffering
  // the whole upload before the size limit has had a chance to reject it.
  const passThrough = (
    _request: unknown,
    payload: unknown,
    done: (err: Error | null, body?: unknown) => void,
  ): void => {
    done(null, payload);
  };
  fastify.addContentTypeParser(/^image\/.+$/, passThrough);
  fastify.addContentTypeParser('application/octet-stream', passThrough);

  await app.register(import('@fastify/multipart'), {
    limits: {
      fileSize: imageConfig.maxBytes,
      // One image plus one watermark.
      files: 2,
      fieldSize: 10 * 1024 * 1024,
    },
  });

  if (appConfig.enableUi) {
    await app.register(fastifyStatic, {
      root: join(currentDir, '..', 'public'),
      prefix: buildPrefixedPath(appConfig.basePath, 'ui'),
    });
  }
}
