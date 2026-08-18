import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { HealthController } from '../../src/modules/health/health.controller.js';
import { HealthService } from '../../src/modules/health/health.service.js';
import { QueueService } from '../../src/modules/image-processing/services/queue.service.js';
import { SERVICE_NAME } from '../../src/config/service-info.js';

/** Minimal FastifyReply stand-in recording what the controller sent. */
function createReply() {
  const recorded: { status?: number; body?: unknown } = {};
  const reply = {
    status(code: number) {
      recorded.status = code;
      return this;
    },
    send(body: unknown) {
      recorded.body = body;
      return this;
    },
  };
  return { reply, recorded };
}

describe('HealthController (unit)', () => {
  let controller: HealthController;
  let service: HealthService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        {
          provide: QueueService,
          useValue: { getStatus: () => ({ size: 0, pending: 0 }) },
        },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
    service = moduleRef.get(HealthService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns 200 and ok while serving', () => {
    const { reply, recorded } = createReply();

    controller.check(reply as never);

    expect(recorded.status).toBe(200);
    expect(recorded.body).toMatchObject({
      status: 'ok',
      service: SERVICE_NAME,
      version: expect.any(String),
      uptimeSec: expect.any(Number),
      queue: { size: 0, pending: 0 },
    });
  });

  it('returns 503 and shutting_down after shutdown starts', () => {
    service.onApplicationShutdown();
    const { reply, recorded } = createReply();

    controller.check(reply as never);

    expect(recorded.status).toBe(503);
    expect(recorded.body).toMatchObject({ status: 'shutting_down' });
  });
});
