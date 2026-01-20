import type { ValidationError } from 'class-validator';

const joinPath = (path: string, property: string): string => {
  if (!path) return property;
  return `${path}.${property}`;
};

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

export const formatValidationErrors = (errors: ValidationError[]): string => {
  const messages = collectMessages(errors, '');
  if (messages.length === 0) {
    return 'Validation failed';
  }
  return messages.join(', ');
};
