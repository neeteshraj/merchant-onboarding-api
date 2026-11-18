/** Shared by unit (`*.spec.ts`) and e2e (`*.e2e-spec.ts`) configs. */
export const baseConfig = {
  rootDir: '.',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2023',
          keepClassNames: true,
        },
        module: { type: 'es6' },
        sourceMaps: 'inline',
      },
    ],
  },
};

export default {
  ...baseConfig,
  roots: ['<rootDir>/src'],
  testRegex: '\\.spec\\.ts$',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/database/migrations/**',
    '!src/database/seed.ts',
    '!src/database/data-source.ts',
  ],
};
