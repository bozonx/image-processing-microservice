import type { FastifyReply, FastifyRequest } from 'fastify';

/** Raised when the caller went away before a response could be produced. */
export class RequestAbortedError extends Error {
  constructor(message = 'Request aborted') {
    super(message);
    this.name = 'RequestAbortedError';
  }
}

/**
 * Recognises the ways an abort reaches us.
 *
 * `AbortSignal` rejections surface as a DOMException whose message is fixed by the platform,
 * and p-queue passes that through, so the string comparison cannot be avoided entirely — but
 * it lives here rather than being repeated at every call site.
 *
 * @param error - Value that was thrown.
 * @returns True when the error means "the caller is gone", not "the request failed".
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof RequestAbortedError) {
    return true;
  }

  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message === 'The operation was aborted' ||
      error.message === 'Request aborted')
  );
}

/** A caller's connection, watched for the moment it goes away. */
export interface ClientConnection {
  /** Aborts as soon as the caller is seen to disconnect. */
  readonly signal: AbortSignal;
  /** True once a disconnect was observed. */
  disconnected(): boolean;
  /** Detaches the listeners. Always call this from a `finally` block. */
  dispose(): void;
}

/**
 * Watches a request/response pair and aborts when the caller disconnects.
 *
 * `destroyed` is not a disconnect signal on the request: Node marks an `IncomingMessage`
 * destroyed as soon as its body has been fully consumed, which is exactly what a healthy
 * upload does. Testing it aborted every successful request the instant it finished arriving.
 * `complete` is the honest test — false there means the body really did stop early.
 *
 * @param req - Incoming request.
 * @param res - Reply being produced for it.
 * @param onAbort - Optional extra teardown, e.g. destroying an input stream.
 * @returns A handle carrying the signal and its cleanup.
 */
export function watchClient(
  req: FastifyRequest,
  res: FastifyReply,
  onAbort?: () => void,
): ClientConnection {
  const controller = new AbortController();
  let gone = false;

  const abort = (): void => {
    if (gone) {
      return;
    }
    gone = true;
    controller.abort(new RequestAbortedError());
    onAbort?.();
  };

  const onClose = (): void => {
    if (!req.raw.complete || res.raw.destroyed) {
      abort();
    }
  };

  req.raw.on('close', onClose);
  res.raw.on('close', onClose);
  res.raw.on('error', abort);

  return {
    signal: controller.signal,
    disconnected: () => gone,
    dispose: () => {
      req.raw.removeListener('close', onClose);
      res.raw.removeListener('close', onClose);
      res.raw.removeListener('error', abort);
    },
  };
}
