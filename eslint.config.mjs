// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-server/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      'coverage/**',
      'tmp-build/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-this-alias': ['error', { allowedNames: ['self', 'game'] }],
      'no-control-regex': 'off', // intentional: we sanitize control characters
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-console': 'off',
    },
  },
);
