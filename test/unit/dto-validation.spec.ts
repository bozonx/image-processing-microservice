import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ProcessImageDto,
  TransformDto,
  ResizeDto,
  CropDto,
  WatermarkDto,
  OutputDto,
  ImageFormat,
} from '../../src/modules/image-processing/dto/process-image.dto.js';
import { ExtractExifDto } from '../../src/modules/image-processing/dto/exif.dto.js';

describe('DTO Validation (unit)', () => {
  const validateDto = async (cls: any, plain: any) => {
    const instance = plainToInstance(cls, plain);
    return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  };

  describe('ProcessImageDto', () => {
    it('accepts valid priority values (0, 1, 2)', async () => {
      for (const priority of [0, 1, 2]) {
        const errors = await validateDto(ProcessImageDto, { priority });
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects priority out of range (< 0 or > 2)', async () => {
      expect(await validateDto(ProcessImageDto, { priority: -1 })).not.toHaveLength(0);
      expect(await validateDto(ProcessImageDto, { priority: 3 })).not.toHaveLength(0);
    });
  });

  describe('ExtractExifDto', () => {
    it('accepts valid priority values (0, 1, 2)', async () => {
      for (const priority of [0, 1, 2]) {
        const errors = await validateDto(ExtractExifDto, { priority });
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects invalid priority', async () => {
      expect(await validateDto(ExtractExifDto, { priority: 5 })).not.toHaveLength(0);
    });
  });

  describe('TransformDto', () => {
    it('accepts valid rotate angles [-360..360]', async () => {
      for (const rotate of [-360, -90, 0, 90, 180, 270, 360]) {
        const errors = await validateDto(TransformDto, { rotate });
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects rotate out of bounds', async () => {
      expect(await validateDto(TransformDto, { rotate: -361 })).not.toHaveLength(0);
      expect(await validateDto(TransformDto, { rotate: 361 })).not.toHaveLength(0);
    });

    it('accepts valid flatten color strings (hex, rgb, rgba, hsl, hsla, names)', async () => {
      const validColors = [
        '#fff',
        '#FFF',
        '#123456',
        '#12345678',
        'rgb(255, 0, 0)',
        'rgba(255, 0, 0, 0.5)',
        'hsl(120, 100%, 50%)',
        'hsla(120, 100%, 50%, 0.3)',
        'red',
        'white',
        'transparent',
      ];

      for (const color of validColors) {
        const errors = await validateDto(TransformDto, { flatten: color });
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects invalid flatten color strings', async () => {
      const invalidColors = ['#12', '#123456789', 'not a color with spaces', '12345', 'rgb('];

      for (const color of invalidColors) {
        const errors = await validateDto(TransformDto, { flatten: color });
        expect(errors).not.toHaveLength(0);
      }
    });

    it('accepts boolean flags (autoOrient, flipHorizontal, flipVertical)', async () => {
      const errors = await validateDto(TransformDto, {
        autoOrient: true,
        flipHorizontal: false,
        flipVertical: true,
      });
      expect(errors).toHaveLength(0);
    });
  });

  describe('ResizeDto', () => {
    it('accepts valid dimensions and fit modes', async () => {
      const fits = ['cover', 'contain', 'fill', 'inside', 'outside'] as const;
      for (const fit of fits) {
        const errors = await validateDto(ResizeDto, {
          width: 500,
          height: 300,
          fit,
          withoutEnlargement: true,
        });
        expect(errors).toHaveLength(0);
      }
    });

    it('accepts valid maxDimension', async () => {
      const errors = await validateDto(ResizeDto, { maxDimension: 1024 });
      expect(errors).toHaveLength(0);
    });

    it('accepts all supported resize positions (gravity + entropy/attention)', async () => {
      const positions = ['top', 'center', 'southeast', 'northwest', 'entropy', 'attention'];
      for (const position of positions) {
        const errors = await validateDto(ResizeDto, { width: 100, position });
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects invalid dimensions (< 1 or > max supported)', async () => {
      expect(await validateDto(ResizeDto, { width: 0 })).not.toHaveLength(0);
      expect(await validateDto(ResizeDto, { height: -1 })).not.toHaveLength(0);
      expect(await validateDto(ResizeDto, { maxDimension: 0 })).not.toHaveLength(0);
    });

    it('rejects invalid fit or position', async () => {
      expect(await validateDto(ResizeDto, { fit: 'stretch' })).not.toHaveLength(0);
      expect(await validateDto(ResizeDto, { position: 'somewhere' })).not.toHaveLength(0);
    });
  });

  describe('CropDto', () => {
    it('accepts valid crop parameters', async () => {
      const errors = await validateDto(CropDto, {
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects negative left or top', async () => {
      expect(
        await validateDto(CropDto, { left: -1, top: 0, width: 10, height: 10 }),
      ).not.toHaveLength(0);
      expect(
        await validateDto(CropDto, { left: 0, top: -1, width: 10, height: 10 }),
      ).not.toHaveLength(0);
    });

    it('rejects width or height < 1', async () => {
      expect(
        await validateDto(CropDto, { left: 0, top: 0, width: 0, height: 10 }),
      ).not.toHaveLength(0);
      expect(
        await validateDto(CropDto, { left: 0, top: 0, width: 10, height: 0 }),
      ).not.toHaveLength(0);
    });
  });

  describe('WatermarkDto', () => {
    it('accepts valid watermark config', async () => {
      const errors = await validateDto(WatermarkDto, {
        position: 'southeast',
        opacity: 0.5,
        scale: 20,
        mode: 'tile',
        spacing: 10,
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects opacity < 0 or > 1', async () => {
      expect(await validateDto(WatermarkDto, { opacity: -0.1 })).not.toHaveLength(0);
      expect(await validateDto(WatermarkDto, { opacity: 1.1 })).not.toHaveLength(0);
    });

    it('rejects scale < 1 or > 100', async () => {
      expect(await validateDto(WatermarkDto, { scale: 0 })).not.toHaveLength(0);
      expect(await validateDto(WatermarkDto, { scale: 101 })).not.toHaveLength(0);
    });

    it('rejects negative spacing', async () => {
      expect(await validateDto(WatermarkDto, { spacing: -1 })).not.toHaveLength(0);
    });

    it('rejects invalid mode or position', async () => {
      expect(await validateDto(WatermarkDto, { mode: 'invalid' })).not.toHaveLength(0);
      expect(await validateDto(WatermarkDto, { position: 'entropy' })).not.toHaveLength(0);
    });
  });

  describe('OutputDto', () => {
    it('accepts valid output format and options', async () => {
      const formats = [
        ImageFormat.WEBP,
        ImageFormat.AVIF,
        ImageFormat.JPEG,
        ImageFormat.PNG,
        ImageFormat.GIF,
        ImageFormat.TIFF,
        ImageFormat.RAW,
      ];

      for (const format of formats) {
        const errors = await validateDto(OutputDto, {
          format,
          quality: 85,
          lossless: false,
          stripMetadata: true,
          effort: 5,
        });
        expect(errors).toHaveLength(0);
      }
    });

    it('accepts valid chromaSubsampling values', async () => {
      for (const chromaSubsampling of ['4:2:0', '4:2:2', '4:4:4']) {
        const errors = await validateDto(OutputDto, { chromaSubsampling });
        expect(errors).toHaveLength(0);
      }
    });

    it('rejects invalid chromaSubsampling', async () => {
      expect(await validateDto(OutputDto, { chromaSubsampling: '4:1:1' })).not.toHaveLength(0);
    });

    it('rejects quality < 1 or > 100', async () => {
      expect(await validateDto(OutputDto, { quality: 0 })).not.toHaveLength(0);
      expect(await validateDto(OutputDto, { quality: 101 })).not.toHaveLength(0);
    });

    it('rejects effort < 0 or > 10', async () => {
      expect(await validateDto(OutputDto, { effort: -1 })).not.toHaveLength(0);
      expect(await validateDto(OutputDto, { effort: 11 })).not.toHaveLength(0);
    });

    it('rejects compressionLevel < 0 or > 9', async () => {
      expect(await validateDto(OutputDto, { compressionLevel: -1 })).not.toHaveLength(0);
      expect(await validateDto(OutputDto, { compressionLevel: 10 })).not.toHaveLength(0);
    });

    it('rejects colors < 2 or > 256', async () => {
      expect(await validateDto(OutputDto, { colors: 1 })).not.toHaveLength(0);
      expect(await validateDto(OutputDto, { colors: 257 })).not.toHaveLength(0);
    });

    it('rejects dither < 0 or > 1', async () => {
      expect(await validateDto(OutputDto, { dither: -0.1 })).not.toHaveLength(0);
      expect(await validateDto(OutputDto, { dither: 1.1 })).not.toHaveLength(0);
    });
  });
});
