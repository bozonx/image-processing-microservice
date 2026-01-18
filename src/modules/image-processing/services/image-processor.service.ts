import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { ProcessImageDto, TransformDto, OutputDto } from '../dto/process-image.dto.js';
import type { ImageDefaults, ImageConfig } from '../../../config/image.config.js';

interface ProcessResult {
  buffer: Buffer;
  size: number;
  mimeType: string;
  dimensions: { width: number; height: number };
  stats?: { beforeBytes: number; afterBytes: number; reductionPercent: number };
}

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
   * Processes an image based on the provided DTO.
   *
   * @param dto - Data Transfer Object containing base64 image, mimeType, and desired transformations/output settings.
   * @returns An object containing the processed buffer, dimensions, mimeType, and optimization stats.
   * @throws BadRequestException if the image is invalid or exceeds the size limit.
   */
  public async process(dto: ProcessImageDto): Promise<ProcessResult> {
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

      // Ensure we have correct format name for response
      const outputFormat = dto.output?.format ?? this.defaults.format ?? resultBuffer.info.format;

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
   * Validates the input image base64 and MIME type.
   *
   * @param base64Image - The image data in base64 format.
   * @param mimeType - The MIME type of the input image.
   * @returns The decoded Buffer of the image.
   * @throws BadRequestException if validation fails.
   */
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
