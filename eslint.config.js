// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'scripts/reset-project.js'],
  },
  {
    // Architectural boundaries. See ARCHITECTURE.md for the rationale behind each rule.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Always import through the `@/` alias so a file's layer is readable at the import site.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../*', './../*'],
              message: 'Use the `@/` path alias instead of climbing out of a directory.',
            },
            {
              group: ['@/features/*/*'],
              message: 'Import a feature only through its public entry point: `@/features/<name>`.',
            },
          ],
        },
      ],
      // `console` is not a logging strategy; `@/lib/logger` is.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // `@/lib/env` is the single place allowed to read application configuration, because Metro
    // only inlines `EXPO_PUBLIC_*` on static dot access and we want one validation choke point.
    // `process.env.EXPO_OS` is exempt: it is a Metro-provided platform constant, not configuration.
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['lib/env.ts', 'app.config.ts', 'jest.config.js', 'jest.setup.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='EXPO_OS']",
          message: 'Read configuration from `@/lib/env` instead of `process.env`.',
        },
        {
          selector: "VariableDeclarator[init.object.name='process'][init.property.name='env']",
          message:
            'Metro does not inline destructured environment variables. Read them from `@/lib/env`.',
        },
      ],
    },
  },
  {
    // The logger is the one module allowed to call console directly.
    files: ['lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.ts'],
    rules: { 'no-console': 'off' },
  },
]);
