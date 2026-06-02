// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          strict: true,
          esModuleInterop: true,
          target: 'ES2021',
          module: 'commonjs',
          moduleResolution: 'node',
          skipLibCheck: true,
        },
      },
    ],
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
};
