import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validateSync } from 'class-validator';
import { formatValidationErrors } from '../common/utils/validation-errors.js';

/**
 * Builds a validated configuration object, or refuses to start.
 *
 * Every configuration namespace is validated the same way, so the rule lives here rather
 * than being re-implemented in each `registerAs` factory: a bad value must stop the process
 * at boot, where it is obvious, instead of surfacing as an undefined deep inside a request.
 *
 * @param cls - Configuration class carrying the `class-validator` decorators.
 * @param plain - Raw values read from the environment.
 * @param label - Namespace name, used in the error message.
 * @returns The validated instance.
 * @throws Error when any decorated constraint fails.
 */
export function validateConfig<T extends object>(
  cls: ClassConstructor<T>,
  plain: Record<string, unknown>,
  label: string,
): T {
  const config = plainToInstance(cls, plain);
  const errors = validateSync(config, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`${label} config validation error: ${formatValidationErrors(errors)}`);
  }

  return config;
}
