import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/node_modules/', '**/dist/', '**/coverage/', 'apps/desktop/src/renderer/vendor/'],
  },
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
    files: ['apps/desktop/src/renderer/**/*.js', 'apps/desktop/src/renderer/**/*.mjs'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        SpeechSynthesisUtterance: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        Audio: 'readonly',
        // SPEC-0046 — entrada por voz (STT): captura via getUserMedia/AudioContext.
        navigator: 'readonly',
        AudioContext: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        // SPEC-0052 — modo hands-free: rearme periódico da janela de captura
        // (setInterval/clearInterval) e submissão sintética de `#chat-form`
        // (Event).
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Event: 'readonly',
      },
    },
  },
);
