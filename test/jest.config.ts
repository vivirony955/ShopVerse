// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      // Suppress TS2307 ("Cannot find module") only.
      // frontend/src/lib/api.ts imports 'axios' and 'next-auth/react' whose
      // type declarations live in frontend/node_modules (not installed in CI).
      // moduleNameMapper resolves both at runtime; the compiler only needs to
      // transpile the file, not type-check cross-context deps.
      // All other TypeScript errors in test files are still reported.
      diagnostics: { ignoreCodes: [2307] },
    }],
  },
  testEnvironment: 'node',
  // Only run spec files that live inside test/ — prevent backend unit tests
  // (backend/src/**/*.spec.ts) from leaking in via symlink or path traversal.
  roots: ['<rootDir>'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/../backend/src/',
    '<rootDir>/../frontend/',
  ],
  moduleNameMapper: {
    '^@backend/(.*)$': '<rootDir>/../backend/src/$1',
    // Force a single copy of every @nestjs/* package to prevent "two Nest
    // instances" DI failures. test/ and backend/ otherwise each resolve
    // their own copy from their respective node_modules and end up with
    // distinct Reflector/SchedulerMetadataAccessor tokens, breaking
    // `Test.createTestingModule({ imports: [AppModule] })`.
    '^@nestjs/(.*)$': '<rootDir>/../backend/node_modules/@nestjs/$1',
    // reflect-metadata and rxjs share similar singleton requirements.
    '^rxjs$': '<rootDir>/../backend/node_modules/rxjs',
    '^rxjs/(.*)$': '<rootDir>/../backend/node_modules/rxjs/$1',
    '^reflect-metadata$': '<rootDir>/../backend/node_modules/reflect-metadata',
    // next-auth: resolve to a zero-dependency local stub so we never load the
    // real package (which requires 'react' as a peer dep, absent from
    // test/node_modules). frontend-api.spec.ts replaces this via jest.mock().
    '^next-auth/(.*)$': '<rootDir>/__mocks__/next-auth-react.js',
    '^next-auth$': '<rootDir>/__mocks__/next-auth-react.js',
    // axios is declared in test/package.json — resolves from test/node_modules.
    '^axios$': '<rootDir>/node_modules/axios',
    '^axios/(.*)$': '<rootDir>/node_modules/axios/$1',
    // Use the backend's Prisma client so new models (Notification, BlogPost,
    // VolumeDiscount, etc.) added to schema.prisma are available in test helpers.
    // The subpath map ensures PrismaClientKnownRequestError from runtime/library
    // is the same class instance the app uses, so @Catch() filters work correctly.
    '^@prisma/client$': '<rootDir>/../backend/node_modules/@prisma/client',
    '^@prisma/client/(.*)$': '<rootDir>/../backend/node_modules/@prisma/client/$1',
  },
  globalSetup: '<rootDir>/setup/global-setup.ts',
  globalTeardown: '<rootDir>/setup/global-teardown.ts',
  setupFiles: ['<rootDir>/setup/env-setup.ts'],
  // V8 provider measures actual executed bytecode rather than transformed
  // source lines. More accurate for TypeScript — no decorator false-positives
  // and correct branch counts on optional chaining / nullish coalescing.
  coverageProvider: 'v8',
  coverageDirectory: './coverage',
  coverageReporters: [
    'text',          // table printed to CI logs — used by GitLab coverage: regex
    'lcov',          // generates lcov.info — industry-standard coverage artifact
    'json-summary',  // generates coverage-summary.json — machine-readable totals
  ],
  collectCoverageFrom: [
    '../backend/src/**/*.ts',
    '!../backend/src/**/*.module.ts',  // just wiring, no testable logic
    '!../backend/src/main.ts',          // bootstrap only
    '!../backend/src/prisma/seed.ts',   // dev utility
    '!../backend/src/**/*.spec.ts',     // exclude any colocated unit tests
  ],
  // Coverage regression gate (CI). Numbers are intentionally CONSERVATIVE —
  // sized as "almost certainly below current actual" so this gate doesn't
  // break on first contact. The first green CI coverage artifact will give
  // us real numbers; bump these toward `(current - 5pp)` so any drop > 5
  // percentage points fails the build. Tracked as a follow-up.
  coverageThreshold: {
    global: {
      statements: 30,
      branches: 20,
      functions: 30,
      lines: 30,
    },
  },
  testTimeout: 30000,
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '.',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
    }],
  ],
};

export default config;
