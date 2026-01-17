import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PQueue from 'p-queue';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queue: PQueue;
  private readonly requestTimeout: number;
  private isShuttingDown = false;

  constructor(private readonly configService: ConfigService) {
    const concurrency = this.configService.get<number>('image.queue.maxConcurrency', 4);
    const timeout = this.configService.get<number>('image.queue.timeout', 30000);
    this.requestTimeout = this.configService.get<number>('image.queue.requestTimeout', 60000);

    this.queue = new PQueue({
      concurrency,
      timeout,
    });

    this.logger.log(
      `Queue initialized with concurrency: ${concurrency}, job timeout: ${timeout}ms, request timeout: ${this.requestTimeout}ms`,
    );
  }

  async add<T>(
    task: () => Promise<T>,
    priority: number = 2,
  ): Promise<T> {
    if (this.isShuttingDown) {
      throw new Error('Service is shutting down, rejecting new tasks');
    }

    const startTime = Date.now();

    try {
      const taskPromise = this.queue.add(task, { priority });

      // Create a timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Request timeout'));
        }, this.requestTimeout);
      });

      // Race between task execution (including wait time) and timeout
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
    }
  }

  getStatus() {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
    };
  }

  async onModuleDestroy() {
    this.logger.log('Starting graceful shutdown...');
    this.isShuttingDown = true;

    await this.queue.onIdle();

    this.logger.log('All tasks completed, shutdown complete');
  }
}
