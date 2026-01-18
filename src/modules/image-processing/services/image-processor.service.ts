import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { ProcessImageDto, TransformDto, OutputDto } from '../dto/process-image.dto.js';
import type { ImageDefaults, ImageConfig } from '../../../config/image.config.js';


interface StreamProcessResult {
  stream: Readable;
  mimeType: string;
  extension: string;
}

/**
 * Service responsible for image processing using the sharp library.
 * Handles resizing, cropping, format conversion, and other transformations.
 */
@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);
  private readonly maxBytes: number;
  private readonly defaults: ImageDefaults;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.get<ImageConfig>('image')!;
    this.maxBytes = config.maxBytes;
    this.defaults = config.defaults;
  }


  /**
   * Processes an image stream based on the provided parameters.
   * Uses sharp pipeline to avoid loading the entire image into memory.
   *
   * @param inputStream - Readable stream of the input image.
   * @param mimeType - The MIME type of the input image.
   * @param transform - Transformation settings.
   * @param output - Output format settings.
   * @returns An object containing the processed image stream and metadata.
   */
  public async processStream(
    inputStream: Readable,
    mimeType: string,
    transform?: TransformDto,
    output?: OutputDto,
  ): Promise<StreamProcessResult> {
    if (!mimeType.startsWith('image/')) {
      throw new BadRequestException(`Invalid MIME type: ${mimeType}`);
    }

    const options = this.getSharpOptions(mimeType);
    // failOnError: false allows processing of "corrupt" images that are mostly valid
    let pipeline = sharp({ ...options, failOnError: false });

    pipeline = this.applyTransformations(pipeline, transform);
    pipeline = this.applyOutputFormat(pipeline, output);

    // Pipe the input stream into the sharp pipeline
    const resultStream = inputStream.pipe(pipeline);
    
    // Listen for pipeline errors to avoid unhandled stream errors
    pipeline.on('error', (err) => {
      this.logger.error({
        msg: 'Sharp pipeline error',
        error: err.message,
        stack: err.stack,
      });
    });

    const format = output?.format ?? this.defaults.format;

    this.logger.log({
      msg: 'Image stream processing started',
      format,
      mimeType,
    });

    return {
      stream: resultStream,
      mimeType: `image/${format}`,
      extension: format,
    };
  }


  /**
   * Returns specific sharp options based on MIME type (e.g., enabling animation for GIFs).
   */
  private getSharpOptions(mimeType: string): sharp.SharpOptions {
    const options: sharp.SharpOptions = {};
    if (mimeType === 'image/gif') {
      options.animated = true;
    }
    return options;
  }

  /**
   * Applies requested transformations (resize, crop, rotate, etc.) to the sharp pipeline.
   *
   * @param pipeline - The current sharp instance.
   * @param transform - The transformation parameters.
   */
  private applyTransformations(pipeline: sharp.Sharp, transform?: TransformDto): sharp.Sharp {
    if (!transform) {
      // Apply default auto-orient if no transform provided
      if (this.defaults.autoOrient) {
        return pipeline.rotate();
      }
      return pipeline;
    }

    // Auto-orient: handles rotation and mirroring based on EXIF tag
    const autoOrient = transform.autoOrient ?? this.defaults.autoOrient;
    if (autoOrient) {
      pipeline = pipeline.rotate();
    }

    // Crop: precise region extraction
    if (transform.crop) {
      pipeline = pipeline.extract(transform.crop);
    }

    // Resize: handles dimensions, fit modes, and enlargement constraints
    if (transform.resize) {
      const { resize } = transform;

      if (resize.maxDimension && (resize.width || resize.height)) {
        throw new BadRequestException('Cannot use maxDimension together with width/height');
      }

      if (resize.maxDimension) {
        pipeline = pipeline.resize(resize.maxDimension, resize.maxDimension, {
          fit: resize.fit ?? 'inside',
          withoutEnlargement: resize.withoutEnlargement ?? true,
        });
      } else if (resize.width || resize.height) {
        pipeline = pipeline.resize(resize.width, resize.height, {
          fit: resize.fit ?? 'inside',
          withoutEnlargement: resize.withoutEnlargement ?? true,
          position: resize.position as any,
        });
      }
    }

    // Flip/Flop
    if (transform.flip) pipeline = pipeline.flip();
    if (transform.flop) pipeline = pipeline.flop();

    // Manual rotation (after auto-orient)
    if (transform.rotate !== undefined) {
      pipeline = pipeline.rotate(transform.rotate);
    }

    // Background color (e.g., for flattening transparent images)
    if (transform.backgroundColor) {
      pipeline = pipeline.flatten({ background: transform.backgroundColor });
    }

    return pipeline;
  }

  /**
   * Applies output format and format-specific optimization settings.
   *
   * @param pipeline - The current sharp instance.
   * @param output - Output format and optimization parameters.
   */
  private applyOutputFormat(pipeline: sharp.Sharp, output?: OutputDto): sharp.Sharp {
    const format = output?.format ?? this.defaults.format;
    const quality = output?.quality ?? this.defaults.quality;
    const stripMetadata = output?.stripMetadata ?? this.defaults.stripMetadata;

    // By default, sharp strips most metadata unless .withMetadata() is called.
    // If we DON'T want to strip, we preserve it, but clear orientation to avoid double-rotation.
    if (!stripMetadata) {
      pipeline = pipeline.withMetadata({ orientation: undefined });
    }

    const config = this.configService.get<ImageConfig>('image')!;

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
          chromaSubsampling: output?.chromaSubsampling ?? config.avifChromaSubsampling,
        });
      case 'jpeg':
        return pipeline.jpeg({
          quality,
          progressive: output?.progressive ?? config.jpegProgressive,
          mozjpeg: output?.mozjpeg ?? config.jpegMozjpeg,
          chromaSubsampling: output?.chromaSubsampling ?? config.jpegChromaSubsampling,
        });
      case 'png':
        return pipeline.png({
          compressionLevel: output?.compressionLevel ?? config.pngCompressionLevel,
          palette: output?.palette ?? output?.quality !== undefined,
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
