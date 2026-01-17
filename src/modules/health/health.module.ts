import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { ImageProcessingModule } from '../image-processing/image-processing.module.js';

@Module({
  imports: [ImageProcessingModule],
  controllers: [HealthController],
})
export class HealthModule {}

