import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
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
  @IsString()
  public position?: string;
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
  public backgroundColor?: string;

  @IsOptional()
  @IsBoolean()
  public removeAlpha?: boolean;
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
  @IsString()
  public chromaSubsampling?: string;

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
