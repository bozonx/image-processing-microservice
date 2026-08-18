import { describe, it, expect } from '@jest/globals';
import type { ValidationError } from 'class-validator';
import { formatValidationErrors } from '../../src/common/utils/validation-errors.js';

describe('formatValidationErrors (unit)', () => {
  it('returns default message when given empty array', () => {
    expect(formatValidationErrors([])).toBe('Validation failed');
  });

  it('formats flat validation errors with constraints', () => {
    const errors: ValidationError[] = [
      {
        property: 'name',
        constraints: {
          isNotEmpty: 'name should not be empty',
          isString: 'name must be a string',
        },
      },
    ];

    expect(formatValidationErrors(errors)).toBe(
      'name: name should not be empty, name: name must be a string',
    );
  });

  it('formats nested validation errors', () => {
    const errors: ValidationError[] = [
      {
        property: 'user',
        children: [
          {
            property: 'profile',
            children: [
              {
                property: 'age',
                constraints: {
                  min: 'age must not be less than 18',
                },
              },
            ],
          },
        ],
      },
    ];

    expect(formatValidationErrors(errors)).toBe('user.profile.age: age must not be less than 18');
  });

  it('handles errors without constraints or children gracefully', () => {
    const errors: ValidationError[] = [
      {
        property: 'optionalField',
      },
    ];

    expect(formatValidationErrors(errors)).toBe('Validation failed');
  });
});
