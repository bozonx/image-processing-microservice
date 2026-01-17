import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import exifr from 'exifr';

@Injectable()
export class ExifService {
  private readonly logger = new Logger(ExifService.name);
  private readonly maxBytes: number;

  constructor(private readonly configService: ConfigService) {
    this.maxBytes = this.configService.get<number>('image.maxBytes', 25 * 1024 * 1024);
  }

  async extract(buffer: Buffer, mimeType: string): Promise<Record<string, any> | null> {
    // Check size
    if (buffer.length > this.maxBytes) {
      throw new Error(`Image size ${buffer.length} bytes exceeds maximum ${this.maxBytes} bytes`);
    }

    // Check MIME type
    if (!mimeType.startsWith('image/')) {
      throw new Error(`Invalid MIME type: ${mimeType}`);
    }

    const startTime = Date.now();

    try {
      const exifData = await exifr.parse(buffer, {
        translateKeys: true,
        translateValues: false,
        sanitize: true,
      });

      const duration = Date.now() - startTime;

      this.logger.debug({
        msg: 'EXIF extracted',
        duration,
        hasExif: !!exifData,
        sizeBytes: buffer.length,
      });

      return exifData || null;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.debug({
        msg: 'EXIF extraction failed',
        duration,
        error: errorMessage,
      });

      return null;
    }
  }
}
