import { BadRequestException, Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
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
  public async extract(stream: Readable, mimeType: string): Promise<Record<string, any> | null> {
    const startTime = Date.now();

    try {
      const chunks: Buffer[] = [];
      let totalLength = 0;

      for await (const chunk of stream) {
        totalLength += chunk.length;
        if (totalLength > this.maxBytes) {
          throw new PayloadTooLargeException(`Image size exceeds maximum ${this.maxBytes} bytes`);
        }
        chunks.push(Buffer.from(chunk));
      }

      // Check MIME type first
      if (!mimeType.startsWith('image/')) {
        throw new BadRequestException(`Invalid MIME type: ${mimeType}`);
      }

      const buffer = Buffer.concat(chunks);
      const metadata = await sharp(buffer).metadata().catch(err => {
        this.logger.warn(`Sharp metadata extraction failed: ${err.message}`, {
          bufferSize: buffer.length,
          mimeType,
        });
        throw err;
      });

      // parse() returns data or undefined if nothing found
      const exifData = await exifr.parse(buffer, {
        translateKeys: true,
        translateValues: false,
        sanitize: true,
      });

      const duration = Date.now() - startTime;

      this.logger.debug({
        msg: 'EXIF and metadata extracted',
        duration,
        hasExif: !!exifData,
        sizeBytes: buffer.length,
        width: metadata.width,
        height: metadata.height,
      });

      return {
        ...(exifData || {}),
        width: metadata.width,
        height: metadata.height,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger.warn({
        msg: 'EXIF extraction failed',
        duration,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (error instanceof PayloadTooLargeException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(`Failed to parse EXIF: ${errorMessage}`);
    }
  }
}
