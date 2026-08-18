import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

declare module 'node:http' {
  interface IncomingMessage {
    /**
     * Name of the authenticated caller, set by the auth hook. Lives on the raw request so both
     * application code and the Pino request serializer can read it.
     */
    authClient?: string;
  }
}

/** A named Bearer credential: who the caller is, plus the secret it presents. */
export interface BearerToken {
  /** Stable name of the calling service. Appears in logs; never a secret. */
  clientId: string;
  /** The shared secret the caller sends in the Authorization header. */
  token: string;
}

export interface AuthOptions {
  /** Basic auth user. Empty disables Basic auth. */
  basicUser: string;
  /** Basic auth password. Empty disables Basic auth. */
  basicPass: string;
  /** Accepted named Bearer credentials. Empty disables Bearer auth. */
  bearerTokens: BearerToken[];
  /** Paths that stay public, without leading slash handling — compared after normalisation. */
  publicPaths: string[];
}

/**
 * Parses a comma-separated list of `name:token` pairs, dropping empty entries.
 *
 * Lives next to the hook rather than in a service's config so every service in the fleet reads
 * the variable the same way.
 *
 * @param raw - Raw `AUTH_BEARER_TOKENS` value.
 * @returns Named bearer credentials.
 * @throws Error when an entry is not a `name:token` pair with both halves present.
 */
export function parseBearerTokens(raw: string | undefined): BearerToken[] {
  const entries = (raw ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);

  return entries.map((entry, index) => {
    // Split on the first colon only: a token may legitimately contain colons.
    const separator = entry.indexOf(':');
    const clientId = separator === -1 ? '' : entry.slice(0, separator).trim();
    const token = separator === -1 ? '' : entry.slice(separator + 1).trim();

    if (clientId === '' || token === '') {
      // Never echo the entry itself — it holds a secret.
      throw new Error(
        `AUTH_BEARER_TOKENS entry #${index + 1} must be "name:token" with both halves non-empty`,
      );
    }

    return { clientId, token };
  });
}

/** Credentials pre-hashed at startup so no plaintext secret is compared per request. */
interface PreparedCredentials {
  bearer: { clientId: string; hash: Buffer }[];
  basic?: { clientId: string; user: Buffer; pass: Buffer };
}

/**
 * Hashes a credential so comparisons run over fixed-length buffers.
 *
 * @param value - Value to hash.
 * @returns The 32-byte SHA-256 digest.
 */
function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Compares two digests without leaking their contents through timing.
 *
 * @param a - First digest.
 * @param b - Second digest.
 * @returns True when the digests are identical.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  // Digests are always 32 bytes, so timingSafeEqual can never throw on a length mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Strips a trailing slash so `/x/` and `/x` are treated as the same route.
 *
 * @param path - Path to normalise.
 * @returns The normalised path.
 */
function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/**
 * Resolves an Authorization header to the name of the caller it authenticates.
 *
 * @param header - Raw Authorization header value.
 * @param credentials - Pre-hashed credentials.
 * @returns The caller name, or null when the header authenticates nobody.
 */
function identify(header: string | undefined, credentials: PreparedCredentials): string | null {
  if (!header) {
    return null;
  }

  const separator = header.indexOf(' ');
  if (separator === -1) {
    return null;
  }
  const scheme = header.slice(0, separator).toLowerCase();
  const value = header.slice(separator + 1).trim();
  if (value === '') {
    return null;
  }

  if (scheme === 'bearer') {
    const presented = sha256(value);
    let matched: string | null = null;
    // Every token is checked even after a match, so the time taken does not reveal which
    // entry matched or how many entries are configured.
    for (const candidate of credentials.bearer) {
      if (safeEqual(presented, candidate.hash)) {
        matched = candidate.clientId;
      }
    }
    return matched;
  }

  if (scheme === 'basic' && credentials.basic) {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon === -1) {
      return null;
    }
    // Both halves are compared before combining, so a wrong user costs the same as a wrong password.
    const userOk = safeEqual(sha256(decoded.slice(0, colon)), credentials.basic.user);
    const passOk = safeEqual(sha256(decoded.slice(colon + 1)), credentials.basic.pass);
    return userOk && passOk ? credentials.basic.clientId : null;
  }

  return null;
}

/**
 * Registers a global authentication hook on the Fastify instance.
 *
 * Authentication is opt-in: when no credentials are configured the hook is not registered
 * at all and the service stays public. When any are configured, every route except the
 * listed public paths requires a matching credential — a route added later is closed by
 * default rather than open by default.
 *
 * The check runs in `onRequest`, before body parsing and before routing decisions, so it
 * cannot be sidestepped by an unmatched route or an oversized payload.
 *
 * On success the caller's name is recorded on `request.raw.authClient` for logging.
 *
 * @param instance - Fastify instance to guard.
 * @param options - Credentials and public paths.
 */
export function registerAuthHook(instance: FastifyInstance, options: AuthOptions): void {
  const basicEnabled = options.basicUser !== '' && options.basicPass !== '';
  const authEnabled = basicEnabled || options.bearerTokens.length > 0;
  if (!authEnabled) {
    return;
  }

  const credentials: PreparedCredentials = {
    bearer: options.bearerTokens.map(({ clientId, token }) => ({
      clientId,
      hash: sha256(token),
    })),
    basic: basicEnabled
      ? {
          clientId: `basic:${options.basicUser}`,
          user: sha256(options.basicUser),
          pass: sha256(options.basicPass),
        }
      : undefined,
  };

  const publicPaths = new Set(
    options.publicPaths.map(path => normalizePath(`/${path.replace(/^\/+|\/+$/g, '')}`)),
  );

  instance.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Compare the path only: the query string is not part of the route identity.
    const path = normalizePath(request.url.split('?')[0] ?? '');

    if (publicPaths.has(path)) {
      return;
    }

    const clientId = identify(request.headers.authorization, credentials);
    if (clientId !== null) {
      request.raw.authClient = clientId;
      return;
    }

    if (basicEnabled) {
      void reply.header('WWW-Authenticate', 'Basic realm="restricted", charset="UTF-8"');
    }
    return reply
      .status(401)
      .send({ statusCode: 401, error: 'Unauthorized', message: 'Unauthorized' });
  });
}
