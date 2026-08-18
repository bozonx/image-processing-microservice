import { describe, it, expect } from '@jest/globals';
import { SERVICE_NAME, SERVICE_VERSION } from '../../src/config/service-info.js';

describe('Environment & Service Info', () => {
  it('should have default or environment values for SERVICE_NAME and SERVICE_VERSION', () => {
    expect(typeof SERVICE_NAME).toBe('string');
    expect(SERVICE_NAME.length).toBeGreaterThan(0);
    expect(typeof SERVICE_VERSION).toBe('string');
    expect(SERVICE_VERSION.length).toBeGreaterThan(0);
  });
});
