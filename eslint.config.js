import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config.
 *
 * Deliberately not type-aware: `npm run check` (astro check) already does the
 * full type pass, so the linter only has to catch style and correctness smells.
 */
export default [
  {
    ignores: ['dist/', '.astro/', 'node_modules/', 'public/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // `x!` is used at a handful of provably-non-null DOM lookups.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // TypeScript inside `.astro` frontmatter and <script> blocks.
    files: ['**/*.astro'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    // Node-only tooling.
    files: ['*.config.{js,mjs,ts}', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
];
