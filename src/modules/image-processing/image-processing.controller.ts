import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ImageProcessorService } from './services/image-processor.service.js';
import { ExifService } from './services/exif.service.js';
import { QueueService } from './services/queue.service.js';
import { ProcessImageDto } from './dto/process-image.dto.js';
import { ExtractExifDto } from './dto/exif.dto.js';

/**
 * Controller for handling image processing and EXIF extraction requests.
 * All operations are offloaded to a priority queue to ensure system stability.
 */
@Controller()
export class ImageProcessingController {
  constructor(
    private readonly imageProcessor: ImageProcessorService,
    private readonly exifService: ExifService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Processes an image (resize, crop, convert) according to the specified parameters.
   * Tasks are added to the priority queue.
   *
   * @param dto - Formatting and transformation options.
   * @returns Processed image data in base64 format and metadata.
   */
  @Post('process')
  @HttpCode(HttpStatus.OK)
  public async process(@Body() dto: ProcessImageDto) {
    const priority = dto.priority ?? 2;

    const result = await this.queueService.add(async () => {
      const processed = await this.imageProcessor.process(dto);
      return {
        ...processed,
        buffer: processed.buffer.toString('base64'),
      };
    }, priority);

    return result;
  }

  /**
   * Extracts EXIF metadata from the provided image.
   * Tasks are added to the priority queue.
   *
   * @param dto - Image data and MIME type.
   * @returns EXIF data record.
   */
  @Post('exif')
  @HttpCode(HttpStatus.OK)
  public async extractExif(@Body() dto: ExtractExifDto) {
    const priority = dto.priority ?? 2;

    const result = await this.queueService.add(async () => {
      const buffer = Buffer.from(dto.image, 'base64');
      const exif = await this.exifService.extract(buffer, dto.mimeType);
      return { exif };
    }, priority);

    return result;
  }
}
