import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum ImageFormat {
  WEBP = 'webp',
  AVIF = 'avif',
  JPEG = 'jpeg',
  PNG = 'png',
  GIF = 'gif',
  TIFF = 'tiff',
}

export class ResizeDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  maxDimension?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  height?: number;

  @IsOptional()
  @IsEnum(['cover', 'contain', 'fill', 'inside', 'outside'])
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';

  @IsOptional()
  @IsBoolean()
  withoutEnlargement?: boolean;

  @IsOptional()
  @IsString()
  position?: string;
}

export class TransformDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ResizeDto)
  resize?: ResizeDto;

  @IsOptional()
  @IsBoolean()
  autoOrient?: boolean;
}

export class OutputDto {
  @IsOptional()
  @IsEnum(ImageFormat)
  format?: ImageFormat;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  quality?: number;

  @IsOptional()
  @IsBoolean()
  lossless?: boolean;

  @IsOptional()
  @IsBoolean()
  stripMetadata?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9)
  effort?: number;
}

export class ProcessImageDto {
  @IsString()
  image!: string; // base64

  @IsString()
  mimeType!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  priority?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => TransformDto)
  transform?: TransformDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => OutputDto)
  output?: OutputDto;
}
