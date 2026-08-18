import { afterEach, describe, expect, it } from 'vitest';
import type { RendererFixture } from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// Frente 5 (SPEC-0045): os dois gatilhos assíncronos de reavaliação de voz
// (resposta do IPC de TTS × `voiceschanged`) e a política Piper-only na
// superfície do `<select>` de voz do formulário de Persona.

let fixture: RendererFixture | undefined;

afterEach(() => {
  fixture?.close();
  fixture = undefined;
});

interface HtmlSelectLike {
  options: { length: number; item(index: number): { value: string; textContent: string } | null };
}

interface HtmlButtonLike {
  disabled: boolean;
  title: string;
}

function selectOptionValues(select: HtmlSelectLike): string[] {
  const values: string[] = [];
  for (let i = 0; i < select.options.length; i += 1) {
    const option = select.options.item(i);
    if (option !== null) {
      values.push(option.value);
    }
  }
  return values;
}

async function submitChat(f: RendererFixture, text: string): Promise<void> {
  const input = f.document.getElementById('chat-input') as unknown as { value: string };
  input.value = text;
  f.document
    .getElementById('chat-form')
    ?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
  await f.flush();
}

type HtmlSpeakButton = HtmlButtonLike & { textContent: string };

function findSpeakButton(f: RendererFixture): HtmlSpeakButton {
  const buttons = [
    ...f.document.querySelectorAll('#chat-transcript button'),
  ] as unknown as HtmlSpeakButton[];
  // SPEC-0053 (Escopo 9/CA11): rótulo de controle sem emoji.
  const speakButton = buttons.find((b) => b.textContent === 'Ouvir');
  if (speakButton === undefined) {
    throw new Error('botão "Ouvir" não encontrado no transcript');
  }
  return speakButton;
}

describe('botão "Ouvir": sem voz nenhuma', () => {
  it('fica desabilitado com title de indisponibilidade (nunca ativo-porém-mudo)', async () => {
    fixture = await loadRenderer({ osVoices: [], piperAvailable: false, piperVoices: [] });
    const f = fixture;
    await submitChat(f, 'oi');

    const button = findSpeakButton(f);
    expect(button.disabled).toBe(true);
    expect(button.title).not.toBe('');
  });
});

describe('gatilho independente: resposta do IPC de TTS (sem voiceschanged)', () => {
  it('reavalia o botão pendente quando o catálogo/disponibilidade Piper chegam, sem depender de voiceschanged', async () => {
    let resolveVoices: (
      voices: readonly {
        id: string;
        voiceURI: string;
        name: string;
        language: string;
        sampleRate: number;
      }[],
    ) => void = () => {};
    let resolveAvailable: (available: boolean) => void = () => {};
    const voicesPromise = new Promise<
      readonly {
        id: string;
        voiceURI: string;
        name: string;
        language: string;
        sampleRate: number;
      }[]
    >((resolve) => {
      resolveVoices = resolve;
    });
    const availablePromise = new Promise<boolean>((resolve) => {
      resolveAvailable = resolve;
    });

    fixture = await loadRenderer({
      osVoices: [],
      atlas: {
        tts: {
          voices: () => voicesPromise,
          speak: () => Promise.resolve(undefined),
          cancel: () => Promise.resolve(),
          available: () => availablePromise,
        },
      },
    });
    const f = fixture;

    await submitChat(f, 'oi');
    const button = findSpeakButton(f);
    expect(button.disabled).toBe(true);

    resolveVoices([
      {
        id: 'pt_BR-faber-medium',
        voiceURI: 'piper:pt_BR-faber-medium',
        name: 'Faber',
        language: 'pt-BR',
        sampleRate: 22050,
      },
    ]);
    resolveAvailable(true);
    await f.flush();

    expect(button.disabled).toBe(false);
  });
});

describe('gatilho independente: voiceschanged (sem catálogo Piper)', () => {
  it('reavalia o botão pendente e o <select> quando voiceschanged dispara, sem depender do IPC de TTS', async () => {
    fixture = await loadRenderer({ osVoices: [], piperAvailable: false, piperVoices: [] });
    const f = fixture;

    await submitChat(f, 'oi');
    const button = findSpeakButton(f);
    expect(button.disabled).toBe(true);

    f.speechSynthesis.setVoices([{ voiceURI: 'local-1', name: 'Local Um', localService: true }]);
    f.speechSynthesis.fireVoicesChanged();
    await f.flush();

    expect(button.disabled).toBe(false);
  });
});

describe('<select> de voz do formulário: política Piper-only', () => {
  it('modo Piper-only (available === true e catálogo não vazio): só vozes Piper (value piper:*)', async () => {
    fixture = await loadRenderer({
      osVoices: [{ voiceURI: 'local-1', name: 'Local Um', localService: true }],
      piperAvailable: true,
      piperVoices: [
        {
          id: 'pt_BR-faber-medium',
          voiceURI: 'piper:pt_BR-faber-medium',
          name: 'Faber',
          language: 'pt-BR',
          sampleRate: 22050,
        },
      ],
    });
    const f = fixture;
    await f.flush();

    const select = f.document.getElementById('persona-voice-uri') as unknown as HtmlSelectLike;
    const values = selectOptionValues(select).filter((v) => v !== '');
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value.startsWith('piper:')).toBe(true);
    }
  });

  it('modo degradado (Piper indisponível ou catálogo vazio): só vozes locais do SO (nenhum piper:*)', async () => {
    fixture = await loadRenderer({
      osVoices: [{ voiceURI: 'local-1', name: 'Local Um', localService: true }],
      piperAvailable: false,
      piperVoices: [],
    });
    const f = fixture;
    await f.flush();

    const select = f.document.getElementById('persona-voice-uri') as unknown as HtmlSelectLike;
    const values = selectOptionValues(select).filter((v) => v !== '');
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value.startsWith('piper:')).toBe(false);
    }
  });
});
