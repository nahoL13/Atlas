import { describe, expect, it, vi } from 'vitest';
import type { SpeechSynthesisPort, UtteranceSpec, VoiceInfo } from '../src/speech-output.js';
import { createSpeechOutput } from '../src/speech-output.js';
import { isPiperVoiceURI, piperModelIdOf, resolveVoiceBackend } from '../src/speech-output.js';

const LOCAL_VOICE_1: VoiceInfo = { voiceURI: 'local-1', name: 'Local Um', localService: true };
const LOCAL_VOICE_2: VoiceInfo = { voiceURI: 'local-2', name: 'Local Dois', localService: true };
const NETWORK_VOICE: VoiceInfo = { voiceURI: 'network-1', name: 'Rede Um', localService: false };

function fakeSynth(overrides: Partial<SpeechSynthesisPort> = {}): SpeechSynthesisPort {
  return {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
    ...overrides,
  };
}

describe('createSpeechOutput', () => {
  it('fala texto não-vazio com ≥1 voz local: cancela, então fala com texto normalizado e voiceURI local', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => [LOCAL_VOICE_1]) });
    const calls: string[] = [];
    (synth.cancel as ReturnType<typeof vi.fn>).mockImplementation(() => calls.push('cancel'));
    (synth.speak as ReturnType<typeof vi.fn>).mockImplementation((spec: UtteranceSpec) => {
      calls.push(`speak:${spec.text}:${spec.voiceURI}`);
    });

    const output = createSpeechOutput({ synth });
    output.speak('  olá   mundo  ');

    expect(calls).toEqual(['cancel', 'speak:olá mundo:local-1']);
  });

  it('seleção determinística: com várias vozes locais, escolhe a primeira na ordem de getVoices()', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => [LOCAL_VOICE_1, LOCAL_VOICE_2]) });
    const output = createSpeechOutput({ synth });
    output.speak('olá');
    expect(synth.speak).toHaveBeenCalledWith({ text: 'olá', voiceURI: 'local-1' });
  });

  it('seleção determinística: com vozes locais e de rede misturadas, escolhe uma local, nunca uma de rede', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => [NETWORK_VOICE, LOCAL_VOICE_2]) });
    const output = createSpeechOutput({ synth });
    output.speak('olá');
    expect(synth.speak).toHaveBeenCalledWith({ text: 'olá', voiceURI: 'local-2' });
  });

  it('speak é no-op quando só há vozes localService === false (nunca fala por voz de rede)', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => [NETWORK_VOICE]) });
    const output = createSpeechOutput({ synth });
    output.speak('olá');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('speak é no-op quando getVoices() devolve lista vazia', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => []) });
    const output = createSpeechOutput({ synth });
    output.speak('olá');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('speak("") é no-op: synth.speak não é chamado', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => [LOCAL_VOICE_1]) });
    const output = createSpeechOutput({ synth });
    output.speak('');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('speak("   ") é no-op: synth.speak não é chamado', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => [LOCAL_VOICE_1]) });
    const output = createSpeechOutput({ synth });
    output.speak('   ');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('isAvailable() é true quando getVoices() devolve ≥1 voz localService === true', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => [LOCAL_VOICE_1]) });
    const output = createSpeechOutput({ synth });
    expect(output.isAvailable()).toBe(true);
  });

  it('isAvailable() é false quando getVoices() devolve lista vazia', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => []) });
    const output = createSpeechOutput({ synth });
    expect(output.isAvailable()).toBe(false);
  });

  it('isAvailable() é false quando getVoices() devolve só vozes localService === false', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => [NETWORK_VOICE]) });
    const output = createSpeechOutput({ synth });
    expect(output.isAvailable()).toBe(false);
  });

  it('isAvailable() é false quando getVoices() lança (fail-safe)', () => {
    const synth = fakeSynth({
      getVoices: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const output = createSpeechOutput({ synth });
    expect(output.isAvailable()).toBe(false);
  });

  it('speak(text) não propaga quando getVoices lança', () => {
    const synth = fakeSynth({
      getVoices: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const output = createSpeechOutput({ synth });
    expect(() => output.speak('olá')).not.toThrow();
  });

  it('speak(text) não propaga quando synth.speak lança', () => {
    const synth = fakeSynth({
      getVoices: vi.fn(() => [LOCAL_VOICE_1]),
      speak: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const output = createSpeechOutput({ synth });
    expect(() => output.speak('olá')).not.toThrow();
  });

  it('speak(text) não propaga quando synth.cancel lança', () => {
    const synth = fakeSynth({
      getVoices: vi.fn(() => [LOCAL_VOICE_1]),
      cancel: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const output = createSpeechOutput({ synth });
    expect(() => output.speak('olá')).not.toThrow();
  });

  it('cancel() explícito delega a synth.cancel()', () => {
    const synth = fakeSynth();
    const output = createSpeechOutput({ synth });
    output.cancel();
    expect(synth.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancel() explícito não propaga quando synth.cancel lança', () => {
    const synth = fakeSynth({
      cancel: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const output = createSpeechOutput({ synth });
    expect(() => output.cancel()).not.toThrow();
  });

  describe('preferredVoiceURI (ADR-0020(b), SPEC-0039)', () => {
    it('com preferredVoiceURI apontando para uma voz local existente, speak emite essa voz mesmo não sendo a primeira', () => {
      const synth = fakeSynth({ getVoices: vi.fn(() => [LOCAL_VOICE_1, LOCAL_VOICE_2]) });
      const output = createSpeechOutput({ synth, preferredVoiceURI: () => 'local-2' });
      output.speak('olá');
      expect(synth.speak).toHaveBeenCalledWith({ text: 'olá', voiceURI: 'local-2' });
    });

    it('preferredVoiceURI ausente cai na primeira voz local', () => {
      const synth = fakeSynth({ getVoices: vi.fn(() => [LOCAL_VOICE_1, LOCAL_VOICE_2]) });
      const output = createSpeechOutput({ synth });
      output.speak('olá');
      expect(synth.speak).toHaveBeenCalledWith({ text: 'olá', voiceURI: 'local-1' });
    });

    it('preferredVoiceURI retornando undefined cai na primeira voz local', () => {
      const synth = fakeSynth({ getVoices: vi.fn(() => [LOCAL_VOICE_1, LOCAL_VOICE_2]) });
      const output = createSpeechOutput({ synth, preferredVoiceURI: () => undefined });
      output.speak('olá');
      expect(synth.speak).toHaveBeenCalledWith({ text: 'olá', voiceURI: 'local-1' });
    });

    it('preferredVoiceURI apontando para voz inexistente cai na primeira voz local', () => {
      const synth = fakeSynth({ getVoices: vi.fn(() => [LOCAL_VOICE_1, LOCAL_VOICE_2]) });
      const output = createSpeechOutput({ synth, preferredVoiceURI: () => 'nao-existe' });
      output.speak('olá');
      expect(synth.speak).toHaveBeenCalledWith({ text: 'olá', voiceURI: 'local-1' });
    });

    it('preferredVoiceURI apontando para voz com localService === false cai na primeira voz local', () => {
      const synth = fakeSynth({ getVoices: vi.fn(() => [NETWORK_VOICE, LOCAL_VOICE_1]) });
      const output = createSpeechOutput({ synth, preferredVoiceURI: () => 'network-1' });
      output.speak('olá');
      expect(synth.speak).toHaveBeenCalledWith({ text: 'olá', voiceURI: 'local-1' });
    });

    it('sem nenhuma voz local, speak é no-op e isAvailable é false mesmo com preferredVoiceURI definido', () => {
      const synth = fakeSynth({ getVoices: vi.fn(() => [NETWORK_VOICE]) });
      const output = createSpeechOutput({ synth, preferredVoiceURI: () => 'network-1' });
      output.speak('olá');
      expect(synth.speak).not.toHaveBeenCalled();
      expect(output.isAvailable()).toBe(false);
    });

    it('preferredVoiceURI que lança é tratado como ausente (fail-safe), cai na primeira voz local', () => {
      const synth = fakeSynth({ getVoices: vi.fn(() => [LOCAL_VOICE_1]) });
      const output = createSpeechOutput({
        synth,
        preferredVoiceURI: () => {
          throw new Error('boom');
        },
      });
      expect(() => output.speak('olá')).not.toThrow();
      expect(synth.speak).toHaveBeenCalledWith({ text: 'olá', voiceURI: 'local-1' });
    });

    it('o provider é amostrado a cada speak: dois speak com valores diferentes usam vozes diferentes, sem recriar o objeto', () => {
      const synth = fakeSynth({ getVoices: vi.fn(() => [LOCAL_VOICE_1, LOCAL_VOICE_2]) });
      let current = 'local-1';
      const output = createSpeechOutput({ synth, preferredVoiceURI: () => current });

      output.speak('primeiro');
      expect(synth.speak).toHaveBeenLastCalledWith({ text: 'primeiro', voiceURI: 'local-1' });

      current = 'local-2';
      output.speak('segundo');
      expect(synth.speak).toHaveBeenLastCalledWith({ text: 'segundo', voiceURI: 'local-2' });
    });
  });
});

describe('isPiperVoiceURI / piperModelIdOf (SPEC-0040, ADR-0021(d))', () => {
  it('critério 17: reconhece piper:<id> e desmonta o id', () => {
    expect(isPiperVoiceURI('piper:pt_BR-faber-medium')).toBe(true);
    expect(piperModelIdOf('piper:pt_BR-faber-medium')).toBe('pt_BR-faber-medium');
  });

  it('critério 17: trata qualquer outro valor como voz do SO', () => {
    expect(isPiperVoiceURI('com.apple.voice.compact.pt-BR.Luciana')).toBe(false);
    expect(isPiperVoiceURI('')).toBe(false);
    expect(piperModelIdOf('com.apple.voice.compact.pt-BR.Luciana')).toBeUndefined();
    expect(piperModelIdOf('')).toBeUndefined();
  });
});

describe('resolveVoiceBackend (SPEC-0040, Decisão D8)', () => {
  const PIPER_A = 'piper:pt_BR-faber-medium';
  const PIPER_B = 'piper:pt_BR-outro-medium';
  const OS_A = 'os-voice-a';
  const OS_B = 'os-voice-b';

  it('critério 18: preferida Piper existente ⇒ piper', () => {
    expect(
      resolveVoiceBackend({
        preferredVoiceURI: PIPER_A,
        piperVoiceURIs: [PIPER_A, PIPER_B],
        localVoiceURIs: [OS_A],
        defaultPiperVoiceURI: PIPER_B,
      }),
    ).toEqual({ backend: 'piper', voiceURI: PIPER_A });
  });

  it('critério 18: preferida do SO existente ⇒ os', () => {
    expect(
      resolveVoiceBackend({
        preferredVoiceURI: OS_A,
        piperVoiceURIs: [PIPER_A],
        localVoiceURIs: [OS_A, OS_B],
        defaultPiperVoiceURI: PIPER_A,
      }),
    ).toEqual({ backend: 'os', voiceURI: OS_A });
  });

  it('critério 18: preferida ausente, com default Piper disponível ⇒ piper (default)', () => {
    expect(
      resolveVoiceBackend({
        piperVoiceURIs: [PIPER_A],
        localVoiceURIs: [OS_A],
        defaultPiperVoiceURI: PIPER_A,
      }),
    ).toEqual({ backend: 'piper', voiceURI: PIPER_A });
  });

  it('critério 18: preferida inexistente nas duas listas, com default Piper disponível ⇒ piper (default)', () => {
    expect(
      resolveVoiceBackend({
        preferredVoiceURI: 'nao-existe-em-lugar-nenhum',
        piperVoiceURIs: [PIPER_A],
        localVoiceURIs: [OS_A],
        defaultPiperVoiceURI: PIPER_A,
      }),
    ).toEqual({ backend: 'piper', voiceURI: PIPER_A });
  });

  it('critério 18: sem Piper nenhum (catálogo vazio ou default indisponível) ⇒ os (1ª voz local)', () => {
    expect(
      resolveVoiceBackend({
        piperVoiceURIs: [],
        localVoiceURIs: [OS_A, OS_B],
      }),
    ).toEqual({ backend: 'os', voiceURI: OS_A });
  });

  it('critério 18: sem voz alguma ⇒ none', () => {
    expect(
      resolveVoiceBackend({
        piperVoiceURIs: [],
        localVoiceURIs: [],
      }),
    ).toEqual({ backend: 'none' });
  });

  it('critério 19: nunca devolve uma voiceURI ausente das listas recebidas — defaultPiperVoiceURI "fantasma" é ignorado', () => {
    const result = resolveVoiceBackend({
      piperVoiceURIs: [],
      localVoiceURIs: [OS_A],
      defaultPiperVoiceURI: 'piper:nao-instalado',
    });
    expect(result).toEqual({ backend: 'os', voiceURI: OS_A });
  });

  it('critério 19: preferredVoiceURI "fantasma" nunca é devolvido sem existir em nenhuma lista', () => {
    const result = resolveVoiceBackend({
      preferredVoiceURI: 'piper:nao-instalado',
      piperVoiceURIs: [],
      localVoiceURIs: [],
    });
    expect(result).toEqual({ backend: 'none' });
  });

  describe('critério 20: concordância com createSpeechOutput no ramo `os` (D16)', () => {
    // `createSpeechOutput` é a fonte de verdade de QUAL voz do SO falar;
    // `resolveVoiceBackend` só escolhe a ORIGEM ('piper'/'os'/'none'). Este
    // bloco prova que, nos três casos relevantes, a `voiceURI` que
    // `resolveVoiceBackend` devolve no ramo 'os' é IGUAL à `voiceURI` que
    // `createSpeechOutput` carimba no `UtteranceSpec` entregue ao `synth`
    // fake, com o mesmo conjunto de vozes e a mesma preferência.
    const LOCAL_1: VoiceInfo = { voiceURI: 'local-1', name: 'Local Um', localService: true };
    const LOCAL_2: VoiceInfo = { voiceURI: 'local-2', name: 'Local Dois', localService: true };

    function fakeSynthWith(voices: readonly VoiceInfo[]): SpeechSynthesisPort {
      let speakSpec: UtteranceSpec | undefined;
      return {
        speak: (spec: UtteranceSpec) => {
          speakSpec = spec;
        },
        cancel: vi.fn(),
        getVoices: () => voices,
        // Exposição de teste, fora da interface pública, para inspeção.
        // (armazenado via closure, lido abaixo por referência de objeto)
        get _lastSpec() {
          return speakSpec;
        },
      } as unknown as SpeechSynthesisPort;
    }

    it('preferência apontando para voz local existente', () => {
      const synth = fakeSynthWith([LOCAL_1, LOCAL_2]) as unknown as SpeechSynthesisPort & {
        _lastSpec?: UtteranceSpec;
      };
      const output = createSpeechOutput({ synth, preferredVoiceURI: () => 'local-2' });
      output.speak('olá');

      const backendResult = resolveVoiceBackend({
        preferredVoiceURI: 'local-2',
        piperVoiceURIs: [],
        localVoiceURIs: [LOCAL_1.voiceURI, LOCAL_2.voiceURI],
      });

      expect(backendResult).toEqual({ backend: 'os', voiceURI: 'local-2' });
      expect(synth._lastSpec?.voiceURI).toBe('local-2');
      expect(backendResult).toMatchObject({ voiceURI: synth._lastSpec?.voiceURI });
    });

    it('preferência ausente', () => {
      const synth = fakeSynthWith([LOCAL_1, LOCAL_2]) as unknown as SpeechSynthesisPort & {
        _lastSpec?: UtteranceSpec;
      };
      const output = createSpeechOutput({ synth });
      output.speak('olá');

      const backendResult = resolveVoiceBackend({
        piperVoiceURIs: [],
        localVoiceURIs: [LOCAL_1.voiceURI, LOCAL_2.voiceURI],
      });

      expect(backendResult).toEqual({ backend: 'os', voiceURI: 'local-1' });
      expect(synth._lastSpec?.voiceURI).toBe('local-1');
      expect(backendResult).toMatchObject({ voiceURI: synth._lastSpec?.voiceURI });
    });

    it('preferência apontando para voz inexistente/não-local', () => {
      const synth = fakeSynthWith([LOCAL_1, LOCAL_2]) as unknown as SpeechSynthesisPort & {
        _lastSpec?: UtteranceSpec;
      };
      const output = createSpeechOutput({ synth, preferredVoiceURI: () => 'nao-existe' });
      output.speak('olá');

      const backendResult = resolveVoiceBackend({
        preferredVoiceURI: 'nao-existe',
        piperVoiceURIs: [],
        localVoiceURIs: [LOCAL_1.voiceURI, LOCAL_2.voiceURI],
      });

      expect(backendResult).toEqual({ backend: 'os', voiceURI: 'local-1' });
      expect(synth._lastSpec?.voiceURI).toBe('local-1');
      expect(backendResult).toMatchObject({ voiceURI: synth._lastSpec?.voiceURI });
    });
  });

  describe('critério 21: catálogo Piper vazio — mesmo desfecho do comportamento pré-SPEC-0040', () => {
    it('catálogo Piper vazio + preferência de SO existente ⇒ os com a voz preferida', () => {
      expect(
        resolveVoiceBackend({
          preferredVoiceURI: OS_A,
          piperVoiceURIs: [],
          localVoiceURIs: [OS_A, OS_B],
        }),
      ).toEqual({ backend: 'os', voiceURI: OS_A });
    });

    it('catálogo Piper vazio + preferência ausente ⇒ os com a 1ª voz local', () => {
      expect(
        resolveVoiceBackend({
          piperVoiceURIs: [],
          localVoiceURIs: [OS_A, OS_B],
        }),
      ).toEqual({ backend: 'os', voiceURI: OS_A });
    });

    it('catálogo Piper vazio + nenhuma voz ⇒ none', () => {
      expect(
        resolveVoiceBackend({
          piperVoiceURIs: [],
          localVoiceURIs: [],
        }),
      ).toEqual({ backend: 'none' });
    });
  });
});
