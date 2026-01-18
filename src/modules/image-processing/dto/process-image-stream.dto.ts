import { IsOptional, IsNumber, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TransformDto, OutputDto } from './process-image.dto.js';

/**
 * DTO for streaming image processing requests.
 * Parameters are passed as a JSON string in the 'params' form field.
 */
export class ProcessImageStreamDto {
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
