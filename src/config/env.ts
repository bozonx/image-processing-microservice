import { existsSync } from 'node:fs';

try {
  if (typeof process.loadEnvFile === 'function' && existsSync('.env')) {
    process.loadEnvFile('.env');
  }
} catch {
  // Ignore error if .env file cannot be loaded in environments where it is absent
}
