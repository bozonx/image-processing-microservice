import { registerAs } from '@nestjs/config';
import {
  IsInt,
  IsString,
  IsBoolean,
  Min,
  Max,
  IsEnum,
  validateSync,
  ValidateNested,
} from 'class-validator';
import { plainToClass, Type } from 'class-transformer';

export enum DefaultImageFormat {
  WEBP = 'webp',
  AVIF = 'avif',
  JPEG = 'jpeg',
  PNG = 'png',
  GIF = 'gif',
  TIFF = 'tiff',
}

export class QueueConfig {
  @IsInt()
  @Min(1)
  @Max(64)
  public maxConcurrency!: number;

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
  public maxDimension!: number;

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

export default registerAs('image', (): ImageConfig => {
  const config = plainToClass(ImageConfig, {
    maxBytes: parseInt(process.env.FILE_MAX_BYTES_MB ?? '25', 10) * 1024 * 1024,
    queue: {
      maxConcurrency: parseInt(process.env.HEAVY_TASKS_MAX_CONCURRENCY ?? '4', 10),
      timeout: parseInt(process.env.HEAVY_TASKS_QUEUE_TIMEOUT_MS ?? '30000', 10),
      requestTimeout: parseInt(process.env.HEAVY_TASKS_REQUEST_TIMEOUT_MS ?? '60000', 10),
    },
    defaults: {
      format: process.env.IMAGE_DEFAULT_FORMAT ?? DefaultImageFormat.WEBP,
      maxDimension: 3840,
      quality: 80,
      effort: 6,
      lossless: false,
      stripMetadata: false,
      autoOrient: true,
    },
    avifChromaSubsampling: '4:2:0',
    jpegProgressive: false,
    jpegMozjpeg: false,
    jpegChromaSubsampling: '4:2:0',
    pngCompressionLevel: 6,
  });

  const errors = validateSync(config, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors.map(err => Object.values(err.constraints ?? {}).join(', '));
    throw new Error(`Image config validation error: ${errorMessages.join('; ')}`);
  }

  return config;
});
