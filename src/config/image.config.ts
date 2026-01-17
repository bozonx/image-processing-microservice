import { registerAs } from '@nestjs/config';

export default registerAs('image', () => ({
  maxBytes: parseInt(process.env.IMAGE_MAX_BYTES_MB || '25', 10) * 1024 * 1024,

  queue: {
    maxConcurrency: parseInt(process.env.HEAVY_TASKS_MAX_CONCURRENCY || '4', 10),
    timeout: parseInt(process.env.HEAVY_TASKS_QUEUE_TIMEOUT_MS || '30000', 10),
  },

  defaults: {
    format: process.env.IMAGE_DEFAULT_FORMAT || 'webp',
    maxDimension: parseInt(process.env.IMAGE_DEFAULT_MAX_DIMENSION || '3840', 10),
    quality: parseInt(process.env.IMAGE_DEFAULT_QUALITY || '80', 10),
    effort: parseInt(process.env.IMAGE_DEFAULT_EFFORT || '6', 10),
    lossless: process.env.IMAGE_DEFAULT_LOSSLESS === 'true',
    stripMetadata: process.env.IMAGE_DEFAULT_STRIP_METADATA === 'true',
    autoOrient: process.env.IMAGE_DEFAULT_AUTO_ORIENT !== 'false',
  },

  avif: {
    chromaSubsampling: process.env.IMAGE_AVIF_CHROMA_SUBSAMPLING || '4:2:0',
  },

  jpeg: {
    progressive: process.env.IMAGE_JPEG_PROGRESSIVE === 'true',
    mozjpeg: process.env.IMAGE_JPEG_MOZJPEG === 'true',
  },

  png: {
    compressionLevel: parseInt(process.env.IMAGE_PNG_COMPRESSION_LEVEL || '6', 10),
  },
}));
