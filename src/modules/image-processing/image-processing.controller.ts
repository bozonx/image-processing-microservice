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
import { finished } from 'node:stream/promises';
import { Readable } from 'node:stream';
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
    // Preliminary validation: check headers before reading the body
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('multipart/form-data')) {
      throw new BadRequestException('Invalid content type, expected multipart/form-data');
    }

    // Process multiple files (main file and optional watermark)
    const parts = req.files();
    let mainFileData: { buffer: Buffer; mimetype: string } | null = null;
    let watermarkFileData: { buffer: Buffer; mimetype: string } | null = null;
    let dto = new ProcessImageDto();

    for await (const part of parts) {
      if (part.type === 'file') {
        // Buffer the file in memory
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        if (part.fieldname === 'file') {
          mainFileData = { buffer, mimetype: part.mimetype };
        } else if (part.fieldname === 'watermark') {
          watermarkFileData = { buffer, mimetype: part.mimetype };
        }
      } else if (part.type === 'field' && part.fieldname === 'params') {
        // Parse params from form field
        try {
          // For field type, we need to read the value
          const fieldValue = await part.toBuffer();
          const parsed = JSON.parse(fieldValue.toString('utf-8'));
          dto = plainToInstance(ProcessImageDto, parsed);
          const errors = await validate(dto);
          if (errors.length > 0) {
            throw new BadRequestException(errors.toString());
          }
        } catch (e) {
          throw new BadRequestException('Invalid params format');
        }
      }
    }

    if (!mainFileData) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate watermark: if watermark config is provided, watermark file is required
    if (dto.transform?.watermark && !watermarkFileData) {
      throw new BadRequestException('Watermark file is required when watermark config is provided');
    }

    const priority = dto.priority ?? 2;

    // Use queue to process the image and hold the slot until the response is finished
    await this.queueService.add(async () => {
      const result = await this.imageProcessor.processStream(
        Readable.from(mainFileData.buffer),
        mainFileData.mimetype,
        dto.transform,
        dto.output,
        watermarkFileData ? {
          buffer: watermarkFileData.buffer,
          mimetype: watermarkFileData.mimetype,
        } : undefined,
      );

      res.type(result.mimeType);
      res.header('Content-Disposition', `inline; filename=\"processed.${result.extension}\"`);
      
      // Pipe the sharp output to the response
      res.send(result.stream);
      
      // Wait until the response is completely sent to the client
      await finished(res.raw);
    }, priority);
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
    // Preliminary validation
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('multipart/form-data')) {
      throw new BadRequestException('Invalid content type, expected multipart/form-data');
    }

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

    // Buffer for backpressure
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const priority = dto.priority ?? 2;

    const result = await this.queueService.add(async () => {
      const exif = await this.exifService.extract(Readable.from(buffer), data.mimetype);
      return { exif };
    }, priority);

    return result;
  }
}
