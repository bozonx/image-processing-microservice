import { Controller, Get } from '@nestjs/common';
import { QueueService } from '../image-processing/services/queue.service.js';

/**
 * Simple health check controller
 * Provides a minimal `/health` endpoint
 */
@Controller('health')
export class HealthController {
  constructor(private readonly queueService: QueueService) {}

  /**
   * Basic health check endpoint returning a simple OK status with queue information
   */
  @Get()
  public check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      queue: this.queueService.getStatus(),
    };
  }
}

