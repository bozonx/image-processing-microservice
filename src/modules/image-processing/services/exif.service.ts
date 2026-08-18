import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import exifr from 'exifr';

/**
 * Service for extracting EXIF metadata from images using the exifr library.
 */
@Injectable()
export class ExifService {
  private readonly logger = new Logger(ExifService.name);

  /**
   * Extracts EXIF metadata from image data.
   *
   * @param input - The image buffer.
   * @param mimeType - The MIME type of the image.
   * @returns A record of EXIF data or null if extraction fails or no data is found.
   */
  public async extract(input: Buffer, mimeType: string): Promise<Record<string, unknown> | null> {
    const startTime = Date.now();

    try {
      const buffer = input;

      // Check MIME type first
      if (!mimeType.startsWith('image/')) {
        throw new BadRequestException(`Invalid MIME type: ${mimeType}`);
      }

      const metadata = await sharp(buffer)
        .metadata()
        .catch(err => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Sharp metadata extraction failed: ${message}`, {
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
        ...(exifData ?? {}),
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

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(`Failed to parse EXIF: ${errorMessage}`);
    }
  }
}
