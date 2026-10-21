// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist', 'dist-ios', 'ios', 'node_modules'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // A test asserts what it expects first; a non-null assertion after that only saves noise.
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // TypeScript checks the JavaScript files too (checkJs), so ESLint's own undefined-name rule
    // only gets in the way: it doesn't know Node's globals.
    files: ['**/*.{js,mjs}'],
    rules: { 'no-undef': 'off' },
  },
);
