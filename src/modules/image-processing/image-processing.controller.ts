import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImageProcessorService } from './services/image-processor.service.js';
import { ExifService } from './services/exif.service.js';
import { QueueService } from './services/queue.service.js';
import { ProcessImageDto } from './dto/process-image.dto.js';
import { ExtractExifDto } from './dto/exif.dto.js';
import { ProcessImageStreamDto } from './dto/process-image-stream.dto.js';

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

  /**
   * Processes an image stream via multipart/form-data.
   *
   * @param req - Fastify request with multipart file.
   * @param res - Fastify reply to send the stream.
   */
  @Post('process/stream')
  @HttpCode(HttpStatus.OK)
  public async processStream(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No file uploaded');
    }

    // Parse params from form field (default to empty object if not provided)
    let dto = new ProcessImageStreamDto();
    const paramsField = data.fields['params'];
    
    // Helper to get value from Multipart field
    // @fastify/multipart types are a bit complex, we need to ensure we have a field with a value
    const paramValue = 
      paramsField && 
      !Array.isArray(paramsField) && 
      paramsField.type === 'field' 
        ? (paramsField as any).value 
        : undefined;

    if (paramValue) {
      try {
        const parsed = JSON.parse(paramValue as string);
        dto = plainToInstance(ProcessImageStreamDto, parsed);
        const errors = await validate(dto);
        if (errors.length > 0) {
          throw new BadRequestException(errors.toString());
        }
      } catch (e) {
        throw new BadRequestException('Invalid params format');
      }
    }

    const priority = dto.priority ?? 2;

    const result = await this.queueService.add(async () => {
      // Pass the stream directly to the service
      return this.imageProcessor.processStream(
        data.file,
        data.mimetype,
        dto.transform,
        dto.output,
      );
    }, priority);

    res.type(result.mimeType);
    res.header('Content-Disposition', `inline; filename="processed.${result.extension}"`);
    return res.send(result.stream);
  }

  /**
   * Extracts EXIF metadata from an image stream via multipart/form-data.
   *
   * @param req - Fastify request with multipart file.
   */
  @Post('exif/stream')
  @HttpCode(HttpStatus.OK)
  public async extractExifStream(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No file uploaded');
    }

    const priority = 2; // Default priority for EXIF extraction

    const result = await this.queueService.add(async () => {
      const exif = await this.exifService.extractFromStream(data.file, data.mimetype);
      return { exif };
    }, priority);

    return result;
  }
}
