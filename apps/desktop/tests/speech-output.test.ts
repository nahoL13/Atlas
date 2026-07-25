import { describe, expect, it, vi } from 'vitest';
import type { SpeechSynthesisPort, UtteranceSpec } from '../src/speech-output.js';
import { createSpeechOutput } from '../src/speech-output.js';

function fakeSynth(overrides: Partial<SpeechSynthesisPort> = {}): SpeechSynthesisPort {
  return {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => []),
    ...overrides,
  };
}

describe('createSpeechOutput', () => {
  it('fala texto não-vazio: cancela a fala em curso e então fala, com texto normalizado', () => {
    const synth = fakeSynth();
    const calls: string[] = [];
    (synth.cancel as ReturnType<typeof vi.fn>).mockImplementation(() => calls.push('cancel'));
    (synth.speak as ReturnType<typeof vi.fn>).mockImplementation((spec: UtteranceSpec) => {
      calls.push(`speak:${spec.text}`);
    });

    const output = createSpeechOutput({ synth });
    output.speak('  olá   mundo  ');

    expect(calls).toEqual(['cancel', 'speak:olá mundo']);
  });

  it('speak("") é no-op: synth.speak não é chamado', () => {
    const synth = fakeSynth();
    const output = createSpeechOutput({ synth });
    output.speak('');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('speak("   ") é no-op: synth.speak não é chamado', () => {
    const synth = fakeSynth();
    const output = createSpeechOutput({ synth });
    output.speak('   ');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('isAvailable() é true quando getVoices() devolve lista não-vazia', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => [{ name: 'voz-1' }]) });
    const output = createSpeechOutput({ synth });
    expect(output.isAvailable()).toBe(true);
  });

  it('isAvailable() é false quando getVoices() devolve lista vazia', () => {
    const synth = fakeSynth({ getVoices: vi.fn(() => []) });
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

  it('speak(text) não propaga quando synth.speak lança', () => {
    const synth = fakeSynth({
      speak: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const output = createSpeechOutput({ synth });
    expect(() => output.speak('olá')).not.toThrow();
  });

  it('speak(text) não propaga quando synth.cancel lança', () => {
    const synth = fakeSynth({
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
