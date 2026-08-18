// Ponte para window.ort — precisa ser um <script type="module" src="…">
// externo, nunca inline: a CSP de index.html é script-src 'self'
// 'wasm-unsafe-eval' (sem 'unsafe-inline'), então um <script type="module">
// inline seria bloqueado em silêncio pelo Chromium (nenhum erro visível,
// window.ort nunca é definido). Um import estático em arquivo externo
// respeita 'self' sem afrouxar a CSP.
import * as ort from './vendor/vad/ort.min.js';

window.ort = ort;
