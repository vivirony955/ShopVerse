// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
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
    // next-auth and axios are declared in test/package.json so they resolve from
    // test/node_modules — no dependency on frontend/node_modules. Explicit mapper
    // also prevents the wrong version being picked up via directory traversal.
    '^next-auth$': '<rootDir>/node_modules/next-auth',
    '^next-auth/(.*)$': '<rootDir>/node_modules/next-auth/$1',
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
  coverageDirectory: './coverage',
  collectCoverageFrom: [
    '../backend/src/**/*.ts',
    '!../backend/src/**/*.module.ts',
    '!../backend/src/main.ts',
    '!../backend/src/prisma/seed.ts',
  ],
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
