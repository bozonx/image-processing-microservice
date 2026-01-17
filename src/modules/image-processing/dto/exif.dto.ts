import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class ExtractExifDto {
  @IsString()
  image!: string; // base64

  @IsString()
  mimeType!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  priority?: number;
}
