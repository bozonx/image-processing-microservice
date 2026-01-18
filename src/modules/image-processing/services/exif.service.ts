import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import exifr from 'exifr';
import { Readable } from 'node:stream';
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
   * Extracts EXIF metadata from an image stream.
   * Note: This method buffers the entire stream into memory because exifr requires a buffer.
   *
   * @param stream - The image data stream.
   * @param mimeType - The MIME type of the image.
   * @returns A record of EXIF data or null if extraction fails or no data is found.
   */
  public async extract(
    stream: Readable,
    mimeType: string,
  ): Promise<Record<string, any> | null> {
    const startTime = Date.now();

    try {
      const chunks: Buffer[] = [];
      let totalLength = 0;

      for await (const chunk of stream) {
        totalLength += chunk.length;
        if (totalLength > this.maxBytes) {
          throw new Error(`Image size exceeds maximum ${this.maxBytes} bytes`);
        }
        chunks.push(Buffer.from(chunk));
      }

      const buffer = Buffer.concat(chunks);

      // Check MIME type
      if (!mimeType.startsWith('image/')) {
        throw new Error(`Invalid MIME type: ${mimeType}`);
      }

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

      return exifData ?? null;
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
