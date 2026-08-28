import { BadRequestException, Injectable, UnsupportedMediaTypeException } from '@nestjs/common';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import type { ProcessResult } from './image-processor.service.js';

const JPEG_SOI = 0xffd8;
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;
const JPEG_COM = 0xfe;
const JPEG_APP14 = 0xee;
const WEBP_METADATA_FLAGS = 0x2c;

/** Removes privacy-bearing container metadata without re-encoding image payloads. */
@Injectable()
export class ImageSanitizerService {
  public async sanitizeStream(input: Readable, mimeType: string): Promise<ProcessResult> {
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/webp') {
      throw new UnsupportedMediaTypeException(
        'Lossless metadata sanitization supports only image/jpeg and image/webp',
      );
    }

    const inputBuffer = await this.streamToBuffer(input);
    const metadata = await sharp(inputBuffer, { animated: mimeType === 'image/webp' }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new BadRequestException('Image dimensions could not be determined');
    }
    if (metadata.orientation !== undefined && metadata.orientation !== 1) {
      throw new BadRequestException(
        'Lossless metadata sanitization cannot remove a non-default EXIF orientation',
      );
    }

    const buffer =
      mimeType === 'image/jpeg' ? this.sanitizeJpeg(inputBuffer) : this.sanitizeWebp(inputBuffer);

    return {
      buffer,
      mimeType,
      extension: mimeType === 'image/jpeg' ? 'jpg' : 'webp',
      width: metadata.width,
      height: metadata.height,
      size: buffer.length,
    };
  }

  private sanitizeJpeg(input: Buffer): Buffer {
    if (input.length < 4 || input.readUInt16BE(0) !== JPEG_SOI) {
      throw new BadRequestException('Invalid JPEG container');
    }

    const parts: Buffer[] = [input.subarray(0, 2)];
    let offset = 2;
    container: while (offset < input.length) {
      const markerStart = offset;
      if (input[offset] !== 0xff) throw new BadRequestException('Invalid JPEG marker');
      while (input[offset] === 0xff) offset += 1;
      const marker = input[offset];
      if (marker === undefined) throw new BadRequestException('Truncated JPEG marker');
      offset += 1;

      if (marker === JPEG_SOS) {
        if (offset + 2 > input.length) throw new BadRequestException('Truncated JPEG scan');
        const length = input.readUInt16BE(offset);
        if (length < 2 || offset + length > input.length) {
          throw new BadRequestException('Invalid JPEG scan header');
        }
        const scanStart = offset + length;
        parts.push(input.subarray(markerStart, scanStart));
        offset = scanStart;
        while (offset < input.length) {
          if (input[offset] !== 0xff) {
            offset += 1;
            continue;
          }
          const nextMarkerStart = offset;
          while (input[offset] === 0xff) offset += 1;
          const nextMarker = input[offset];
          if (nextMarker === undefined) throw new BadRequestException('Truncated JPEG scan data');
          offset += 1;
          if (nextMarker === 0x00 || (nextMarker >= 0xd0 && nextMarker <= 0xd7)) continue;
          parts.push(input.subarray(scanStart, nextMarkerStart));
          offset = nextMarkerStart;
          continue container;
        }
        throw new BadRequestException('JPEG end marker is missing');
      }
      if (marker === JPEG_EOI) {
        parts.push(input.subarray(markerStart, offset));
        return Buffer.concat(parts);
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        parts.push(input.subarray(markerStart, offset));
        continue;
      }
      if (offset + 2 > input.length) throw new BadRequestException('Truncated JPEG segment');
      const length = input.readUInt16BE(offset);
      if (length < 2 || offset + length > input.length) {
        throw new BadRequestException('Invalid JPEG segment length');
      }
      const segmentEnd = offset + length;
      const isApplicationMetadata = marker >= 0xe0 && marker <= 0xef && marker !== JPEG_APP14;
      if (!isApplicationMetadata && marker !== JPEG_COM) {
        parts.push(input.subarray(markerStart, segmentEnd));
      }
      offset = segmentEnd;
    }

    throw new BadRequestException('JPEG scan data is missing');
  }

  private sanitizeWebp(input: Buffer): Buffer {
    if (
      input.length < 12 ||
      input.toString('ascii', 0, 4) !== 'RIFF' ||
      input.toString('ascii', 8, 12) !== 'WEBP'
    ) {
      throw new BadRequestException('Invalid WebP container');
    }
    if (input.readUInt32LE(4) + 8 !== input.length) {
      throw new BadRequestException('Invalid WebP container length');
    }

    const chunks: Buffer[] = [];
    let offset = 12;
    while (offset < input.length) {
      if (offset + 8 > input.length) throw new BadRequestException('Truncated WebP chunk');
      const type = input.toString('ascii', offset, offset + 4);
      const size = input.readUInt32LE(offset + 4);
      const chunkEnd = offset + 8 + size + (size % 2);
      if (chunkEnd > input.length) throw new BadRequestException('Invalid WebP chunk length');

      if (type !== 'EXIF' && type !== 'XMP ' && type !== 'ICCP') {
        const chunk = Buffer.from(input.subarray(offset, chunkEnd));
        if (type === 'VP8X' && size >= 1) chunk[8] = (chunk[8] ?? 0) & ~WEBP_METADATA_FLAGS;
        chunks.push(chunk);
      }
      offset = chunkEnd;
    }

    const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
    const header = Buffer.alloc(8);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(body.length, 4);
    return Buffer.concat([header, body]);
  }

  private async streamToBuffer(input: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of input as AsyncIterable<unknown>) {
      if (!(chunk instanceof Uint8Array)) {
        throw new BadRequestException('Image body must contain binary data');
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
