import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/', '**/dist/', '**/coverage/'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    // apps/desktop: preload (CommonJS) e renderer (contexto Chromium/browser,
    // fora da resolução de módulos do Node) — globals mínimos para o lint
    // não acusar `window`/`document`/`require` como indefinidos.
    files: ['apps/desktop/src/preload.cjs'],
    languageOptions: {
      globals: { require: 'readonly', module: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        Audio: 'readonly',
      },
    },
  },
);
