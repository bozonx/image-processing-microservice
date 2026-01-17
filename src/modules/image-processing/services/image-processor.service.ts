import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { ProcessImageDto } from '../dto/process-image.dto.js';

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);
  private readonly maxBytes: number;
  private readonly defaults: any;

  constructor(private readonly configService: ConfigService) {
    this.maxBytes = this.configService.get<number>('image.maxBytes', 25 * 1024 * 1024);
    this.defaults = this.configService.get('image.defaults', {});
  }

  async process(dto: ProcessImageDto): Promise<{
    buffer: Buffer;
    size: number;
    mimeType: string;
    dimensions: { width: number; height: number };
    stats?: { beforeBytes: number; afterBytes: number; reductionPercent: number };
  }> {
    // Decode base64
    const inputBuffer = Buffer.from(dto.image, 'base64');

    // Check size
    if (inputBuffer.length > this.maxBytes) {
      throw new BadRequestException(
        `Image size ${inputBuffer.length} bytes exceeds maximum ${this.maxBytes} bytes`,
      );
    }

    // Check MIME type
    if (!dto.mimeType.startsWith('image/')) {
      throw new BadRequestException(`Invalid MIME type: ${dto.mimeType}`);
    }

    const startTime = Date.now();
    const beforeBytes = inputBuffer.length;

    try {
      let pipeline = sharp(inputBuffer);

      // Auto-orient (EXIF)
      // autoRotate is the new name, autoOrient is for backward compatibility
      const autoRotate = dto.transform?.autoRotate ?? dto.transform?.autoOrient ?? this.defaults.autoRotate ?? this.defaults.autoOrient;
      if (autoRotate) {
        pipeline = pipeline.rotate();
      }

      // Crop
      if (dto.transform?.crop) {
        pipeline = pipeline.extract(dto.transform.crop);
      }

      // Resize
      if (dto.transform?.resize) {
        const resize = dto.transform.resize;

        // Validation: cannot use maxDimension and width/height together
        if (resize.maxDimension && (resize.width || resize.height)) {
          throw new BadRequestException(
            'Cannot use maxDimension together with width/height',
          );
        }

        if (resize.maxDimension) {
          // Proportional resize
          pipeline = pipeline.resize(resize.maxDimension, resize.maxDimension, {
            fit: resize.fit || 'inside',
            withoutEnlargement: resize.withoutEnlargement ?? true,
          });
        } else if (resize.width || resize.height) {
          // Exact dimensions
          pipeline = pipeline.resize(resize.width, resize.height, {
            fit: resize.fit || 'inside',
            withoutEnlargement: resize.withoutEnlargement ?? true,
            position: resize.position as any,
          });
        }
      }

      // Flip/Flop
      if (dto.transform?.flip) {
        pipeline = pipeline.flip();
      }
      if (dto.transform?.flop) {
        pipeline = pipeline.flop();
      }

      // Custom Rotate
      if (dto.transform?.rotate !== undefined) {
        pipeline = pipeline.rotate(dto.transform.rotate);
      }

      // Output format
      const format = dto.output?.format || this.defaults.format;
      const quality = dto.output?.quality ?? this.defaults.quality;
      const stripMetadata = dto.output?.stripMetadata ?? this.defaults.stripMetadata;

      if (stripMetadata) {
        pipeline = pipeline.withMetadata({ orientation: undefined });
      }

      // Format-specific options
      switch (format) {
        case 'webp':
          pipeline = pipeline.webp({
            quality,
            lossless: dto.output?.lossless ?? this.defaults.lossless,
            effort: dto.output?.effort ?? this.defaults.effort,
          });
          break;
        case 'avif':
          pipeline = pipeline.avif({
            quality,
            lossless: dto.output?.lossless ?? this.defaults.lossless,
            effort: dto.output?.effort ?? this.defaults.effort,
            chromaSubsampling: dto.output?.chromaSubsampling ?? this.configService.get('image.avif.chromaSubsampling', '4:2:0'),
          });
          break;
        case 'jpeg':
          pipeline = pipeline.jpeg({
            quality,
            progressive: dto.output?.progressive ?? this.configService.get('image.jpeg.progressive', false),
            mozjpeg: dto.output?.mozjpeg ?? this.configService.get('image.jpeg.mozjpeg', false),
          });
          break;
        case 'png':
          pipeline = pipeline.png({
            compressionLevel: dto.output?.compressionLevel ?? this.configService.get('image.png.compressionLevel', 6),
          });
          break;
        case 'gif':
          pipeline = pipeline.gif();
          break;
        case 'tiff':
          pipeline = pipeline.tiff({ quality });
          break;
        default:
          throw new BadRequestException(`Unsupported format: ${format}`);
      }

      // Execute processing
      const resultBuffer = await pipeline.toBuffer({ resolveWithObject: true });
      const afterBytes = resultBuffer.data.length;
      const duration = Date.now() - startTime;

      const stats = {
        beforeBytes,
        afterBytes,
        reductionPercent: Number(((1 - afterBytes / beforeBytes) * 100).toFixed(1)),
      };

      this.logger.log({
        msg: 'Image processed',
        duration,
        ...stats,
        format,
        quality,
        dimensions: {
          width: resultBuffer.info.width,
          height: resultBuffer.info.height,
        },
      });

      return {
        buffer: resultBuffer.data,
        size: afterBytes,
        mimeType: `image/${format}`,
        dimensions: {
          width: resultBuffer.info.width,
          height: resultBuffer.info.height,
        },
        stats,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.error({
        msg: 'Image processing failed',
        duration,
        error: errorMessage,
      });

      throw error;
    }
  }
}
