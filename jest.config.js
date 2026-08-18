/**
 * Jest configuration. The structure is fleet-wide; only `coverageThreshold` is tuned per
 * service, and it only ever moves up.
 *
 * @type {import('jest').Config}
 */
const moduleFileExtensions = ['ts', 'js', 'json'];

const transform = {
  '^.+\\.ts$': [
    'ts-jest',
    {
      tsconfig: 'tsconfig.spec.json',
      useESM: true,
    },
  ],
};

// Source files import each other with a `.js` extension, which is what Node's ESM loader
// needs; ts-jest resolves the TypeScript file behind it.
const moduleNameMapper = {
  '^(\\.{1,2}/.*)\\.js$': '$1',
};

const project = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  moduleFileExtensions,
  rootDir: '.',
  // Tests import what they use from '@jest/globals', which is what gives the matchers their
  // types. Injected globals would type-check as `any` and hide argument mistakes.
  injectGlobals: false,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  transform,
  moduleNameMapper,
};

const config = {
  extensionsToTreatAsEsm: ['.ts'],

  // Half the cores locally, two in CI where runners are small.
  maxWorkers: process.env.CI ? 2 : '50%',
  bail: process.env.CI ? 1 : 0,
  verbose: process.env.CI === 'true',

  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/', '/test/', '.module.ts$', 'main.ts$'],
  // A floor, not a target: it exists so a change cannot quietly delete coverage.
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 65,
      functions: 90,
      lines: 80,
    },
  },

  projects: [
    {
      ...project,
      displayName: 'unit',
      testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
      testPathIgnorePatterns: ['<rootDir>/test/e2e/', '<rootDir>/dist/'],
      setupFilesAfterEnv: ['<rootDir>/test/setup/unit.setup.ts'],
      testTimeout: 5000,
    },
    {
      ...project,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
      testPathIgnorePatterns: ['<rootDir>/dist/'],
      setupFilesAfterEnv: ['<rootDir>/test/setup/e2e.setup.ts'],
      testTimeout: 30000,
    },
  ],
};

export default config;
