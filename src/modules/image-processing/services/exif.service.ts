import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import exifr from 'exifr';
import type { ImageConfig } from '../../../config/image.config.js';

/**
 * Service for extracting EXIF metadata from images using the exifr library.
 */
@Injectable()
export class ExifService {
  private readonly logger = new Logger(ExifService.name);
  private readonly maxBytes: number;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.get<ImageConfig>('image')!;
    this.maxBytes = config.maxBytes;
  }

  /**
   * Extracts EXIF metadata from an image buffer.
   * 
   * @param buffer - The image data as a Buffer.
   * @param mimeType - The MIME type of the image.
   * @returns A record of EXIF data or null if extraction fails or no data is found.
   * @throws Error if the image size exceeds the limit.
   */
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
      // parse() returns data or undefined if nothing found
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
