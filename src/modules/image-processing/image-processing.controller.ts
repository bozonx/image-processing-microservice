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
   * Processes an image stream via multipart/form-data.
   * Tasks are added to the priority queue.
   *
   * @param req - Fastify request with multipart file.
   * @param res - Fastify reply to send the stream.
   */
  @Post('process')
  @HttpCode(HttpStatus.OK)
  public async process(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No file uploaded');
    }

    // Parse params from form field (default to empty object if not provided)
    let dto = new ProcessImageDto();
    const paramsField = data.fields['params'];
    
    const paramValue = 
      paramsField && 
      !Array.isArray(paramsField) && 
      paramsField.type === 'field' 
        ? (paramsField as any).value 
        : undefined;

    if (paramValue) {
      try {
        const parsed = JSON.parse(paramValue as string);
        dto = plainToInstance(ProcessImageDto, parsed);
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
   * Tasks are added to the priority queue.
   *
   * @param req - Fastify request with multipart file.
   */
  @Post('exif')
  @HttpCode(HttpStatus.OK)
  public async extractExif(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No file uploaded');
    }

    // Parse params from form field to get priority if provided
    let dto = new ExtractExifDto();
    const paramsField = data.fields['params'];
    const paramValue = 
      paramsField && 
      !Array.isArray(paramsField) && 
      paramsField.type === 'field' 
        ? (paramsField as any).value 
        : undefined;

    if (paramValue) {
      try {
        const parsed = JSON.parse(paramValue as string);
        dto = plainToInstance(ExtractExifDto, parsed);
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
      const exif = await this.exifService.extract(data.file, data.mimetype);
      return { exif };
    }, priority);

    return result;
  }
}
