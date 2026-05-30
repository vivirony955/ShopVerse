// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

const nextJest = require('next/jest.js');

const createJestConfig = nextJest({
  // Path to load next.config and .env for the test runtime.
  dir: './',
});

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Force single React instance — jest hoisted into repo-root
    // node_modules pulls in its own React 18; the host frontend uses
    // React 19. Two dispatchers = dual-context = hooks return null
    // when crossing instance boundaries.
    '^react$': '<rootDir>/node_modules/react',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-dom/(.*)$': '<rootDir>/node_modules/react-dom/$1',
  },
  // Limit Jest to the new W5 slot infrastructure tests. The legacy
  // src/app/__tests__/ProductListingPage.test.tsx is excluded from
  // tsconfig and references deleted helpers — surface separately if
  // someone wants to revive it.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/src/app/__tests__/',
    '/e2e/',
  ],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)'],
};

module.exports = createJestConfig(customJestConfig);
