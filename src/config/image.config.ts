import { registerAs } from '@nestjs/config';

export default registerAs('image', () => ({
  maxBytes: parseInt(process.env.FILE_MAX_BYTES_MB || '25', 10) * 1024 * 1024,

  queue: {
    maxConcurrency: parseInt(process.env.HEAVY_TASKS_MAX_CONCURRENCY || '4', 10),
    timeout: parseInt(process.env.HEAVY_TASKS_QUEUE_TIMEOUT_MS || '30000', 10),
  },

  defaults: {
    format: 'webp',
    maxDimension: 3840,
    quality: 80,
    effort: 6,
    lossless: false,
    stripMetadata: false,
    autoOrient: true,
  },

  avif: {
    chromaSubsampling: '4:2:0',
  },

  jpeg: {
    progressive: false,
    mozjpeg: false,
    chromaSubsampling: '4:2:0',
  },

  png: {
    compressionLevel: 6,
  },
}));
