import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { QueueService, type QueueStatus } from '../image-processing/services/queue.service.js';
import { HealthService } from './health.service.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../../config/service-info.js';

/**
 * Shape returned by the health endpoint.
 *
 * The first four fields are the fleet-wide contract. `queue` is specific to this service and
 * recorded as an allowed deviation in the standard: saturation is the failure mode that matters
 * here, and a probe that cannot see it is not much of a probe.
 */
export interface HealthResponse {
  status: 'ok' | 'shutting_down';
  service: string;
  version: string;
  uptimeSec: number;
  queue: QueueStatus;
}

/**
 * Health check controller.
 *
 * Serves `{prefix}/health` and is always reachable without authentication.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly queueService: QueueService,
    private readonly health: HealthService,
  ) {}

  /**
   * Reports service liveness and queue depth.
   *
   * @param reply - Fastify reply, used directly so the status code can vary with drain state.
   * @returns `200` with `ok` while serving, `503` with `shutting_down` while draining.
   */
  @Get()
  public check(@Res() reply: FastifyReply): void {
    const shuttingDown = this.health.isShuttingDown();
    const body: HealthResponse = {
      status: shuttingDown ? 'shutting_down' : 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptimeSec: this.health.uptimeSec(),
      queue: this.queueService.getStatus(),
    };

    void reply.status(shuttingDown ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK).send(body);
  }
}
