import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { HealthController } from '../../src/modules/health/health.controller.js';
import { QueueService } from '../../src/modules/image-processing/services/queue.service.js';

describe('HealthController (unit)', () => {
  let controller: HealthController;
  let moduleRef: TestingModule;

  beforeAll(async () => {


    moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
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
    const res = controller.check();
    expect(res).toEqual(
      expect.objectContaining({
        status: 'ok',
        queue: { size: 0, pending: 0 },
      }),
    );
    expect(res.timestamp).toBeDefined();
  });
});
