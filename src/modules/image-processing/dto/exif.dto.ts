import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class ExtractExifDto {
  @IsString()
  public image!: string; // base64

  @IsString()
  public mimeType!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  public priority?: number;
}
