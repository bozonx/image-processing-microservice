import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { AppConfig } from './config/app.config.js';
import type { ImageConfig } from './config/image.config.js';
import type { AuthConfig } from './config/auth.config.js';
import { registerAuthHook } from './common/auth/auth.hook.js';
import { buildApiPrefix, buildUiPrefix } from './common/http/api-prefix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createFastifyAdapter(options?: { bodyLimit?: number }): FastifyAdapter {
  const parsedMb = Number.parseInt(process.env.FILE_MAX_BYTES_MB ?? '100', 10);
  const fileMaxMb = Number.isFinite(parsedMb) && parsedMb > 0 ? parsedMb : 100;
  const bodyLimitBytes = options?.bodyLimit ?? fileMaxMb * 1024 * 1024;

  return new FastifyAdapter({
    logger: false,
    bodyLimit: bodyLimitBytes,
    forceCloseConnections: true,
    // The service runs behind a reverse proxy, so the peer address is always the proxy's.
    // Without this every log line would record the proxy instead of the calling host.
    trustProxy: true,
  });
}

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

  registerAuthHook(app.getHttpAdapter().getInstance(), {
    basicUser: authConfig.basicUser,
    basicPass: authConfig.basicPass,
    bearerTokens: authConfig.bearerTokens,
    // Health must stay reachable for probes even when the service is otherwise closed.
    publicPaths: [`${globalPrefix}/health`],
  });

  const fastify = app.getHttpAdapter().getInstance();

  fastify.addContentTypeParser(/^image\/.+$/, (req, payload, done) => {
    done(null, payload);
  });

  fastify.addContentTypeParser('application/octet-stream', (req, payload, done) => {
    done(null, payload);
  });

  await app.register(import('@fastify/multipart'), {
    limits: {
      fileSize: imageConfig.maxBytes,
      files: 2,
      fieldSize: 10 * 1024 * 1024,
    },
  });

  if (appConfig.enableUi) {
    const publicPath = join(__dirname, '..', 'public');
    const uiPrefix = buildUiPrefix(appConfig.basePath);
    await app.register(fastifyStatic, {
      root: publicPath,
      prefix: uiPrefix,
    });
  }
}
