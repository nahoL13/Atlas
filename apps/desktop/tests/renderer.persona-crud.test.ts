import { afterEach, describe, expect, it } from 'vitest';
import type { RendererFixture, RendererFixtureOptions } from './helpers/renderer-harness.js';
import { loadRenderer } from './helpers/renderer-harness.js';

// SPEC-0047, Frente 2: cobertura comportamental do painel de CRUD de
// Persona pelo formulário, sobre o harness jsdom da SPEC-0045. Foco no
// invariante que o projeto já quebrou na prática (Motivação/SPEC-0043): em
// recusa, o estado visível volta do estado real e nada é perdido em
// silêncio.

let fixture: RendererFixture | undefined;

afterEach(() => {
  fixture?.close();
  fixture = undefined;
});

async function open(options?: RendererFixtureOptions): Promise<RendererFixture> {
  fixture = await loadRenderer(options);
  await fixture.flush();
  return fixture;
}

function el(f: RendererFixture, id: string): { value: string; hidden: boolean } {
  return f.document.getElementById(id) as unknown as { value: string; hidden: boolean };
}

function setValue(f: RendererFixture, id: string, value: string): void {
  el(f, id).value = value;
}

function getValue(f: RendererFixture, id: string): string {
  return el(f, id).value;
}

function click(f: RendererFixture, id: string): void {
  (f.document.getElementById(id) as unknown as { click(): void }).click();
}

function transcriptText(f: RendererFixture): string {
  return f.document.getElementById('chat-transcript')?.textContent ?? '';
}

function formErrorText(f: RendererFixture): string {
  return f.document.getElementById('persona-form-error')?.textContent ?? '';
}

async function submitPersonaForm(f: RendererFixture): Promise<void> {
  f.document
    .getElementById('persona-form')
    ?.dispatchEvent(new f.window.Event('submit', { bubbles: true, cancelable: true }));
  await f.flush();
}

interface PersonaFieldValues {
  readonly name: string;
  readonly tone: string;
  readonly formality: string;
  readonly language: string;
  readonly style: string;
  readonly communicationRulesRaw: string;
  readonly voice: string;
  readonly emotion: string;
}

const SAMPLE_FIELDS: PersonaFieldValues = {
  name: 'Nova Persona',
  tone: 'Alegre',
  formality: 'Informal',
  language: 'pt-BR',
  style: 'Direto',
  communicationRulesRaw: '  \nRegra 1\n\n  Regra 2  \n   ',
  voice: 'Voz suave',
  emotion: 'Feliz',
};

function fillPersonaFields(f: RendererFixture, values: PersonaFieldValues): void {
  setValue(f, 'persona-name', values.name);
  setValue(f, 'persona-tone', values.tone);
  setValue(f, 'persona-formality', values.formality);
  setValue(f, 'persona-language', values.language);
  setValue(f, 'persona-style', values.style);
  setValue(f, 'persona-communication-rules', values.communicationRulesRaw);
  setValue(f, 'persona-voice', values.voice);
  setValue(f, 'persona-emotion', values.emotion);
}

function findListButton(
  f: RendererFixture,
  personaId: string,
  label: 'Editar' | 'Apagar',
): { click(): void } {
  const items = [...f.document.querySelectorAll('#persona-list li')] as unknown as HTMLLIElement[];
  for (const item of items) {
    if (item.textContent?.includes(`(${personaId})`) === true) {
      const buttons = [...item.querySelectorAll('button')] as unknown as Array<{
        textContent: string | null;
        click(): void;
      }>;
      const found = buttons.find((b) => b.textContent === label);
      if (found !== undefined) {
        return found;
      }
    }
  }
  throw new Error(`botão "${label}" não encontrado para a Persona ${personaId}`);
}

describe('CRUD de Persona pelo formulário — criar', () => {
  it('#persona-new abre o formulário; submeter chama persona.create exatamente uma vez com o input montado dos campos (communicationRules quebrada por linha, linhas vazias descartadas, voiceURI ausente com o <select> na opção vazia); formulário fecha; superfícies recarregam', async () => {
    let personaListCalls = 0;
    const f = await open({
      personas: [{ id: 'jarvis', name: 'Jarvis', builtin: true }],
      atlas: {
        persona: {
          list: () => {
            personaListCalls += 1;
            return Promise.resolve([{ id: 'jarvis', name: 'Jarvis', builtin: true }]);
          },
        },
      },
    });
    const callsBefore = personaListCalls;

    click(f, 'persona-new');
    expect(el(f, 'persona-form').hidden).toBe(false);

    fillPersonaFields(f, SAMPLE_FIELDS);
    await submitPersonaForm(f);

    expect(f.calls.personaCreate.length).toBe(1);
    expect(f.calls.personaUpdate.length).toBe(0);
    expect(f.calls.personaCreate[0]).toEqual({
      name: SAMPLE_FIELDS.name,
      tone: SAMPLE_FIELDS.tone,
      formality: SAMPLE_FIELDS.formality,
      language: SAMPLE_FIELDS.language,
      style: SAMPLE_FIELDS.style,
      communicationRules: ['Regra 1', 'Regra 2'],
      voice: SAMPLE_FIELDS.voice,
      emotion: SAMPLE_FIELDS.emotion,
    });

    expect(el(f, 'persona-form').hidden).toBe(true);
    // Recarga das superfícies: persona.list() é consumido por
    // loadPersonaOptions() E loadPersonaList() dentro de refreshPersonaSurfaces().
    expect(personaListCalls).toBeGreaterThan(callsBefore);
  });

  it('voiceURI presente quando o <select> de voz tem uma opção não vazia selecionada', async () => {
    const f = await open({
      personas: [{ id: 'jarvis', name: 'Jarvis', builtin: true }],
      osVoices: [{ voiceURI: 'local-1', name: 'Local Um', localService: true }],
    });

    click(f, 'persona-new');
    fillPersonaFields(f, SAMPLE_FIELDS);
    setValue(f, 'persona-voice-uri', 'local-1');
    await submitPersonaForm(f);

    expect(f.calls.personaCreate.length).toBe(1);
    expect((f.calls.personaCreate[0] as { voiceURI?: string }).voiceURI).toBe('local-1');
  });
});

describe('CRUD de Persona pelo formulário — editar', () => {
  it('clicar "Editar" numa Persona custom chama persona.describe e preenche os campos; submeter chama update com o id correto (e não create)', async () => {
    const f = await open({
      personas: [
        { id: 'jarvis', name: 'Jarvis', builtin: true },
        { id: 'custom-1', name: 'Custom Um', builtin: false },
      ],
      atlas: {
        persona: {
          describe: (id: string) =>
            Promise.resolve({
              id,
              name: 'Custom Um',
              builtin: false,
              tone: 'Sério',
              formality: 'Formal',
              language: 'pt-BR',
              style: 'Conciso',
              communicationRules: ['Regra existente'],
              voice: 'Voz grave',
              emotion: 'Neutro',
            }),
        },
      },
    });

    findListButton(f, 'custom-1', 'Editar').click();
    await f.flush();

    expect(el(f, 'persona-form').hidden).toBe(false);
    expect(getValue(f, 'persona-form-id')).toBe('custom-1');
    expect(getValue(f, 'persona-name')).toBe('Custom Um');
    expect(getValue(f, 'persona-tone')).toBe('Sério');
    expect(getValue(f, 'persona-communication-rules')).toBe('Regra existente');

    await submitPersonaForm(f);

    expect(f.calls.personaCreate.length).toBe(0);
    expect(f.calls.personaUpdate.length).toBe(1);
    expect(f.calls.personaUpdate[0]?.id).toBe('custom-1');
  });

  it('update da Persona ativa (closedSessions não vazio): limpa o transcript, escreve o aviso de nova conversa e abre uma nova sessão', async () => {
    let chatOpenCalls = 0;
    const f = await open({
      personas: [{ id: 'custom-1', name: 'Custom Um', builtin: false }],
      atlas: {
        chat: {
          open: () => {
            chatOpenCalls += 1;
            return Promise.resolve(`session-${chatOpenCalls}`);
          },
        },
        persona: {
          describe: (id: string) =>
            Promise.resolve({
              id,
              name: 'Custom Um',
              builtin: false,
              tone: '',
              formality: '',
              language: '',
              style: '',
              communicationRules: [],
              voice: '',
              emotion: '',
            }),
          update: () =>
            Promise.resolve({
              persona: {
                id: 'custom-1',
                name: 'Custom Um',
                builtin: false,
                tone: '',
                formality: '',
                language: '',
                style: '',
                communicationRules: [],
                voice: '',
                emotion: '',
              },
              closedSessions: ['session-1'],
            }),
        },
      },
    });
    const chatOpenCallsBeforeSubmit = chatOpenCalls;
    expect(transcriptText(f)).toContain('(sessão de chat aberta)');

    findListButton(f, 'custom-1', 'Editar').click();
    await f.flush();
    await submitPersonaForm(f);

    expect(transcriptText(f)).not.toContain('(sessão de chat aberta)');
    expect(transcriptText(f)).toContain('Persona atualizada — nova conversa iniciada');
    expect(chatOpenCalls).toBe(chatOpenCallsBeforeSubmit + 1);
  });
});

describe('CRUD de Persona pelo formulário — apagar', () => {
  it('clicar "Apagar" chama persona.delete com o id; recusa escreve o aviso e recarrega as listas (a Persona recusada continua listada)', async () => {
    const f = await open({
      personas: [
        { id: 'jarvis', name: 'Jarvis', builtin: true },
        { id: 'custom-1', name: 'Custom Um', builtin: false },
      ],
      atlas: {
        persona: {
          delete: (id: string) => {
            f.calls.personaDelete.push(id);
            return Promise.reject(new Error('Persona ativa não pode ser apagada'));
          },
        },
      },
    });

    findListButton(f, 'custom-1', 'Apagar').click();
    await f.flush();

    expect(f.calls.personaDelete).toEqual(['custom-1']);
    expect(formErrorText(f)).toContain('⚠️');
    // Listas recarregadas do estado real: a Persona recusada continua lá.
    const items = [...f.document.querySelectorAll('#persona-list li')];
    expect(items.length).toBe(2);
    expect(items.some((item) => item.textContent?.includes('(custom-1)') === true)).toBe(true);
  });
});

describe('CRUD de Persona pelo formulário — recusa no submit', () => {
  it('create rejeitando escreve ⚠️ em #persona-form-error, não limpa o transcript, não abre sessão nova, e recarrega as superfícies', async () => {
    let chatOpenCalls = 0;
    const f = await open({
      personas: [{ id: 'jarvis', name: 'Jarvis', builtin: true }],
      atlas: {
        chat: {
          open: () => {
            chatOpenCalls += 1;
            return Promise.resolve('session-1');
          },
        },
        persona: {
          create: (input: unknown) => {
            f.calls.personaCreate.push(input);
            return Promise.reject(new Error('nome inválido'));
          },
        },
      },
    });
    const chatOpenCallsAfterLoad = chatOpenCalls;
    const transcriptBefore = transcriptText(f);

    click(f, 'persona-new');
    fillPersonaFields(f, SAMPLE_FIELDS);
    await submitPersonaForm(f);

    expect(formErrorText(f)).toContain('⚠️');
    expect(transcriptText(f)).toBe(transcriptBefore);
    expect(chatOpenCalls).toBe(chatOpenCallsAfterLoad);
  });

  it('update rejeitando escreve ⚠️ em #persona-form-error, não limpa o transcript, não abre sessão nova, e recarrega as superfícies', async () => {
    let chatOpenCalls = 0;
    const f = await open({
      personas: [{ id: 'custom-1', name: 'Custom Um', builtin: false }],
      atlas: {
        chat: {
          open: () => {
            chatOpenCalls += 1;
            return Promise.resolve('session-1');
          },
        },
        persona: {
          describe: (id: string) =>
            Promise.resolve({
              id,
              name: 'Custom Um',
              builtin: false,
              tone: '',
              formality: '',
              language: '',
              style: '',
              communicationRules: [],
              voice: '',
              emotion: '',
            }),
          update: (id: string, input: unknown) => {
            f.calls.personaUpdate.push({ id, input });
            return Promise.reject(new Error('conflito de edição'));
          },
        },
      },
    });
    const chatOpenCallsAfterLoad = chatOpenCalls;
    const transcriptBefore = transcriptText(f);

    findListButton(f, 'custom-1', 'Editar').click();
    await f.flush();
    await submitPersonaForm(f);

    expect(formErrorText(f)).toContain('⚠️');
    expect(transcriptText(f)).toBe(transcriptBefore);
    expect(chatOpenCalls).toBe(chatOpenCallsAfterLoad);
  });
});

describe('CRUD de Persona pelo formulário — Persona embutida', () => {
  it('item de Persona builtin em #persona-list não oferece botões "Editar"/"Apagar"', async () => {
    const f = await open({
      personas: [{ id: 'jarvis', name: 'Jarvis', builtin: true }],
    });

    const items = [
      ...f.document.querySelectorAll('#persona-list li'),
    ] as unknown as HTMLLIElement[];
    expect(items.length).toBe(1);
    const buttons = items[0]?.querySelectorAll('button') ?? [];
    expect(buttons.length).toBe(0);
  });
});
