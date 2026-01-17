import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { QueueService } from '../../src/modules/image-processing/services/queue.service.js';
import imageConfig from '../../src/config/image.config.js';

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [imageConfig],
        }),
      ],
      providers: [QueueService],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should execute task with default priority', async () => {
    const task = jest.fn<() => Promise<string>>().mockResolvedValue('result');
    const result = await service.add(task);

    expect(result).toBe('result');
    expect(task).toHaveBeenCalled();
  });

  it('should execute task with custom priority', async () => {
    const task = jest.fn<() => Promise<string>>().mockResolvedValue('result');
    const result = await service.add(task, 0);

    expect(result).toBe('result');
    expect(task).toHaveBeenCalled();
  });

  it('should return queue status', () => {
    const status = service.getStatus();

    expect(status).toHaveProperty('size');
    expect(status).toHaveProperty('pending');
  });

  it('should handle task errors', async () => {
    const task = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Task failed'));

    await expect(service.add(task)).rejects.toThrow('Task failed');
  });

  it('should timeout if request takes too long', async () => {
    // Override requestTimeout for this test
    (service as any).requestTimeout = 100;

    // Create a slow task
    const slowTask = () => new Promise<string>(resolve => setTimeout(() => resolve('done'), 200));

    await expect(service.add(slowTask)).rejects.toThrow('Request timeout');
  });

  it('should prioritize higher priority tasks', async () => {
    // Reduce concurrency to 1 to force queuing
    (service as any).queue = new (await import('p-queue')).default({ concurrency: 1 });

    const results: string[] = [];

    // Start a blocking task
    const blocker = new Promise<void>(resolve => setTimeout(resolve, 50));
    void service.add(() => blocker.then(() => void results.push('blocker')));

    // Add low priority task
    void service.add(() => {
      results.push('low');
      return Promise.resolve('low');
    }, 0);

    // Add high priority task
    void service.add(() => {
      results.push('high');
      return Promise.resolve('high');
    }, 10);

    // Wait for everything
    await new Promise(resolve => setTimeout(resolve, 100));

    // Expect: blocker finishes, then high priority, then low priority
    expect(results).toEqual(['blocker', 'high', 'low']);
  });
  it('should reject new tasks when service is shutting down', async () => {
    // Trigger shutdown
    await service.onModuleDestroy();

    const task = jest.fn<() => Promise<string>>().mockResolvedValue('result');

    await expect(service.add(task)).rejects.toThrow('Service is shutting down');
    expect(task).not.toHaveBeenCalled();
  });

  it('should wait for active tasks to complete on shutdown', async () => {
    const results: string[] = [];
    // Create a task that takes some time
    const slowTask = async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      results.push('completed');
      return 'done';
    };

    // Add task and immediately trigger shutdown
    const taskPromise = service.add(slowTask);
    const shutdownPromise = service.onModuleDestroy();

    await Promise.all([taskPromise, shutdownPromise]);

    expect(results).toContain('completed');
  });
});
