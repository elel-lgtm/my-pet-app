// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

/**
 * Import restrictions shared by every file. Repeated rather than inherited because a later flat
 * config block replaces a rule's options wholesale instead of merging them.
 */
const SHARED_IMPORT_PATTERNS = [
  {
    group: ['../*', './../*'],
    message: 'Use the `@/` path alias instead of climbing out of a directory.',
  },
  {
    group: ['@/features/*/*'],
    message: 'Import a feature only through its public entry point: `@/features/<name>`.',
  },
];

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'node_modules/*',
      'scripts/reset-project.js',
      // Generated from the live schema; regenerated wholesale rather than edited.
      'lib/supabase/database.types.ts',
    ],
  },
  {
    // Architectural boundaries. See ARCHITECTURE.md for the rationale behind each rule.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Always import through the `@/` alias so a file's layer is readable at the import site.
      'no-restricted-imports': ['error', { patterns: SHARED_IMPORT_PATTERNS }],
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
    // Screens and shared components must never hold a database client. Data reaches the UI through
    // feature logic and the ports in `@/lib/data`; a query issued from a render function is both a
    // layering violation and the usual way credentials and N+1 fetches end up in a component tree.
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...SHARED_IMPORT_PATTERNS,
            {
              group: ['@supabase/*', '@/lib/supabase', '@/lib/supabase/*'],
              message:
                'Only data adapters may touch Supabase. Go through the ports in `@/lib/data`.',
            },
          ],
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
