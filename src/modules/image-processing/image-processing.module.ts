import { Module } from '@nestjs/common';
import { ImageProcessingController } from './image-processing.controller.js';

@Module({
  controllers: [ImageProcessingController],
  providers: [],
})
export class ImageProcessingModule {}
