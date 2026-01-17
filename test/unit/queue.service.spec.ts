import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
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
    const task = jest.fn<(() => Promise<string>)>().mockResolvedValue('result');
    const result = await service.add(task);
    
    expect(result).toBe('result');
    expect(task).toHaveBeenCalled();
  });

  it('should execute task with custom priority', async () => {
    const task = jest.fn<(() => Promise<string>)>().mockResolvedValue('result');
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
    const task = jest.fn<(() => Promise<string>)>().mockRejectedValue(new Error('Task failed'));
    
    await expect(service.add(task)).rejects.toThrow('Task failed');
  });
});
