import { Injectable, type OnApplicationShutdown } from '@nestjs/common';

/**
 * Tracks whether the process has started shutting down.
 *
 * The load balancer needs to stop routing to this instance before the process exits, so
 * health must report the drain state while the server is still accepting connections.
 */
@Injectable()
export class HealthService implements OnApplicationShutdown {
  private draining = false;
  private readonly startedAt = Date.now();

  /**
   * Marks the service as draining.
   *
   * Called by the signal handler in `main.ts` at the start of shutdown — before the HTTP
   * server closes, which is the whole point: a flag set while sockets are already closed
   * would never be observable.
   */
  public startDraining(): void {
    this.draining = true;
  }

  /** Also marks draining when the app is closed programmatically, e.g. in tests. */
  public onApplicationShutdown(): void {
    this.startDraining();
  }

  /** True once shutdown has begun. */
  public isShuttingDown(): boolean {
    return this.draining;
  }

  /** Whole seconds since the service was constructed. */
  public uptimeSec(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }
}
