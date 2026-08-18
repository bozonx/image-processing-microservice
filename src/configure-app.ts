import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { AppConfig } from './config/app.config.js';
import type { ImageConfig } from './config/image.config.js';
import type { AuthConfig } from './config/auth.config.js';
import { createAuthHook } from './common/auth/auth.hook.js';
import { buildApiPrefix, buildUiPrefix } from './common/http/api-prefix.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

export function createFastifyAdapter(options?: { bodyLimit?: number }): FastifyAdapter {
  const bodyLimitBytes =
    options?.bodyLimit ?? parseInt(process.env.FILE_MAX_BYTES_MB ?? '100', 10) * 1024 * 1024;

  return new FastifyAdapter({
    logger: false,
    bodyLimit: bodyLimitBytes,
    forceCloseConnections: true,
  });
}

export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<AppConfig>('app');
  const imageConfig = configService.getOrThrow<ImageConfig>('image');
  const authConfig = configService.get<(AuthConfig & { bearerTokenList: string[] }) | undefined>(
    'auth',
  );

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

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
        uiPrefix: appConfig.enableUi ? '/ui' : undefined,
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
      constraints: {},
    });
  }
}
