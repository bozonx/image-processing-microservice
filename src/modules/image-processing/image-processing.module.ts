import { Module } from '@nestjs/common';
import { ImageProcessingController } from './image-processing.controller.js';
import { ImageProcessorService } from './services/image-processor.service.js';
import { ExifService } from './services/exif.service.js';
import { QueueService } from './services/queue.service.js';

@Module({
  controllers: [ImageProcessingController],
  providers: [ImageProcessorService, ExifService, QueueService],
  exports: [QueueService],
})
export class ImageProcessingModule {}

