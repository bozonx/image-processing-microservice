import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { ProcessImageDto, TransformDto, OutputDto } from '../dto/process-image.dto.js';

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
    const inputBuffer = this.validateImage(dto.image, dto.mimeType);
    const startTime = Date.now();
    const beforeBytes = inputBuffer.length;

    try {
      const options = this.getSharpOptions(dto.mimeType);
      let pipeline = sharp(inputBuffer, options);

      pipeline = this.applyTransformations(pipeline, dto.transform);
      pipeline = this.applyOutputFormat(pipeline, dto.output);

      const resultBuffer = await pipeline.toBuffer({ resolveWithObject: true });
      const afterBytes = resultBuffer.data.length;
      const duration = Date.now() - startTime;

      // Ensure we have correct format name for response (e.g. 'jpeg' instead of undefined)
      const outputFormat = dto.output?.format || this.defaults.format || resultBuffer.info.format;
      
      const stats = {
        beforeBytes,
        afterBytes,
        reductionPercent: Number(((1 - afterBytes / beforeBytes) * 100).toFixed(1)),
      };

      this.logger.log({
        msg: 'Image processed',
        duration,
        ...stats,
        format: outputFormat,
        quality: dto.output?.quality ?? this.defaults.quality,
        dimensions: {
          width: resultBuffer.info.width,
          height: resultBuffer.info.height,
        },
      });

      return {
        buffer: resultBuffer.data,
        size: afterBytes,
        mimeType: `image/${outputFormat}`,
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

  private validateImage(base64Image: string, mimeType: string): Buffer {
    if (!mimeType.startsWith('image/')) {
      throw new BadRequestException(`Invalid MIME type: ${mimeType}`);
    }

    const buffer = Buffer.from(base64Image, 'base64');
    if (buffer.length > this.maxBytes) {
      throw new BadRequestException(
        `Image size ${buffer.length} bytes exceeds maximum ${this.maxBytes} bytes`,
      );
    }

    return buffer;
  }

  private getSharpOptions(mimeType: string): sharp.SharpOptions {
    const options: sharp.SharpOptions = {};
    if (mimeType === 'image/gif') {
      options.animated = true;
    }
    return options;
  }

  private applyTransformations(pipeline: sharp.Sharp, transform?: TransformDto): sharp.Sharp {
    if (!transform) {
      // Apply defaults if no transform provided?
      // Logic in previous code: const autoOrient = dto.transform?.autoOrient ?? this.defaults.autoOrient;
      // This implies checking defaults even if transform is undefined, but only if we process "autoOrient".
      // But typically "autoOrient" default is true. 
      // So we should probably check it.
      // However, if transform is undefined, existing logic effectively does:
      // autoOrient = undefined ?? default.
      // So yes, we need to handle default autoOrient even if transform is undefined.
      
      const defaultAutoOrient = this.defaults.autoOrient;
      if (defaultAutoOrient) {
        return pipeline.rotate();
      }
      return pipeline;
    }

    // Auto-orient
    const autoOrient = transform.autoOrient ?? this.defaults.autoOrient;
    if (autoOrient) {
      pipeline = pipeline.rotate();
    }

    // Crop
    if (transform.crop) {
      pipeline = pipeline.extract(transform.crop);
    }

    // Resize
    if (transform.resize) {
      const { resize } = transform;

      // Validation
      if (resize.maxDimension && (resize.width || resize.height)) {
        throw new BadRequestException('Cannot use maxDimension together with width/height');
      }

      if (resize.maxDimension) {
        pipeline = pipeline.resize(resize.maxDimension, resize.maxDimension, {
          fit: resize.fit || 'inside',
          withoutEnlargement: resize.withoutEnlargement ?? true,
        });
      } else if (resize.width || resize.height) {
        pipeline = pipeline.resize(resize.width, resize.height, {
          fit: resize.fit || 'inside',
          withoutEnlargement: resize.withoutEnlargement ?? true,
          position: resize.position as any,
        });
      }
    }

    // Flip/Flop
    if (transform.flip) pipeline = pipeline.flip();
    if (transform.flop) pipeline = pipeline.flop();

    // Custom Rotate
    if (transform.rotate !== undefined) {
      pipeline = pipeline.rotate(transform.rotate);
    }

    // Background color
    if (transform.backgroundColor) {
      pipeline = pipeline.flatten({ background: transform.backgroundColor });
    }

    return pipeline;
  }

  private applyOutputFormat(pipeline: sharp.Sharp, output?: OutputDto): sharp.Sharp {
    const format = output?.format || this.defaults.format;
    const quality = output?.quality ?? this.defaults.quality;
    const stripMetadata = output?.stripMetadata ?? this.defaults.stripMetadata;

    if (stripMetadata) {
      pipeline = pipeline.withMetadata({ orientation: undefined });
    }

    switch (format) {
      case 'webp':
        return pipeline.webp({
          quality,
          lossless: output?.lossless ?? this.defaults.lossless,
          effort: output?.effort ?? this.defaults.effort,
        });
      case 'avif':
        return pipeline.avif({
          quality,
          lossless: output?.lossless ?? this.defaults.lossless,
          effort: output?.effort ?? this.defaults.effort,
          chromaSubsampling: output?.chromaSubsampling ?? this.configService.get('image.avif.chromaSubsampling', '4:2:0'),
        });
      case 'jpeg':
        return pipeline.jpeg({
          quality,
          progressive: output?.progressive ?? this.configService.get('image.jpeg.progressive', false),
          mozjpeg: output?.mozjpeg ?? this.configService.get('image.jpeg.mozjpeg', false),
          chromaSubsampling: output?.chromaSubsampling ?? this.configService.get('image.jpeg.chromaSubsampling', '4:2:0'),
        });
      case 'png':
        return pipeline.png({
          compressionLevel: output?.compressionLevel ?? this.configService.get('image.png.compressionLevel', 6),
          palette: output?.palette ?? (output?.quality !== undefined),
          quality: output?.quality,
          effort: output?.effort ?? this.defaults.effort,
          colors: output?.colors,
          dither: output?.dither,
          adaptiveFiltering: output?.adaptiveFiltering,
        });
      case 'gif':
        return pipeline.gif();
      case 'tiff':
        return pipeline.tiff({ quality });
      default:
        throw new BadRequestException(`Unsupported format: ${format}`);
    }
  }
}
