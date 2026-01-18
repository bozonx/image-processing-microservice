import { IsOptional, IsNumber, Min, Max } from 'class-validator';

export class ExtractExifDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  public priority?: number;
}
