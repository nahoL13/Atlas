/**
 * Saída de voz (TTS), item 2.3 do Roadmap — primeira fatia (só saída),
 * endurecida pela SPEC-0036 para garantir voz 100% local.
 *
 * Módulo puro/injetável, sem import de `electron` nem de globais de
 * navegador (`window`/`SpeechSynthesisUtterance`), no molde de
 * `src/confirm-port.ts`. A ligação real com a Web Speech API do Chromium
 * (`window.speechSynthesis`) fica isolada no renderer
 * (`src/renderer/renderer.js`) — a mesma fronteira que isola
 * `dialog.showMessageBox` em `src/main.ts`.
 *
 * Offline garantido para a voz efetivamente usada: este módulo filtra as
 * vozes candidatas para apenas as marcadas pelo padrão da Web Speech API
 * como locais (`SpeechSynthesisVoice.localService === true`), seleciona
 * deterministicamente a primeira e a carimba no `UtteranceSpec` para o
 * renderer vincular explicitamente ao `SpeechSynthesisUtterance` real.
 * Sem nenhuma voz local disponível, a saída fica indisponível
 * (`isAvailable() === false`) e `speak` é no-op — nunca há fallback para
 * uma voz de rede. A garantia depende de o SO/navegador reportar
 * `localService` corretamente (ver Observações da SPEC-0036); dada essa
 * ressalva, o módulo nunca faz nenhuma chamada de rede por si.
 */

/**
 * Projeção mínima e estrutural de `SpeechSynthesisVoice` de que este módulo
 * precisa para filtrar vozes locais — nenhum tipo de navegador importado.
 */
export interface VoiceInfo {
  readonly voiceURI: string;
  readonly name: string;
  readonly localService: boolean;
}

/**
 * O dado que o renderer converte num `SpeechSynthesisUtterance` real,
 * já com a voz local escolhida vinculada por `voiceURI`.
 */
export interface UtteranceSpec {
  readonly text: string;
  readonly voiceURI: string;
}

/**
 * Superfície mínima de `window.speechSynthesis` de que esta fatia precisa,
 * satisfeita estruturalmente — nenhum tipo de navegador importado.
 */
export interface SpeechSynthesisPort {
  speak(spec: UtteranceSpec): void;
  cancel(): void;
  getVoices(): readonly VoiceInfo[];
}

export interface SpeechOutput {
  speak(text: string): void;
  cancel(): void;
  isAvailable(): boolean;
}

/**
 * Seleciona deterministicamente a primeira voz local (ordem de
 * `getVoices()`), devolvendo seu `voiceURI` — ou `undefined` se não houver
 * nenhuma voz local. Fail-closed: nunca escolhe uma voz de rede.
 */
function selectLocalVoiceURI(synth: SpeechSynthesisPort): string | undefined {
  const voices = synth.getVoices();
  const localVoice = voices.find((voice) => voice.localService === true);
  return localVoice?.voiceURI;
}

/**
 * Resolve a voz a usar (ADR-0020(b), SPEC-0039, Decisão D8): entre as vozes
 * `localService === true`, prefere a de `voiceURI` igual ao devolvido pelo
 * `preferredVoiceURI` provider — amostrado a cada `speak` (não fixado no
 * construtor), para que trocar/editar a Persona ativa mude a voz sem
 * recriar este objeto (molde do `memoryPrompt` da SPEC-0021). Não havendo
 * preferência (ausente, provider lançando, ou apontando para uma voz
 * inexistente/não-local), cai na primeira voz local — comportamento
 * idêntico ao da SPEC-0036. Nunca escolhe uma voz de rede, em nenhuma das
 * duas camadas.
 */
function selectVoiceURI(
  synth: SpeechSynthesisPort,
  preferredVoiceURI?: () => string | undefined,
): string | undefined {
  const voices = synth.getVoices();
  let preferred: string | undefined;
  try {
    preferred = preferredVoiceURI?.();
  } catch {
    preferred = undefined;
  }
  if (preferred !== undefined) {
    const match = voices.find(
      (voice) => voice.voiceURI === preferred && voice.localService === true,
    );
    if (match !== undefined) {
      return match.voiceURI;
    }
  }
  return voices.find((voice) => voice.localService === true)?.voiceURI;
}

function hasLocalVoice(synth: SpeechSynthesisPort): boolean {
  try {
    return selectLocalVoiceURI(synth) !== undefined;
  } catch {
    return false;
  }
}

/**
 * `createSpeechOutput` decide o que falar, quando não falar, e cancela a
 * fala anterior antes de iniciar a próxima. Fail-safe: qualquer erro do
 * `synth` injetado é capturado e nunca propaga para o fluxo do chat.
 * Fail-closed: sem voz local disponível, `speak` é no-op — nunca cai numa
 * voz de rede como alternativa.
 */
export function createSpeechOutput(deps: {
  synth: SpeechSynthesisPort;
  /**
   * Provider síncrono da voz preferida (ADR-0020(b), Decisão D8),
   * amostrado a cada `speak` — não fixado no construtor. Ausente ou
   * lançando é tratado como preferência ausente (fail-safe, nunca propaga).
   */
  preferredVoiceURI?: () => string | undefined;
}): SpeechOutput {
  const { synth, preferredVoiceURI } = deps;

  return {
    speak(text: string): void {
      const normalized = text.trim().replace(/\s+/g, ' ');
      if (normalized === '') {
        return;
      }
      try {
        const voiceURI = selectVoiceURI(synth, preferredVoiceURI);
        if (voiceURI === undefined) {
          return;
        }
        synth.cancel();
        synth.speak({ text: normalized, voiceURI });
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
      return hasLocalVoice(synth);
    },
  };
}
