import { Injectable, Logger, BadRequestException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import type { Metadata, OverlayOptions, Sharp, SharpOptions } from 'sharp';
import { Readable } from 'node:stream';
import { TransformDto, OutputDto, WatermarkDto } from '../dto/process-image.dto.js';
import type { ImageDefaults, ImageConfig } from '../../../config/image.config.js';
import { isAbortError, RequestAbortedError } from '../client-connection.js';

/** A processed image and the metadata the response headers describe it with. */
export interface ProcessResult {
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
  private readonly imageConfig: ImageConfig;

  constructor(private readonly configService: ConfigService) {
    this.imageConfig = this.configService.getOrThrow<ImageConfig>('image');
    this.maxBytes = this.imageConfig.maxBytes;
    this.defaults = this.imageConfig.defaults;
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

    this.assertRequestedDimensions(transform);

    try {
      const options = this.getSharpOptions(mimeType);
      let pipeline: Sharp;

      if (watermark && transform?.watermark) {
        // A watermark has to be composited against known dimensions, so this is the one path
        // that cannot stay streaming: the input is read into memory first.
        const inputBuffer = await this.streamToBuffer(inputStream);
        const metadata = await sharp(inputBuffer, options).metadata();
        const dimensions = this.calculateTransformedDimensions(metadata, transform);

        pipeline = sharp(inputBuffer, { ...options, failOn: 'none' });
        pipeline = this.applyTransformations(pipeline, transform);
        await this.applyWatermark(pipeline, watermark.buffer, transform.watermark, dimensions);
      } else {
        pipeline = sharp({ ...options, failOn: 'none' });
        pipeline = this.applyTransformations(pipeline, transform);
        inputStream.pipe(pipeline);
      }

      pipeline = this.applyDimensionCap(pipeline, transform);
      pipeline = this.applyOutputFormat(pipeline, output);

      const format = output?.format ?? this.defaults.format;
      const isRaw = format === 'raw';

      if (signal) {
        if (signal.aborted) {
          throw new RequestAbortedError();
        }
        signal.addEventListener(
          'abort',
          () => {
            pipeline.destroy();
          },
          { once: true },
        );
      }

      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

      this.assertResultDimensions(info.width, info.height);

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
      if (err instanceof HttpException) {
        throw err;
      }

      if (isAbortError(err)) {
        throw err;
      }

      const error = err instanceof Error ? err : new Error(String(err));

      this.logger.warn({
        msg: 'Sharp pipeline error mapped to BadRequestException',
        error: error.message,
      });

      throw new BadRequestException(`Failed to process image: ${error.message}`);
    }
  }

  /**
   * Returns specific sharp options based on MIME type (e.g., enabling animation for GIFs).
   */
  private getSharpOptions(mimeType: string): SharpOptions {
    // `maxBytes` bounds the compressed upload; this bounds what it decodes to. Without it a
    // small, highly compressed file can expand past the container's memory limit and take the
    // whole process down, not just its own request.
    const options: SharpOptions = { limitInputPixels: this.imageConfig.maxInputPixels };
    if (mimeType === 'image/gif') {
      options.animated = true;
    }
    return options;
  }

  /**
   * Rejects a resize that asks for more than `IMAGE_MAX_DIMENSION` allows.
   *
   * Requested sizes are refused rather than silently clamped: the caller named an exact size,
   * so quietly returning a different one would be a surprise discovered downstream.
   *
   * @param transform - The transformation parameters.
   * @throws BadRequestException when a requested dimension exceeds the ceiling.
   */
  private assertRequestedDimensions(transform?: TransformDto): void {
    const cap = this.imageConfig.maxDimension;
    if (cap <= 0 || !transform?.resize) {
      return;
    }

    const { resize } = transform;
    for (const [name, value] of [
      ['width', resize.width],
      ['height', resize.height],
      ['maxDimension', resize.maxDimension],
    ] as const) {
      if (value !== undefined && value > cap) {
        throw new BadRequestException(
          `transform.resize.${name} (${value}) exceeds the maximum allowed dimension of ${cap}`,
        );
      }
    }
  }

  /**
   * Appends the dimension ceiling as a resize step when the request has none of its own.
   *
   * Sharp keeps only the last `resize()` call, so this may never be combined with a caller's
   * resize — doing so would silently discard what the caller asked for.
   *
   * @param pipeline - The current sharp instance.
   * @param transform - The transformation parameters.
   * @returns The pipeline, capped when the request left room for it.
   */
  private applyDimensionCap(pipeline: Sharp, transform?: TransformDto): Sharp {
    const cap = this.imageConfig.maxDimension;
    const hasOwnResize = Boolean(
      transform?.resize?.width ?? transform?.resize?.height ?? transform?.resize?.maxDimension,
    );

    if (cap <= 0 || hasOwnResize) {
      return pipeline;
    }

    return pipeline.resize(cap, cap, { fit: 'inside', withoutEnlargement: true });
  }

  /**
   * Rejects a result that exceeds the dimension ceiling despite a valid request.
   *
   * `fit: 'outside'`, an angled `rotate` and a large `crop` can all push the output past the
   * ceiling even when every requested number was within it. Re-encoding a second time would
   * cost more than it saves for a case this rare, so the request is refused instead.
   *
   * @param width - Width of the produced image.
   * @param height - Height of the produced image.
   * @throws BadRequestException when the result exceeds the ceiling.
   */
  private assertResultDimensions(width: number, height: number): void {
    const cap = this.imageConfig.maxDimension;
    if (cap <= 0 || (width <= cap && height <= cap)) {
      return;
    }

    throw new BadRequestException(
      `Resulting image (${width}x${height}) exceeds the maximum allowed dimension of ${cap}`,
    );
  }

  /**
   * Calculates the approximate dimensions of the image after transformations (auto-orient, rotate, crop, resize).
   * Used for watermark scaling and tiling calculations without re-encoding to an intermediate buffer.
   */
  private calculateTransformedDimensions(
    metadata: Metadata,
    transform?: TransformDto,
  ): { width: number; height: number } {
    let width = metadata.width;
    let height = metadata.height;

    if (!transform) {
      if (
        this.defaults.autoOrient &&
        metadata.orientation &&
        metadata.orientation >= 5 &&
        metadata.orientation <= 8
      ) {
        [width, height] = [height, width];
      }
      return { width, height };
    }

    const autoOrient = transform.autoOrient ?? this.defaults.autoOrient;
    if (
      autoOrient &&
      metadata.orientation &&
      metadata.orientation >= 5 &&
      metadata.orientation <= 8
    ) {
      [width, height] = [height, width];
    }

    if (transform.rotate !== undefined) {
      const normalizedRotate = ((transform.rotate % 360) + 360) % 360;
      if (normalizedRotate === 90 || normalizedRotate === 270) {
        [width, height] = [height, width];
      }
    }

    if (transform.crop) {
      width = Math.min(width, transform.crop.width);
      height = Math.min(height, transform.crop.height);
    }

    if (transform.resize) {
      const { resize } = transform;
      if (resize.maxDimension) {
        const maxDim = resize.maxDimension;
        const withoutEnlargement = resize.withoutEnlargement ?? true;
        if (!withoutEnlargement || width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / Math.max(width, 1), maxDim / Math.max(height, 1));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }
      } else if (resize.width && resize.height) {
        const fit = resize.fit ?? 'cover';
        const withoutEnlargement = resize.withoutEnlargement ?? true;
        if (fit === 'inside') {
          if (!withoutEnlargement || width > resize.width || height > resize.height) {
            const scale = Math.min(
              resize.width / Math.max(width, 1),
              resize.height / Math.max(height, 1),
            );
            width = Math.max(1, Math.round(width * scale));
            height = Math.max(1, Math.round(height * scale));
          }
        } else if (fit === 'outside') {
          if (!withoutEnlargement || width > resize.width || height > resize.height) {
            const scale = Math.max(
              resize.width / Math.max(width, 1),
              resize.height / Math.max(height, 1),
            );
            width = Math.max(1, Math.round(width * scale));
            height = Math.max(1, Math.round(height * scale));
          }
        } else {
          // cover, contain, fill
          if (
            withoutEnlargement &&
            width < resize.width &&
            height < resize.height &&
            fit === 'cover'
          ) {
            // Keep current width/height
          } else {
            width = resize.width;
            height = resize.height;
          }
        }
      } else if (resize.width) {
        const scale = resize.width / Math.max(width, 1);
        const withoutEnlargement = resize.withoutEnlargement ?? true;
        if (!withoutEnlargement || resize.width <= width) {
          width = resize.width;
          height = Math.max(1, Math.round(height * scale));
        }
      } else if (resize.height) {
        const scale = resize.height / Math.max(height, 1);
        const withoutEnlargement = resize.withoutEnlargement ?? true;
        if (!withoutEnlargement || resize.height <= height) {
          height = resize.height;
          width = Math.max(1, Math.round(width * scale));
        }
      }
    }

    return { width, height };
  }

  /**
   * Applies requested transformations (resize, crop, rotate, etc.) to the sharp pipeline.
   *
   * @param pipeline - The current sharp instance.
   * @param transform - The transformation parameters.
   */
  private applyTransformations(pipeline: Sharp, transform?: TransformDto): Sharp {
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
          position: resize.position,
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
  private applyOutputFormat(pipeline: Sharp, output?: OutputDto): Sharp {
    const format = output?.format ?? this.defaults.format;
    const quality = output?.quality ?? this.defaults.quality;
    const stripMetadata = output?.stripMetadata ?? this.defaults.stripMetadata;

    // By default, sharp strips most metadata unless .withMetadata() is called.
    // If we DON'T want to strip, we preserve it, but clear orientation to avoid double-rotation.
    if (!stripMetadata) {
      pipeline = pipeline.withMetadata({ orientation: undefined });
    }

    const config = this.imageConfig;

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
        return pipeline.gif({
          effort:
            output?.effort !== undefined
              ? Math.max(1, Math.min(10, output.effort))
              : Math.max(1, Math.min(10, this.defaults.effort || 7)),
          colors: output?.colors,
          dither: output?.dither,
          progressive: output?.progressive,
        });
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
    pipeline: Sharp,
    watermarkBuffer: Buffer,
    watermarkConfig: WatermarkDto,
    metadata: { width?: number; height?: number } | Metadata,
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
  ): Promise<OverlayOptions> {
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
      gravity: config.position ?? 'southeast',
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
  ): Promise<OverlayOptions[]> {
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
    const wmWidth = wmMetadata.width;
    const wmHeight = wmMetadata.height;
    const spacing = config.spacing ?? 0;

    if (wmWidth <= 0 || wmHeight <= 0) {
      throw new BadRequestException('Invalid watermark dimensions');
    }

    const stepX = wmWidth + spacing;
    const stepY = wmHeight + spacing;

    if (stepX <= 0 || stepY <= 0) {
      throw new BadRequestException('Watermark dimensions with spacing must be positive');
    }

    // Calculate the number of repetitions
    const cols = Math.ceil(imageWidth / stepX);
    const rows = Math.ceil(imageHeight / stepY);
    const totalTiles = cols * rows;

    const MAX_WATERMARK_TILES = 2000;
    if (totalTiles > MAX_WATERMARK_TILES) {
      throw new BadRequestException(
        `Watermark tile count (${totalTiles}) exceeds limit of ${MAX_WATERMARK_TILES}`,
      );
    }

    // Create composites array
    const composites: OverlayOptions[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        composites.push({
          input: scaledWatermark,
          top: row * stepY,
          left: col * stepX,
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
    const rawTargetSize = Math.min(imageWidth, imageHeight) * (scalePercent / 100);
    const targetSize = Math.max(1, Math.round(rawTargetSize));

    let pipeline = sharp(watermarkBuffer).resize({
      width: targetSize,
      height: targetSize,
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
