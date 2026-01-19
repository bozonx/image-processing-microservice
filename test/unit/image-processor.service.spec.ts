import { describe, it, expect, beforeEach } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { Readable } from 'node:stream';
import { ImageProcessorService } from '../../src/modules/image-processing/services/image-processor.service.js';
import imageConfig from '../../src/config/image.config.js';
import sharp from 'sharp';

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [imageConfig],
        }),
      ],
      providers: [ImageProcessorService],
    }).compile();

    service = module.get<ImageProcessorService>(ImageProcessorService);
  });

  const bufferToStream = (buffer: Buffer): Readable => {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return stream;
  };

  const processWrapper = async (dto: any) => {
    const buffer = Buffer.from(dto.image, 'base64');
    const stream = bufferToStream(buffer);

    let watermark;
    if (dto.watermark) {
      watermark = {
        buffer: Buffer.from(dto.watermark.image, 'base64'),
        mimetype: dto.watermark.mimeType ?? 'image/png',
      };
    }

    const result = await service.processStream(
      stream,
      dto.mimeType,
      dto.transform,
      dto.output,
      watermark,
    );

    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk));
    }
    const resultBuffer = Buffer.concat(chunks);
    const metadata = await sharp(resultBuffer).metadata();

    return {
      buffer: resultBuffer,
      size: resultBuffer.length,
      mimeType: result.mimeType,
      dimensions: { width: metadata.width, height: metadata.height },
    };
  };

  const createWatermarkBuffer = async (width = 50, height = 50) => {
    return sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process image with default settings', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await processWrapper({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
    });

    expect(result).toHaveProperty('buffer');
    expect(result).toHaveProperty('size');
    expect(result).toHaveProperty('mimeType');
    expect(result).toHaveProperty('dimensions');
    expect(result.mimeType).toBe('image/webp');
  });

  it('should resize image with maxDimension', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 2000,
        height: 2000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await processWrapper({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      transform: {
        resize: {
          maxDimension: 1000,
        },
      },
    });

    expect(result.dimensions.width).toBeLessThanOrEqual(1000);
    expect(result.dimensions.height).toBeLessThanOrEqual(1000);
  });

  it('should resize image with exact dimensions', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await processWrapper({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      transform: {
        resize: {
          width: 500,
          height: 500,
          fit: 'cover',
        },
      },
    });

    expect(result.dimensions.width).toBe(500);
    expect(result.dimensions.height).toBe(500);
  });

  it('should convert to different formats', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const formats = ['webp', 'avif', 'jpeg', 'png', 'gif', 'tiff'];

    for (const format of formats) {
      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        output: {
          format: format as any,
        },
      });

      expect(result.mimeType).toBe(`image/${format === 'jpeg' ? 'jpeg' : format}`);
    }
  });

  it('should strip metadata when requested', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await processWrapper({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      output: {
        stripMetadata: true,
      },
    });

    expect(result).toBeDefined();

    const outputMetadata = await sharp(result.buffer).metadata();
    expect(outputMetadata.exif).toBeUndefined();
  });

  it('should throw error for unsupported format', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    await expect(
      processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        output: {
          format: 'invalid' as any,
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw error for conflicting resize parameters', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    await expect(
      processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          resize: {
            maxDimension: 1000,
            width: 500,
          },
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should rotate image with custom angle', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 50,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await processWrapper({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      transform: {
        rotate: 90,
      },
    });

    expect(result.dimensions.width).toBe(50);
    expect(result.dimensions.height).toBe(100);
  });

  it('should flip and flop image', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await processWrapper({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      transform: {
        flip: true,
        flop: true,
      },
    });

    expect(result).toBeDefined();
    expect(result.dimensions.width).toBe(100);
    expect(result.dimensions.height).toBe(100);
  });

  it('should crop image', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await processWrapper({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/jpeg',
      transform: {
        crop: {
          left: 100,
          top: 100,
          width: 500,
          height: 300,
        },
      },
    });

    expect(result.dimensions.width).toBe(500);
    expect(result.dimensions.height).toBe(300);
  });

  it('should remove alpha channel when requested via flatten', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();

    const result = await processWrapper({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/png',
      transform: {
        flatten: '#ff0000',
      },
      output: {
        format: 'png',
      },
    });

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.hasAlpha).toBe(false);
  });

  it('should output raw pixel data', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const stream = bufferToStream(inputBuffer);
    const result = await service.processStream(stream, 'image/jpeg', {}, { format: 'raw' as any });

    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk));
    }
    const resultBuffer = Buffer.concat(chunks);

    expect(result.mimeType).toBe('application/octet-stream');
    expect(result.extension).toBe('raw');
    // 10*10 pixels * 3 channels = 300 bytes
    expect(resultBuffer).toHaveLength(300);
  });

  it('should process SVG input', async () => {
    const svg = '<svg width="100" height="100"><rect width="100" height="100" fill="red"/></svg>';
    const inputBuffer = Buffer.from(svg);

    const result = await processWrapper({
      image: inputBuffer.toString('base64'),
      mimeType: 'image/svg+xml',
      output: {
        format: 'png',
      },
    });

    expect(result.mimeType).toBe('image/png');
    expect(result.dimensions.width).toBe(100);
    expect(result.dimensions.height).toBe(100);
  });

  describe('Watermarking', () => {
    it('should apply single watermark', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();

      const watermarkBuffer = await createWatermarkBuffer(100, 100);

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/png',
        watermark: {
          image: watermarkBuffer.toString('base64'),
        },
        transform: {
          watermark: {
            mode: 'single',
            // 20% of 500 = 100px
            scale: 20,
            opacity: 0.5,
            position: 'center',
          },
        },
      });

      expect(result.dimensions.width).toBe(500);
      expect(result.dimensions.height).toBe(500);
      // Visual verification would be needed to confirm watermark presence,
      // but we can check that processing completed successfully
    });

    it('should apply tiled watermark', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();

      const watermarkBuffer = await createWatermarkBuffer(50, 50);

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/png',
        watermark: {
          image: watermarkBuffer.toString('base64'),
        },
        transform: {
          watermark: {
            mode: 'tile',
            scale: 10,
            spacing: 10,
          },
        },
      });

      expect(result.dimensions.width).toBe(500);
      expect(result.dimensions.height).toBe(500);
    });

    it('should scale watermark correctly', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 1000,
          height: 1000,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();

      const watermarkBuffer = await createWatermarkBuffer(200, 200);

      // We mainly test that it doesn't crash and returns valid result
      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/png',
        watermark: {
          image: watermarkBuffer.toString('base64'),
        },
        transform: {
          watermark: {
            mode: 'single',
            // Should scale to 500px
            scale: 50,
          },
        },
      });

      expect(result.dimensions.width).toBe(1000);
    });

    // NEW EDGE CASE TESTS
    it('should handle watermark with very small dimensions', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();

      const watermarkBuffer = await createWatermarkBuffer(1, 1);

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/png',
        watermark: {
          image: watermarkBuffer.toString('base64'),
        },
        transform: {
          watermark: {
            mode: 'single',
            scale: 1,
            opacity: 0.5,
          },
        },
      });

      expect(result.dimensions.width).toBe(500);
      expect(result.dimensions.height).toBe(500);
    });

    it('should handle watermark larger than image', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();

      const watermarkBuffer = await createWatermarkBuffer(500, 500);

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/png',
        watermark: {
          image: watermarkBuffer.toString('base64'),
        },
        transform: {
          watermark: {
            mode: 'single',
            scale: 100,
          },
        },
      });

      expect(result.dimensions.width).toBe(100);
      expect(result.dimensions.height).toBe(100);
    });

    it('should handle tiled watermark with zero spacing', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();

      const watermarkBuffer = await createWatermarkBuffer(50, 50);

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/png',
        watermark: {
          image: watermarkBuffer.toString('base64'),
        },
        transform: {
          watermark: {
            mode: 'tile',
            scale: 25,
            spacing: 0,
          },
        },
      });

      expect(result.dimensions.width).toBe(200);
      expect(result.dimensions.height).toBe(200);
    });

    it('should handle watermark with opacity 0', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toBuffer();

      const watermarkBuffer = await createWatermarkBuffer(100, 100);

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/png',
        watermark: {
          image: watermarkBuffer.toString('base64'),
        },
        transform: {
          watermark: {
            mode: 'single',
            scale: 20,
            opacity: 0,
          },
        },
      });

      expect(result.dimensions.width).toBe(500);
      expect(result.dimensions.height).toBe(500);
    });
  });

  describe('Edge Cases - Invalid Input', () => {
    it('should throw error for invalid MIME type', async () => {
      const inputBuffer = Buffer.from('not an image');
      const stream = bufferToStream(inputBuffer);

      await expect(service.processStream(stream, 'text/plain', {}, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle empty stream gracefully', async () => {
      const emptyStream = new Readable();
      emptyStream.push(null);

      // The service returns a stream, the error happens when reading it
      // we use processWrapper logic (simplified) to consume it
      const result = await service.processStream(emptyStream, 'image/jpeg', {}, {});

      const consumeStream = async () => {
        for await (const _chunk of result.stream) {
          // just consume
        }
      };

      await expect(consumeStream()).rejects.toThrow();
    });

    it('should handle corrupt image data', async () => {
      await expect(
        processWrapper({
          image: Buffer.from('this is not a valid image').toString('base64'),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toThrow();
    });
  });

  describe('Edge Cases - Extreme Dimensions', () => {
    it('should handle very small image (1x1)', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
      });

      expect(result.dimensions.width).toBe(1);
      expect(result.dimensions.height).toBe(1);
    });

    it('should handle extreme aspect ratio', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 1000,
          height: 10,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          resize: {
            maxDimension: 500,
          },
        },
      });

      expect(result.dimensions.width).toBeLessThanOrEqual(500);
    });
  });

  describe('Edge Cases - Crop Boundaries', () => {
    it('should handle crop at image boundaries', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          crop: {
            left: 0,
            top: 0,
            width: 100,
            height: 100,
          },
        },
      });

      expect(result.dimensions.width).toBe(100);
      expect(result.dimensions.height).toBe(100);
    });

    it('should handle crop at edge (right-bottom corner)', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          crop: {
            left: 50,
            top: 50,
            width: 50,
            height: 50,
          },
        },
      });

      expect(result.dimensions.width).toBe(50);
      expect(result.dimensions.height).toBe(50);
    });
  });

  describe('Edge Cases - Rotation', () => {
    it('should handle rotation with negative angle', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 100,
          height: 50,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          rotate: -90,
        },
      });

      expect(result.dimensions.width).toBe(50);
      expect(result.dimensions.height).toBe(100);
    });

    it('should handle rotation with 0 degrees', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 100,
          height: 50,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          rotate: 0,
        },
      });

      expect(result.dimensions.width).toBe(100);
      expect(result.dimensions.height).toBe(50);
    });

    it('should handle rotation with 360 degrees', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 100,
          height: 50,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          rotate: 360,
        },
      });

      expect(result.dimensions.width).toBe(100);
      expect(result.dimensions.height).toBe(50);
    });
  });

  describe('Edge Cases - Resize with withoutEnlargement', () => {
    it('should not enlarge small image when withoutEnlargement is true', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          resize: {
            width: 1000,
            height: 1000,
            withoutEnlargement: true,
          },
        },
      });

      expect(result.dimensions.width).toBe(50);
      expect(result.dimensions.height).toBe(50);
    });

    it('should enlarge small image when withoutEnlargement is false', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          resize: {
            width: 100,
            height: 100,
            withoutEnlargement: false,
          },
        },
      });

      expect(result.dimensions.width).toBe(100);
      expect(result.dimensions.height).toBe(100);
    });
  });

  describe('Edge Cases - Combined Transformations', () => {
    it('should handle crop followed by resize', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 1000,
          height: 1000,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          crop: {
            left: 100,
            top: 100,
            width: 500,
            height: 500,
          },
          resize: {
            width: 250,
            height: 250,
          },
        },
      });

      expect(result.dimensions.width).toBe(250);
      expect(result.dimensions.height).toBe(250);
    });

    it('should handle rotate, flip, and flop together', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 100,
          height: 50,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processWrapper({
        image: inputBuffer.toString('base64'),
        mimeType: 'image/jpeg',
        transform: {
          rotate: 90,
          flip: true,
          flop: true,
        },
      });

      expect(result.dimensions.width).toBe(50);
      expect(result.dimensions.height).toBe(100);
    });
  });
});
