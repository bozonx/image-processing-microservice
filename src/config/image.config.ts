import { registerAs } from '@nestjs/config';
import { IsInt, IsString, IsBoolean, Min, Max, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { validateConfig } from './validate-config.js';

/**
 * Absolute ceiling on any image dimension, in pixels.
 *
 * `IMAGE_MAX_DIMENSION` can only tighten this, never raise it, so there is always an upper
 * bound on how much a single request can ask the encoder to allocate.
 */
export const MAX_SUPPORTED_DIMENSION = 8192;

export enum DefaultImageFormat {
  WEBP = 'webp',
  AVIF = 'avif',
  JPEG = 'jpeg',
  PNG = 'png',
  GIF = 'gif',
  TIFF = 'tiff',
  RAW = 'raw',
}

export class QueueConfig {
  @IsInt()
  @Min(1)
  @Max(64)
  public maxConcurrency!: number;

  @IsInt()
  @Min(0)
  public maxQueueSize!: number;

  @IsInt()
  @Min(1000)
  public timeout!: number;

  @IsInt()
  @Min(1000)
  public requestTimeout!: number;
}

export class ImageDefaults {
  @IsEnum(DefaultImageFormat)
  public format!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  public quality!: number;

  @IsInt()
  @Min(0)
  @Max(9)
  public effort!: number;

  @IsBoolean()
  public lossless!: boolean;

  @IsBoolean()
  public stripMetadata!: boolean;

  @IsBoolean()
  public autoOrient!: boolean;
}

export class ImageConfig {
  @IsInt()
  @Min(1024 * 1024)
  public maxBytes!: number;

  /**
   * Hard ceiling on the pixel count of a decoded input, passed to sharp's `limitInputPixels`.
   *
   * `maxBytes` bounds the compressed upload, not what it expands to: a 2 MB PNG can decode to
   * tens of gigabytes. Budget roughly 4 bytes per pixel per concurrent task and keep the product
   * below the container's memory limit.
   */
  @IsInt()
  @Min(1)
  public maxInputPixels!: number;

  /**
   * Hard ceiling on the width and height of a returned image; 0 disables the check.
   *
   * This is a limit, not a default: requests that ask for more are rejected rather than quietly
   * shrunk, and an untouched image larger than the ceiling is scaled down to fit inside it.
   */
  @IsInt()
  @Min(0)
  @Max(MAX_SUPPORTED_DIMENSION)
  public maxDimension!: number;

  @ValidateNested()
  @Type(() => QueueConfig)
  public queue!: QueueConfig;

  @ValidateNested()
  @Type(() => ImageDefaults)
  public defaults!: ImageDefaults;

  @IsString()
  public avifChromaSubsampling!: string;

  @IsBoolean()
  public jpegProgressive!: boolean;

  @IsBoolean()
  public jpegMozjpeg!: boolean;

  @IsString()
  public jpegChromaSubsampling!: string;

  @IsInt()
  @Min(0)
  @Max(9)
  public pngCompressionLevel!: number;
}

export default registerAs('image', (): ImageConfig =>
  validateConfig(
    ImageConfig,
    {
      maxBytes: parseInt(process.env.FILE_MAX_BYTES_MB ?? '100', 10) * 1024 * 1024,
      maxInputPixels: parseInt(process.env.IMAGE_MAX_INPUT_PIXELS ?? '25000000', 10),
      maxDimension: parseInt(process.env.IMAGE_MAX_DIMENSION ?? '0', 10),
      queue: {
        maxConcurrency: parseInt(process.env.MAX_CONCURRENCY ?? '4', 10),
        maxQueueSize: parseInt(process.env.QUEUE_MAX_SIZE ?? '100', 10),
        timeout: parseInt(process.env.QUEUE_TIMEOUT_SECONDS ?? '60', 10) * 1000,
        requestTimeout: parseInt(process.env.REQUEST_TIMEOUT_SECONDS ?? '120', 10) * 1000,
      },
      defaults: {
        format: process.env.IMAGE_DEFAULT_FORMAT ?? DefaultImageFormat.WEBP,
        quality: 80,
        effort: 4,
        lossless: false,
        stripMetadata: false,
        autoOrient: true,
      },
      avifChromaSubsampling: '4:2:0',
      jpegProgressive: false,
      jpegMozjpeg: false,
      jpegChromaSubsampling: '4:2:0',
      pngCompressionLevel: 6,
    },
    'Image',
  ),
);
