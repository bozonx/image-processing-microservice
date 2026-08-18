import type { ValidationError } from 'class-validator';

/**
 * Joins a parent path and a property name into a dotted path.
 *
 * @param path - Parent path, empty at the root.
 * @param property - Property name to append.
 * @returns The dotted path.
 */
const joinPath = (path: string, property: string): string =>
  path === '' ? property : `${path}.${property}`;

/**
 * Flattens a validation error tree into `path: message` lines.
 *
 * @param errors - Errors reported by `class-validator`.
 * @param path - Path accumulated from the parent levels.
 * @returns One message per failed constraint, including nested ones.
 */
const collectMessages = (errors: ValidationError[], path: string): string[] => {
  const messages: string[] = [];

  for (const error of errors) {
    const currentPath = joinPath(path, error.property);

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        messages.push(`${currentPath}: ${message}`);
      }
    }

    if (error.children && error.children.length > 0) {
      messages.push(...collectMessages(error.children, currentPath));
    }
  }

  return messages;
};

/**
 * Renders validation errors as a single human-readable line.
 *
 * Nested errors keep their full path, so a failure inside `transform.resize` names that
 * property rather than reporting an opaque failure on the root object.
 *
 * @param errors - Errors reported by `class-validator`.
 * @returns A comma-separated summary of every failed constraint.
 */
export const formatValidationErrors = (errors: ValidationError[]): string => {
  const messages = collectMessages(errors, '');
  return messages.length === 0 ? 'Validation failed' : messages.join(', ');
};
