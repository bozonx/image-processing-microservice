import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { QueueService } from '../image-processing/services/queue.service.js';
import { HealthService } from './health.service.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../../config/service-info.js';

/**
 * Simple health check controller
 * Provides a minimal `/health` endpoint
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly queueService: QueueService,
    private readonly healthService: HealthService,
  ) {}

  /**
   * Basic health check endpoint returning a simple OK status with queue information
   */
  @Get()
  public check(@Res() reply: FastifyReply): void {
    const shuttingDown = this.healthService.isShuttingDown();
    void reply.status(shuttingDown ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK).send({
      status: shuttingDown ? 'shutting_down' : 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptimeSec: this.healthService.uptimeSec(),
      queue: this.queueService.getStatus(),
    });
  }
}
