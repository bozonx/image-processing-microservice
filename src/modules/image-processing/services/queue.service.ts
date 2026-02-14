import {
  Injectable,
  OnModuleDestroy,
  Logger,
  ServiceUnavailableException,
  RequestTimeoutException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PQueue from 'p-queue';
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
    const config = this.configService.get<ImageConfig>('image')!;
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
   * @returns The result of the task execution.
   * @throws ServiceUnavailableException if the service is shutting down.
   * @throws RequestTimeoutException if the task (including wait time) exceeds requestTimeout.
   */
  public async add<T>(task: () => Promise<T>, priority: number = 2): Promise<T> {
    if (this.isShuttingDown) {
      throw new ServiceUnavailableException('Service is shutting down, rejecting new tasks');
    }

    if (this.maxQueueSize > 0 && this.queue.size >= this.maxQueueSize) {
      throw new HttpException('Queue is overloaded', HttpStatus.TOO_MANY_REQUESTS);
    }

    const startTime = Date.now();
    let timeoutHandle: NodeJS.Timeout | undefined;

    try {
      const taskPromise = this.queue.add(task, { priority });

      // Create a timeout promise to reject if the total time exceeds requestTimeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(
            new RequestTimeoutException(
              `Request timeout (queueSize=${this.queue.size}, pending=${this.queue.pending})`,
            ),
          );
        }, this.requestTimeout);
      });

      // Race between task execution (including wait time in queue) and the request timeout
      const result = await Promise.race([taskPromise, timeoutPromise]);
      const duration = Date.now() - startTime;

      this.logger.debug({
        msg: 'Task completed',
        duration,
        queueSize: this.queue.size,
        pending: this.queue.pending,
      });

      return result as T;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error({
        msg: 'Task failed',
        duration,
        error: errorMessage,
      });
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
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
