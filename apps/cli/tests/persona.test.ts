import { describe, expect, it } from 'vitest';
import { AtlasError } from '@atlas/contracts';
import type { Persona, PersonaInput, PersonaService } from '@atlas/contracts';
import {
  runPersonaCreate,
  runPersonaDelete,
  runPersonaEdit,
  runPersonaList,
  runPersonaShow,
} from '../src/commands/persona.js';
import type { OutputGateway } from '../src/gateway/output-gateway.js';
import type { LineReader } from '../src/gateway/line-reader.js';

function capture(): { output: OutputGateway; text: () => string } {
  const lines: string[] = [];
  return {
    output: { write: (t) => lines.push(t), error: () => {} },
    text: () => lines.join(''),
  };
}

const JARVIS: Persona = {
  id: 'jarvis',
  name: 'Jarvis',
  tone: 'confiante',
  formality: 'formal',
  language: 'pt-BR',
  style: 'direto',
  communicationRules: ['seja objetivo'],
  voice: '',
  emotion: '',
};

const NEUTRAL: Persona = {
  id: 'neutral',
  name: 'Neutral',
  tone: '',
  formality: '',
  language: '',
  style: '',
  communicationRules: [],
  voice: '',
  emotion: '',
};

interface FakePersonaServiceOptions {
  readonly custom?: readonly Persona[];
  /** Injeta um `builtin` espúrio em toda Persona devolvida por `get`, para provar que a marca é derivada, não lida. */
  readonly spuriousBuiltinField?: boolean;
}

interface FakePersonaService {
  readonly service: PersonaService;
  readonly calls: {
    create: PersonaInput[];
    update: Array<{ id: string; input: PersonaInput }>;
    delete: string[];
  };
}

function fakePersonaService(options: FakePersonaServiceOptions = {}): FakePersonaService {
  const custom = new Map<string, Persona>((options.custom ?? []).map((p) => [p.id, p]));
  const builtins = new Map<string, Persona>([
    ['jarvis', JARVIS],
    ['neutral', NEUTRAL],
  ]);
  const calls = {
    create: [] as PersonaInput[],
    update: [] as Array<{ id: string; input: PersonaInput }>,
    delete: [] as string[],
  };

  function resolve(id: string): Persona | undefined {
    return builtins.get(id) ?? custom.get(id);
  }

  function withSpuriousField(persona: Persona): Persona {
    return options.spuriousBuiltinField === true
      ? ({ ...persona, builtin: false } as unknown as Persona)
      : persona;
  }

  const service: PersonaService = {
    get(id: string): Persona {
      const persona = resolve(id);
      if (persona === undefined) {
        throw new AtlasError('ATLAS_PERSONA', `Persona desconhecida: ${id}`);
      }
      return withSpuriousField(persona);
    },
    has(id: string): boolean {
      return resolve(id) !== undefined;
    },
    list(): readonly string[] {
      return ['jarvis', 'neutral', ...custom.keys()];
    },
    systemPrompt(): string {
      return '';
    },
    create(input: PersonaInput): Persona {
      calls.create.push(input);
      const persona: Persona = {
        id: 'novo-id',
        ...input,
        communicationRules: [...input.communicationRules],
      };
      custom.set(persona.id, persona);
      return persona;
    },
    update(id: string, input: PersonaInput): Persona {
      if (builtins.has(id)) {
        throw new AtlasError('ATLAS_PERSONA', `Não é possível editar uma Persona embutida: ${id}`);
      }
      calls.update.push({ id, input });
      const persona: Persona = { id, ...input, communicationRules: [...input.communicationRules] };
      custom.set(id, persona);
      return persona;
    },
    delete(id: string): void {
      if (builtins.has(id)) {
        throw new AtlasError('ATLAS_PERSONA', `Não é possível apagar uma Persona embutida: ${id}`);
      }
      calls.delete.push(id);
      custom.delete(id);
    },
  };

  return { service, calls };
}

function scriptedReader(lines: Array<string | null>): { reader: LineReader; prompts: string[] } {
  let i = 0;
  const prompts: string[] = [];
  return {
    reader: {
      next: async (prompt: string) => {
        prompts.push(prompt);
        const line = i < lines.length ? lines[i] : null;
        i += 1;
        return line ?? null;
      },
      close: () => {},
    },
    prompts,
  };
}

describe('runPersonaList', () => {
  it('imprime uma linha por Persona, marcando embutida/custom pela derivação de PERSONA_IDS', () => {
    const cap = capture();
    const custom: Persona = {
      id: 'terminal-bot',
      name: 'Terminal Bot',
      tone: 'seco',
      formality: '',
      language: '',
      style: '',
      communicationRules: [],
      voice: '',
      emotion: '',
    };
    const { service } = fakePersonaService({ custom: [custom], spuriousBuiltinField: true });
    runPersonaList(service, cap.output);
    const text = cap.text();
    expect(text).toContain('jarvis  Jarvis  [embutida]');
    expect(text).toContain('neutral  Neutral  [embutida]');
    expect(text).toContain('terminal-bot  Terminal Bot  [custom]');
  });
});

describe('runPersonaShow', () => {
  it('imprime os 8 campos, uma regra por linha', () => {
    const cap = capture();
    const { service } = fakePersonaService();
    runPersonaShow(service, 'jarvis', cap.output);
    const text = cap.text();
    expect(text).toContain('name: Jarvis');
    expect(text).toContain('tone: confiante');
    expect(text).toContain('formality: formal');
    expect(text).toContain('language: pt-BR');
    expect(text).toContain('style: direto');
    expect(text).toContain('voice: ');
    expect(text).toContain('emotion: ');
    expect(text).toContain('- seja objetivo');
    expect(text).toContain('[embutida]'.replace('[', '').replace(']', '')); // marca presente
  });

  it('omite a linha de voiceURI quando ausente', () => {
    const cap = capture();
    const { service } = fakePersonaService();
    runPersonaShow(service, 'jarvis', cap.output);
    expect(cap.text()).not.toContain('voiceURI');
  });

  it('mostra voiceURI quando presente', () => {
    const cap = capture();
    const custom: Persona = { ...NEUTRAL, id: 'com-voz', name: 'Com Voz', voiceURI: 'piper:pt-1' };
    const { service } = fakePersonaService({ custom: [custom] });
    runPersonaShow(service, 'com-voz', cap.output);
    expect(cap.text()).toContain('voiceURI: piper:pt-1');
  });
});

describe('runPersonaCreate', () => {
  it('chama create com todos os campos textuais, communicationRules: [], sem voiceURI quando ausente', () => {
    const cap = capture();
    const { service, calls } = fakePersonaService();
    runPersonaCreate(service, 'Meu Assistente', { tone: 't' }, cap.output);
    expect(calls.create).toEqual([
      {
        name: 'Meu Assistente',
        tone: 't',
        formality: '',
        language: '',
        style: '',
        voice: '',
        emotion: '',
        communicationRules: [],
      },
    ]);
    expect(Object.hasOwn(calls.create[0]!, 'voiceURI')).toBe(false);
    expect(cap.text()).toContain('Persona criada [novo-id]: Meu Assistente');
  });
});

describe('runPersonaEdit', () => {
  it('preserva campos não informados, incluindo voiceURI', () => {
    const cap = capture();
    const current: Persona = {
      id: 'terminal-bot',
      name: 'Terminal Bot',
      tone: 'seco',
      formality: 'informal',
      language: 'pt-BR',
      style: 'direto',
      communicationRules: ['seja breve'],
      voice: 'grave',
      emotion: 'neutra',
      voiceURI: 'piper:pt-1',
    };
    const { service, calls } = fakePersonaService({ custom: [current] });
    runPersonaEdit(service, 'terminal-bot', { style: 'telegráfico' }, cap.output);
    expect(calls.update).toEqual([
      {
        id: 'terminal-bot',
        input: {
          name: 'Terminal Bot',
          tone: 'seco',
          formality: 'informal',
          language: 'pt-BR',
          style: 'telegráfico',
          voice: 'grave',
          emotion: 'neutra',
          communicationRules: ['seja breve'],
          voiceURI: 'piper:pt-1',
        },
      },
    ]);
  });

  it('--voice-uri "" limpa a propriedade voiceURI', () => {
    const cap = capture();
    const current: Persona = { ...NEUTRAL, id: 'x', name: 'X', voiceURI: 'piper:pt-1' };
    const { service, calls } = fakePersonaService({ custom: [current] });
    runPersonaEdit(service, 'x', { voiceURI: '' }, cap.output);
    expect(Object.hasOwn(calls.update[0]!.input, 'voiceURI')).toBe(false);
  });

  it('communicationRules: [] grava lista vazia', () => {
    const cap = capture();
    const current: Persona = { ...NEUTRAL, id: 'x', name: 'X', communicationRules: ['a', 'b'] };
    const { service, calls } = fakePersonaService({ custom: [current] });
    runPersonaEdit(service, 'x', { communicationRules: [] }, cap.output);
    expect(calls.update[0]!.input.communicationRules).toEqual([]);
  });

  it('editar jarvis propaga o PersonaError do módulo, sem chamar update', () => {
    const { service, calls } = fakePersonaService();
    const cap = capture();
    expect(() => runPersonaEdit(service, 'jarvis', { tone: 'x' }, cap.output)).toThrow(AtlasError);
    expect(calls.update).toEqual([]);
  });
});

describe('runPersonaDelete', () => {
  it('sem leitor e sem --yes, não chama delete e reporta recusa', async () => {
    const cap = capture();
    const custom: Persona = { ...NEUTRAL, id: 'x', name: 'X' };
    const { service, calls } = fakePersonaService({ custom: [custom] });
    const result = await runPersonaDelete(service, 'x', cap.output, { assumeYes: false });
    expect(result).toBe(false);
    expect(calls.delete).toEqual([]);
    expect(cap.text()).toContain('Remoção cancelada; nada foi apagado.');
  });

  it('com leitor devolvendo null (EOF), não apaga', async () => {
    const cap = capture();
    const custom: Persona = { ...NEUTRAL, id: 'x', name: 'X' };
    const { service, calls } = fakePersonaService({ custom: [custom] });
    const { reader } = scriptedReader([null]);
    const result = await runPersonaDelete(service, 'x', cap.output, {
      assumeYes: false,
      lineReader: reader,
    });
    expect(result).toBe(false);
    expect(calls.delete).toEqual([]);
  });

  it.each(['n', '', 'nao', 'não'])('com resposta %j, não apaga', async (answer) => {
    const cap = capture();
    const custom: Persona = { ...NEUTRAL, id: 'x', name: 'X' };
    const { service, calls } = fakePersonaService({ custom: [custom] });
    const { reader } = scriptedReader([answer]);
    const result = await runPersonaDelete(service, 'x', cap.output, {
      assumeYes: false,
      lineReader: reader,
    });
    expect(result).toBe(false);
    expect(calls.delete).toEqual([]);
  });

  it.each(['s', 'S', 'sim', 'SIM', 'Sim'])(
    'com resposta %j, apaga exatamente uma vez',
    async (answer) => {
      const cap = capture();
      const custom: Persona = { ...NEUTRAL, id: 'x', name: 'X' };
      const { service, calls } = fakePersonaService({ custom: [custom] });
      const { reader } = scriptedReader([answer]);
      const result = await runPersonaDelete(service, 'x', cap.output, {
        assumeYes: false,
        lineReader: reader,
      });
      expect(result).toBe(true);
      expect(calls.delete).toEqual(['x']);
    },
  );

  it('com --yes, o leitor não é consultado e a Persona é apagada', async () => {
    const cap = capture();
    const custom: Persona = { ...NEUTRAL, id: 'x', name: 'X' };
    const { service, calls } = fakePersonaService({ custom: [custom] });
    const { reader, prompts } = scriptedReader(['s']);
    const result = await runPersonaDelete(service, 'x', cap.output, {
      assumeYes: true,
      lineReader: reader,
    });
    expect(result).toBe(true);
    expect(prompts).toEqual([]);
    expect(calls.delete).toEqual(['x']);
  });

  it('id inexistente: leitor recebe zero chamadas e nada é apagado', async () => {
    const cap = capture();
    const { service, calls } = fakePersonaService();
    const { reader, prompts } = scriptedReader(['s']);
    await expect(
      runPersonaDelete(service, 'nao-existe', cap.output, { assumeYes: false, lineReader: reader }),
    ).rejects.toThrow(AtlasError);
    expect(prompts).toEqual([]);
    expect(calls.delete).toEqual([]);
  });

  it('id embutido: recusa antes do prompt, leitor recebe zero chamadas', async () => {
    const cap = capture();
    const { service, calls } = fakePersonaService();
    const { reader, prompts } = scriptedReader(['s']);
    await expect(
      runPersonaDelete(service, 'jarvis', cap.output, { assumeYes: false, lineReader: reader }),
    ).rejects.toThrow(AtlasError);
    expect(prompts).toEqual([]);
    expect(calls.delete).toEqual([]);
  });

  it('inclui aviso no prompt quando o id coincide com a Persona ativa da config', async () => {
    const cap = capture();
    const custom: Persona = { ...NEUTRAL, id: 'x', name: 'X' };
    const { service } = fakePersonaService({ custom: [custom] });
    const { reader, prompts } = scriptedReader(['n']);
    await runPersonaDelete(service, 'x', cap.output, {
      assumeYes: false,
      lineReader: reader,
      activePersonaId: 'x',
    });
    expect(prompts[0]).toContain('configuração corrente');
  });
});
