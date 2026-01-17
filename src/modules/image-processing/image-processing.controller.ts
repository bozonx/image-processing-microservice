import { Controller, Get } from '@nestjs/common';

@Controller()
export class ImageProcessingController {
  @Get('placeholder')
  getPlaceholder(): { message: string } {
    return { message: 'Image processing endpoints will be implemented in Step 2' };
  }
}
