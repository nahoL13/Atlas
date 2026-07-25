/**
 * Saída de voz (TTS), item 2.3 do Roadmap — primeira fatia (só saída).
 *
 * Módulo puro/injetável, sem import de `electron` nem de globais de
 * navegador (`window`/`SpeechSynthesisUtterance`), no molde de
 * `src/confirm-port.ts`. A ligação real com a Web Speech API do Chromium
 * (`window.speechSynthesis`) fica isolada no renderer
 * (`src/renderer/renderer.js`) — a mesma fronteira que isola
 * `dialog.showMessageBox` em `src/main.ts`.
 *
 * Offline por construção: toda a operação passa pelo `synth` injetado (o
 * motor de voz local do SO); este módulo não faz nenhuma chamada de rede
 * (sem `fetch`/`XMLHttpRequest`/import de rede). Vozes de plataforma
 * backed por rede, se existirem, estão fora do controle deste módulo — a
 * garantia aqui é a fronteira do módulo puro, não a pilha de voz do SO
 * inteira.
 */

/**
 * O dado que o renderer converte num `SpeechSynthesisUtterance` real.
 */
export interface UtteranceSpec {
  readonly text: string;
}

/**
 * Superfície mínima de `window.speechSynthesis` de que esta fatia precisa,
 * satisfeita estruturalmente — nenhum tipo de navegador importado.
 */
export interface SpeechSynthesisPort {
  speak(spec: UtteranceSpec): void;
  cancel(): void;
  getVoices(): readonly unknown[];
}

export interface SpeechOutput {
  speak(text: string): void;
  cancel(): void;
  isAvailable(): boolean;
}

/**
 * `createSpeechOutput` decide o que falar, quando não falar, e cancela a
 * fala anterior antes de iniciar a próxima. Fail-safe: qualquer erro do
 * `synth` injetado é capturado e nunca propaga para o fluxo do chat.
 */
export function createSpeechOutput(deps: { synth: SpeechSynthesisPort }): SpeechOutput {
  const { synth } = deps;

  return {
    speak(text: string): void {
      const normalized = text.trim().replace(/\s+/g, ' ');
      if (normalized === '') {
        return;
      }
      try {
        synth.cancel();
        synth.speak({ text: normalized });
      } catch {
        // fail-safe: nunca propaga para o fluxo do chat
      }
    },

    cancel(): void {
      try {
        synth.cancel();
      } catch {
        // fail-safe: nunca propaga
      }
    },

    isAvailable(): boolean {
      try {
        return synth.getVoices().length > 0;
      } catch {
        return false;
      }
    },
  };
}
