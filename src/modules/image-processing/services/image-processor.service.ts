import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { TransformDto, OutputDto, WatermarkDto } from '../dto/process-image.dto.js';
import type { ImageDefaults, ImageConfig } from '../../../config/image.config.js';

interface ProcessResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  size: number;
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
   * @param watermark - Optional watermark file data.
   * @returns An object containing the processed image stream and metadata.
   */
  public async processStream(
    inputStream: Readable,
    mimeType: string,
    transform?: TransformDto,
    output?: OutputDto,
    watermark?: { buffer: Buffer; mimetype: string },
    signal?: AbortSignal,
  ): Promise<ProcessResult> {
    if (!(mimeType.startsWith('image/') || mimeType === 'application/octet-stream')) {
      throw new BadRequestException(`Invalid MIME type: ${mimeType}`);
    }

    const options = this.getSharpOptions(mimeType);
    let pipeline = sharp({ ...options, failOnError: false });

    pipeline = this.applyTransformations(pipeline, transform);

    if (watermark && transform?.watermark) {
      const inputBuffer = await this.streamToBuffer(inputStream);
      pipeline = sharp(inputBuffer, { ...options, failOnError: false });
      pipeline = this.applyTransformations(pipeline, transform);

      const metadata = await pipeline.metadata();
      await this.applyWatermark(pipeline, watermark.buffer, transform.watermark, metadata);
    } else {
      inputStream.pipe(pipeline);
    }

    pipeline = this.applyOutputFormat(pipeline, output);

    const format = output?.format ?? this.defaults.format;
    const isRaw = format === 'raw';

    if (signal) {
      if (signal.aborted) {
        throw new Error('Request aborted');
      }
      signal.addEventListener(
        'abort',
        () => {
          pipeline.destroy();
        },
        { once: true },
      );
    }

    try {
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      this.logger.log({
        msg: 'Image processing finished',
        format,
        width: info.width,
        height: info.height,
        size: info.size,
      });

      return {
        buffer: data,
        mimeType: isRaw ? 'application/octet-stream' : `image/${format}`,
        extension: format,
        width: info.width,
        height: info.height,
        size: info.size,
      };
    } catch (err) {
      if (err.message === 'The operation was aborted' || err.message === 'Request aborted') {
        throw err;
      }

      this.logger.error({
        msg: 'Sharp pipeline error',
        error: err.message,
        stack: err.stack,
      });

      throw err;
    }
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
          fit: resize.fit ?? 'cover',
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

    // Flatten: remove alpha channel and replace with background color
    if (transform.flatten) {
      pipeline = pipeline.flatten({ background: transform.flatten });
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
      case 'raw':
        return pipeline.raw();
      default:
        throw new BadRequestException(`Unsupported format: ${format}`);
    }
  }

  /**
   * Converts a Readable stream to a Buffer.
   *
   * @param stream - The input stream.
   * @returns A promise that resolves to a Buffer.
   */
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Applies watermark to the image pipeline.
   *
   * @param pipeline - The current sharp instance.
   * @param watermarkBuffer - Buffer containing the watermark image.
   * @param watermarkConfig - Watermark configuration.
   * @param metadata - Metadata of the main image.
   */
  private async applyWatermark(
    pipeline: sharp.Sharp,
    watermarkBuffer: Buffer,
    watermarkConfig: WatermarkDto,
    metadata: sharp.Metadata,
  ): Promise<void> {
    const { width = 0, height = 0 } = metadata;

    if (watermarkConfig.mode === 'tile') {
      // "Tile" mode: cover the entire area
      const composites = await this.createTiledWatermark(
        watermarkBuffer,
        watermarkConfig,
        width,
        height,
      );
      pipeline.composite(composites);
    } else {
      // "Single" mode: single watermark
      const composite = await this.createSingleWatermark(
        watermarkBuffer,
        watermarkConfig,
        width,
        height,
      );
      pipeline.composite([composite]);
    }
  }

  /**
   * Creates a single watermark overlay.
   *
   * @param watermarkBuffer - Buffer containing the watermark image.
   * @param config - Watermark configuration.
   * @param imageWidth - Width of the main image.
   * @param imageHeight - Height of the main image.
   * @returns Sharp overlay options.
   */
  private async createSingleWatermark(
    watermarkBuffer: Buffer,
    config: WatermarkDto,
    imageWidth: number,
    imageHeight: number,
  ): Promise<sharp.OverlayOptions> {
    // Watermark scaling
    const scaledWatermark = await this.scaleWatermark(
      watermarkBuffer,
      config.scale ?? 10,
      imageWidth,
      imageHeight,
      config.opacity,
    );

    return {
      input: scaledWatermark,
      gravity: (config.position ?? 'southeast') as any,
    };
  }

  /**
   * Creates tiled watermark overlays.
   *
   * @param watermarkBuffer - Buffer containing the watermark image.
   * @param config - Watermark configuration.
   * @param imageWidth - Width of the main image.
   * @param imageHeight - Height of the main image.
   * @returns Array of Sharp overlay options.
   */
  private async createTiledWatermark(
    watermarkBuffer: Buffer,
    config: WatermarkDto,
    imageWidth: number,
    imageHeight: number,
  ): Promise<sharp.OverlayOptions[]> {
    // Watermark scaling
    const scaledWatermark = await this.scaleWatermark(
      watermarkBuffer,
      config.scale ?? 10,
      imageWidth,
      imageHeight,
      config.opacity,
    );

    // Get scaled watermark dimensions
    const wmMetadata = await sharp(scaledWatermark).metadata();
    const wmWidth = wmMetadata.width ?? 0;
    const wmHeight = wmMetadata.height ?? 0;
    const spacing = config.spacing ?? 0;

    // Calculate the number of repetitions
    const cols = Math.ceil(imageWidth / (wmWidth + spacing));
    const rows = Math.ceil(imageHeight / (wmHeight + spacing));

    // Create composites array
    const composites: sharp.OverlayOptions[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        composites.push({
          input: scaledWatermark,
          top: row * (wmHeight + spacing),
          left: col * (wmWidth + spacing),
        });
      }
    }

    return composites;
  }

  /**
   * Scales and optionally adjusts opacity of the watermark.
   *
   * @param watermarkBuffer - Buffer containing the watermark image.
   * @param scalePercent - Scale percentage relative to the smaller dimension of the main image.
   * @param imageWidth - Width of the main image.
   * @param imageHeight - Height of the main image.
   * @param opacity - Optional opacity (0-1).
   * @returns Scaled watermark buffer.
   */
  private async scaleWatermark(
    watermarkBuffer: Buffer,
    scalePercent: number,
    imageWidth: number,
    imageHeight: number,
    opacity?: number,
  ): Promise<Buffer> {
    const targetSize = Math.min(imageWidth, imageHeight) * (scalePercent / 100);

    let pipeline = sharp(watermarkBuffer).resize({
      width: Math.round(targetSize),
      height: Math.round(targetSize),
      fit: 'inside',
      withoutEnlargement: true,
    });

    // Apply opacity if specified
    if (opacity !== undefined && opacity < 1) {
      // Ensure the image has an alpha channel and composite with opacity
      pipeline = pipeline.ensureAlpha().composite([
        {
          input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
          raw: {
            width: 1,
            height: 1,
            channels: 4,
          },
          tile: true,
          blend: 'dest-in',
        },
      ]);
    }

    return pipeline.toBuffer();
  }
}
