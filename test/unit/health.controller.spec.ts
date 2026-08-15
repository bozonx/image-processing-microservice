import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { HealthController } from '../../src/modules/health/health.controller.js';
import { QueueService } from '../../src/modules/image-processing/services/queue.service.js';
import { HealthService } from '../../src/modules/health/health.service.js';
import type { FastifyReply } from 'fastify';

describe('HealthController (unit)', () => {
  let controller: HealthController;
  let moduleRef: TestingModule;
  const send = jest.fn();
  const status = jest.fn(() => ({ send }));

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: QueueService,
          useValue: {
            getStatus: () => ({ size: 0, pending: 0 }),
          },
        },
      ],
    }).compile();

    controller = moduleRef.get<HealthController>(HealthController);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /api/v1/health returns ok', () => {
    controller.check({ status } as unknown as FastifyReply);
    expect(status).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        service: 'image-processing-microservice',
        version: 'dev',
        uptimeSec: expect.any(Number),
        queue: { size: 0, pending: 0 },
      }),
    );
  });
});
