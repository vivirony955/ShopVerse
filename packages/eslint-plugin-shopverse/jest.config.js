// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          strict: false,
          esModuleInterop: true,
          target: 'ES2021',
          module: 'commonjs',
          moduleResolution: 'node',
          skipLibCheck: true,
        },
        // The rule-tester package uses an `exports` map that classic Node
        // resolution can't read at type-check time. Tests are still
        // type-aware against our own rule source; we just suppress
        // cross-package resolution diagnostics (TS2307) during jest.
        diagnostics: { ignoreCodes: [2307] },
      },
    ],
  },
  testEnvironment: 'node',
  modulePaths: ['<rootDir>/../node_modules'],
};
