import {
  Injectable,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
  RequestTimeoutException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PQueue, { TimeoutError } from 'p-queue';
import type { ImageConfig } from '../../../config/image.config.js';

/**
 * Service for managing a priority queue of heavy tasks.
 * Prevents system overload by limiting concurrency and provides timeouts.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue: PQueue;
  private readonly requestTimeout: number;
  private readonly maxQueueSize: number;
  private isShuttingDown = false;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.getOrThrow<ImageConfig>('image');
    const { maxConcurrency, timeout, requestTimeout, maxQueueSize } = config.queue;

    this.requestTimeout = requestTimeout;
    this.maxQueueSize = maxQueueSize;

    this.queue = new PQueue({
      concurrency: maxConcurrency,
      timeout,
    });

    this.logger.log(
      `Queue initialized with maxConcurrency: ${maxConcurrency}, maxQueueSize: ${this.maxQueueSize}, job timeout: ${timeout}ms, request timeout: ${this.requestTimeout}ms`,
    );
  }

  /**
   * Adds a task to the queue with a specified priority.
   *
   * @param task - An async function representing the task to execute.
   * @param priority - Task priority (higher number = higher priority).
   * @param signal - Optional AbortSignal to cancel the task while in queue.
   * @returns The result of the task execution.
   * @throws ServiceUnavailableException if the service is shutting down.
   * @throws RequestTimeoutException if the task (including wait time) exceeds requestTimeout.
   * @throws GatewayTimeoutException if the task execution exceeds queue timeout.
   */
  public async add<T>(
    task: (signal: AbortSignal) => Promise<T>,
    priority: number = 2,
    signal?: AbortSignal,
  ): Promise<T> {
    if (this.isShuttingDown) {
      throw new ServiceUnavailableException('Service is shutting down, rejecting new tasks');
    }

    if (signal?.aborted) {
      throw new Error('Request aborted');
    }

    if (this.maxQueueSize > 0 && this.queue.size + this.queue.pending >= this.maxQueueSize) {
      throw new HttpException('Queue is overloaded', HttpStatus.TOO_MANY_REQUESTS);
    }

    const startTime = Date.now();
    let timeoutHandle: NodeJS.Timeout | undefined;
    const internalAbortController = new AbortController();

    const onExternalAbort = () => {
      internalAbortController.abort(signal?.reason ?? new Error('Request aborted'));
    };

    if (signal) {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    // Mapping user priority (0-high, 2-low) to p-queue priority (high numbers run first)
    const internalPriority = 2 - Math.max(0, Math.min(2, priority));

    try {
      timeoutHandle = setTimeout(() => {
        const timeoutErr = new RequestTimeoutException(
          `Request timeout (queueSize=${this.queue.size}, pending=${this.queue.pending})`,
        );
        internalAbortController.abort(timeoutErr);
      }, this.requestTimeout);

      const result = await this.queue.add(() => task(internalAbortController.signal), {
        priority: internalPriority,
        signal: internalAbortController.signal,
      });

      const duration = Date.now() - startTime;

      this.logger.debug({
        msg: 'Task completed',
        duration,
        queueSize: this.queue.size,
        pending: this.queue.pending,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Ensure internal abort controller is aborted on failure to halt background tasks
      if (!internalAbortController.signal.aborted) {
        internalAbortController.abort(error);
      }

      // Don't log abort errors as failures
      if (errorMessage !== 'The operation was aborted' && errorMessage !== 'Request aborted') {
        this.logger.error({
          msg: 'Task failed',
          duration,
          error: errorMessage,
        });
      }

      // Check if aborted due to request timeout
      if (
        internalAbortController.signal.reason instanceof RequestTimeoutException ||
        (internalAbortController.signal.aborted &&
          internalAbortController.signal.reason instanceof HttpException)
      ) {
        throw internalAbortController.signal.reason;
      }

      // Map p-queue TimeoutError to 504 GatewayTimeoutException
      if (error instanceof TimeoutError || (error as Error)?.name === 'TimeoutError') {
        throw new GatewayTimeoutException('Task execution timed out');
      }

      if (error instanceof HttpException) {
        throw error;
      }

      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (signal) {
        signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  /**
   * Returns current queue metrics (size and number of active tasks).
   */
  public getStatus() {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
    };
  }

  /**
   * Lifecycle hook to ensure all remaining tasks complete during application shutdown.
   */
  public async onModuleDestroy() {
    this.logger.log('Starting graceful shutdown...');
    this.isShuttingDown = true;

    // Wait for all tasks in the queue to finish
    await this.queue.onIdle();

    this.logger.log('All tasks completed, shutdown complete');
  }
}
