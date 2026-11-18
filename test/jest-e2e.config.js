import { baseConfig } from '../jest.config.js';

export default {
  ...baseConfig,
  rootDir: '..',
  roots: ['<rootDir>/test'],
  testRegex: '\\.e2e-spec\\.ts$',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 30_000,
};
