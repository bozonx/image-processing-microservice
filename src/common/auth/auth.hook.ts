import type { FastifyReply, FastifyRequest } from 'fastify';

export interface AuthHookOptions {
  basePath: string;
  uiPrefix: string;
  apiPrefix: string;
  basicUser?: string;
  basicPass?: string;
  bearerTokens: string[];
}

function normalizeBasePath(basePath: string): string {
  return (basePath ?? '').replace(/^\/+|\/+$/g, '');
}

function buildPrefixedPath(basePath: string, path: string): string {
  const b = normalizeBasePath(basePath);
  if (!b) return path;
  return `/${b}${path.startsWith('/') ? '' : '/'}${path.replace(/^\/+/, '')}`;
}

function unauthorized(res: FastifyReply, allowBasic: boolean, allowBearer: boolean): void {
  const challenges: string[] = [];
  if (allowBasic) challenges.push('Basic realm="Restricted"');
  if (allowBearer) challenges.push('Bearer');

  res
    .code(401)
    .header('WWW-Authenticate', challenges.length > 0 ? challenges.join(', ') : 'Basic')
    .send({
      statusCode: 401,
      message: 'Unauthorized',
    });
}

function parseAuthorizationHeader(req: FastifyRequest): string | undefined {
  const header = req.headers['authorization'];
  if (!header) return undefined;
  if (Array.isArray(header)) return header[0];
  return header;
}

function isBasicValid(authHeader: string, user: string, pass: string): boolean {
  const match = /^Basic\s+(.+)$/i.exec(authHeader);
  if (!match) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return false;
  }

  const idx = decoded.indexOf(':');
  if (idx < 0) return false;
  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);
  return u === user && p === pass;
}

function isBearerValid(authHeader: string, tokens: string[]): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) return false;
  const token = match[1].trim();
  return tokens.includes(token);
}

export function createAuthHook(options: AuthHookOptions) {
  const apiPrefix = buildPrefixedPath(options.basePath, options.apiPrefix);
  const uiPrefix = buildPrefixedPath(options.basePath, options.uiPrefix);

  const basicEnabled =
    typeof options.basicUser === 'string' &&
    options.basicUser.length > 0 &&
    typeof options.basicPass === 'string' &&
    options.basicPass.length > 0;

  const bearerEnabled = options.bearerTokens.length > 0;

  const anyAuthEnabled = basicEnabled || bearerEnabled;

  return async function authHook(req: FastifyRequest, res: FastifyReply) {
    if (!anyAuthEnabled) return;

    const url = req.raw.url ?? '';

    const isApi = url.startsWith(apiPrefix);
    const isUi = url.startsWith(uiPrefix);

    if (!isApi && !isUi) return;

    if (isApi) {
      // Exception: allow download without auth
      if (req.method === 'GET') {
        const downloadPrefix = buildPrefixedPath(
          options.basePath,
          `${options.apiPrefix}/download/`,
        );
        if (url.startsWith(downloadPrefix)) return;
      }

      const authHeader = parseAuthorizationHeader(req);
      if (!authHeader) {
        unauthorized(res, basicEnabled, bearerEnabled);
        return;
      }

      const ok =
        (basicEnabled && isBasicValid(authHeader, options.basicUser!, options.basicPass!)) ||
        (bearerEnabled && isBearerValid(authHeader, options.bearerTokens));

      if (!ok) {
        unauthorized(res, basicEnabled, bearerEnabled);
      }
      return;
    }

    // UI: only Basic (Bearer does not apply to UI)
    if (!basicEnabled) {
      return;
    }

    const authHeader = parseAuthorizationHeader(req);
    if (
      basicEnabled &&
      authHeader &&
      isBasicValid(authHeader, options.basicUser!, options.basicPass!)
    ) {
      return;
    }

    unauthorized(res, true, false);
  };
}
