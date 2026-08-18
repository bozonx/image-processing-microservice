import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsIn,
  Matches,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ImageFormat {
  WEBP = 'webp',
  AVIF = 'avif',
  JPEG = 'jpeg',
  PNG = 'png',
  GIF = 'gif',
  TIFF = 'tiff',
  RAW = 'raw',
}

export const RESIZE_POSITIONS = [
  'top',
  'right top',
  'right',
  'right bottom',
  'bottom',
  'left bottom',
  'left',
  'left top',
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
  'center',
  'centre',
  'entropy',
  'attention',
] as const;

export type ResizePosition = (typeof RESIZE_POSITIONS)[number];

export const CHROMA_SUBSAMPLINGS = ['4:2:0', '4:2:2', '4:4:4'] as const;
export type ChromaSubsampling = (typeof CHROMA_SUBSAMPLINGS)[number];

export class ResizeDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  public maxDimension?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  public width?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  public height?: number;

  @IsOptional()
  @IsEnum(['cover', 'contain', 'fill', 'inside', 'outside'])
  public fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

  @IsOptional()
  @IsBoolean()
  public withoutEnlargement?: boolean;

  @IsOptional()
  @IsIn(RESIZE_POSITIONS)
  public position?: ResizePosition;
}

export class ExtractDto {
  @IsNumber()
  @Min(0)
  public left!: number;

  @IsNumber()
  @Min(0)
  public top!: number;

  @IsNumber()
  @Min(1)
  public width!: number;

  @IsNumber()
  @Min(1)
  public height!: number;
}

export class WatermarkDto {
  @IsOptional()
  @IsEnum([
    'northwest',
    'north',
    'northeast',
    'west',
    'center',
    'east',
    'southwest',
    'south',
    'southeast',
  ])
  public position?:
    | 'northwest'
    | 'north'
    | 'northeast'
    | 'west'
    | 'center'
    | 'east'
    | 'southwest'
    | 'south'
    | 'southeast';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  public opacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  public scale?: number;

  @IsOptional()
  @IsEnum(['single', 'tile'])
  public mode?: 'single' | 'tile';

  @IsOptional()
  @IsNumber()
  @Min(0)
  public spacing?: number;
}

export class TransformDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ResizeDto)
  public resize?: ResizeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExtractDto)
  public crop?: ExtractDto;

  @IsOptional()
  @IsBoolean()
  public autoOrient?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(-360)
  @Max(360)
  public rotate?: number;

  @IsOptional()
  @IsBoolean()
  public flip?: boolean;

  @IsOptional()
  @IsBoolean()
  public flop?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-fA-F]{3,8})$|^rgba?\([^)]+\)$|^hsla?\([^)]+\)$|^[a-zA-Z]+$/, {
    message: 'flatten must be a valid color string (hex, rgb, rgba, hsl, hsla, or CSS color name)',
  })
  public flatten?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WatermarkDto)
  public watermark?: WatermarkDto;
}

export class OutputDto {
  @IsOptional()
  @IsEnum(ImageFormat)
  public format?: ImageFormat;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  public quality?: number;

  @IsOptional()
  @IsBoolean()
  public lossless?: boolean;

  @IsOptional()
  @IsBoolean()
  public stripMetadata?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9)
  public effort?: number;

  @IsOptional()
  @IsBoolean()
  public progressive?: boolean;

  @IsOptional()
  @IsBoolean()
  public mozjpeg?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9)
  public compressionLevel?: number;

  @IsOptional()
  @IsIn(CHROMA_SUBSAMPLINGS)
  public chromaSubsampling?: ChromaSubsampling;

  @IsOptional()
  @IsBoolean()
  public palette?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(256)
  public colors?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  public dither?: number;

  @IsOptional()
  @IsBoolean()
  public adaptiveFiltering?: boolean;
}

export class ProcessImageDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  public priority?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TransformDto)
  public transform?: TransformDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OutputDto)
  public output?: OutputDto;
}
