import { describe, expect, it } from '@jest/globals';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import sharp from 'sharp';
import { Readable } from 'node:stream';
import { ImageSanitizerService } from '../../src/modules/image-processing/services/image-sanitizer.service.js';

const chunk = (type: string, payload: Buffer): Buffer => {
  const header = Buffer.alloc(8);
  header.write(type, 0, 'ascii');
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, ...(payload.length % 2 ? [Buffer.alloc(1)] : [])]);
};

describe('ImageSanitizerService', () => {
  const service = new ImageSanitizerService();

  it('removes JPEG application metadata without changing scan data', async () => {
    const source = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#336699' },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: 'private' } })
      .toBuffer();
    const scanOffset = source.indexOf(Buffer.from([0xff, 0xda]));

    const result = await service.sanitizeStream(Readable.from(source), 'image/jpeg');

    expect(result.buffer.length).toBeLessThan(source.length);
    expect(result.buffer.subarray(result.buffer.indexOf(Buffer.from([0xff, 0xda])))).toEqual(
      source.subarray(scanOffset),
    );
    expect((await sharp(result.buffer).metadata()).exif).toBeUndefined();
  });

  it('removes WebP metadata chunks while preserving animation chunks and payloads', () => {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x2e;
    const animation = chunk('ANIM', Buffer.from('animation'));
    const frame = chunk('ANMF', Buffer.from('frame'));
    const chunks = [
      chunk('VP8X', vp8x),
      chunk('EXIF', Buffer.from('private')),
      chunk('XMP ', Buffer.from('private')),
      chunk('ICCP', Buffer.from('private')),
      animation,
      frame,
    ];
    const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
    const source = Buffer.alloc(8);
    source.write('RIFF', 0, 'ascii');
    source.writeUInt32LE(body.length, 4);
    const container = Buffer.concat([source, body]);

    const sanitizeWebp = Reflect.get(service, 'sanitizeWebp') as (input: Buffer) => Buffer;
    const result = sanitizeWebp.call(service, container);

    expect(result.includes(Buffer.from('EXIF'))).toBe(false);
    expect(result.includes(Buffer.from('XMP '))).toBe(false);
    expect(result.includes(Buffer.from('ICCP'))).toBe(false);
    expect(result.includes(animation)).toBe(true);
    expect(result.includes(frame)).toBe(true);
    expect((result[result.indexOf(Buffer.from('VP8X')) + 8] ?? 0) & 0x2c).toBe(0);
  });

  it('rejects formats that cannot be sanitized without re-encoding', async () => {
    await expect(
      service.sanitizeStream(Readable.from(Buffer.from('image')), 'image/avif'),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });
});
