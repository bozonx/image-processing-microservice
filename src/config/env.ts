/**
 * Loads `.env` into `process.env` before anything else reads it.
 *
 * `ConfigModule` also reads the file, but it does so while the Nest container is being
 * built — too late for module-level constants such as the ones in `service-info.ts`.
 * Importing this module first is what makes `SERVICE_NAME` and `SERVICE_VERSION` work in
 * local development.
 *
 * Node's loader never overwrites a variable that is already set, so a value coming from the
 * orchestrator still wins over the file. In containers there is no `.env` at all.
 */
import { existsSync } from 'node:fs';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
