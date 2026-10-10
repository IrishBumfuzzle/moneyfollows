import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'backend/**', 'supabase/.temp/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The engine must stay deterministic (CLAUDE.md 4): no clock, no randomness, no I/O.
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded hash from the engine.' },
        { object: 'Date', property: 'now', message: 'The engine takes no clock.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: 'The engine takes no clock.' },
        { selector: "CallExpression[callee.name='fetch']", message: 'The engine does no network I/O.' },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'process'],
    },
  },
);
