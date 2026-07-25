import { describe, expect, it, vi } from 'vitest';
import type { SpeechSynthesisPort, UtteranceSpec, VoiceInfo } from '../src/speech-output.js';
import { createSpeechOutput } from '../src/speech-output.js';

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
});
