import { AtlasError } from '@atlas/contracts';
import type { Persona, PersonaInput, PersonaService } from '@atlas/contracts';
import { PERSONA_IDS } from '@atlas/core';
import type { PersonaFieldPatch } from '../gateway/input-gateway.js';
import type { LineReader } from '../gateway/line-reader.js';
import type { OutputGateway } from '../gateway/output-gateway.js';

/**
 * "Embutida" é sempre **derivada** de `PERSONA_IDS` sobre os ids de
 * `PersonaService.list()` — `Persona` não tem campo `builtin`
 * (`packages/contracts/src/persona.ts`), mesmo mecanismo de
 * `apps/desktop/src/core-bridge.ts` (l. 76, 193-198). Nenhuma função deste
 * arquivo lê ou confia num campo `builtin` do objeto `Persona`.
 */
function marker(id: string): 'embutida' | 'custom' {
  return PERSONA_IDS.includes(id) ? 'embutida' : 'custom';
}

export function runPersonaList(personaService: PersonaService, output: OutputGateway): void {
  const lines = personaService.list().map((id) => {
    const persona = personaService.get(id);
    return `${id}  ${persona.name}  [${marker(id)}]`;
  });
  output.write(`${lines.join('\n')}\n`);
}

export function runPersonaShow(
  personaService: PersonaService,
  id: string,
  output: OutputGateway,
): void {
  const persona = personaService.get(id);
  const lines = [
    `id: ${persona.id}`,
    `tipo: ${marker(id)}`,
    `name: ${persona.name}`,
    `tone: ${persona.tone}`,
    `formality: ${persona.formality}`,
    `language: ${persona.language}`,
    `style: ${persona.style}`,
    `voice: ${persona.voice}`,
    `emotion: ${persona.emotion}`,
  ];
  if (persona.voiceURI !== undefined) {
    lines.push(`voiceURI: ${persona.voiceURI}`);
  }
  lines.push('communicationRules:');
  if (persona.communicationRules.length === 0) {
    lines.push('  (nenhuma)');
  } else {
    for (const rule of persona.communicationRules) {
      lines.push(`  - ${rule}`);
    }
  }
  output.write(`${lines.join('\n')}\n`);
}

export function runPersonaCreate(
  personaService: PersonaService,
  name: string,
  patch: PersonaFieldPatch,
  output: OutputGateway,
): void {
  const input: PersonaInput = {
    name,
    tone: patch.tone ?? '',
    formality: patch.formality ?? '',
    language: patch.language ?? '',
    style: patch.style ?? '',
    voice: patch.voice ?? '',
    emotion: patch.emotion ?? '',
    communicationRules: patch.communicationRules ?? [],
    ...(patch.voiceURI !== undefined ? { voiceURI: patch.voiceURI } : {}),
  };
  const persona = personaService.create(input);
  output.write(`Persona criada [${persona.id}]: ${persona.name}\n`);
}

/**
 * `''` em `--voice-uri` é a forma de **limpar** `voiceURI` (SPEC-0044/D4):
 * chave presente com valor vazio ⇒ omite a propriedade no `PersonaInput`
 * (equivalente a "sem voz vinculada"); chave ausente ⇒ preserva o
 * `voiceURI` atual, se houver.
 */
function resolveVoiceURI(patch: PersonaFieldPatch, current: Persona): string | undefined {
  if (Object.hasOwn(patch, 'voiceURI')) {
    return patch.voiceURI === '' ? undefined : patch.voiceURI;
  }
  return current.voiceURI;
}

export function runPersonaEdit(
  personaService: PersonaService,
  id: string,
  patch: PersonaFieldPatch,
  output: OutputGateway,
): void {
  const current = personaService.get(id);
  const voiceURI = resolveVoiceURI(patch, current);
  const input: PersonaInput = {
    name: patch.name ?? current.name,
    tone: patch.tone ?? current.tone,
    formality: patch.formality ?? current.formality,
    language: patch.language ?? current.language,
    style: patch.style ?? current.style,
    voice: patch.voice ?? current.voice,
    emotion: patch.emotion ?? current.emotion,
    communicationRules: patch.communicationRules ?? current.communicationRules,
    ...(voiceURI !== undefined ? { voiceURI } : {}),
  };
  const persona = personaService.update(id, input);
  output.write(`Persona atualizada [${persona.id}]: ${persona.name}\n`);
}

export interface RunPersonaDeleteDeps {
  readonly assumeYes: boolean;
  readonly lineReader?: LineReader;
  /** Valor CRU de `configOverride.persona`, só para o aviso do prompt (D6). */
  readonly activePersonaId?: string;
}

/**
 * Apaga uma Persona custom com consentimento explícito (SPEC-0044/D7),
 * fail-closed: sem leitor e sem `--yes`, EOF, ou resposta diferente de
 * "s"/"sim" não apagam nada. Ordem obrigatória: validar (existência +
 * imutabilidade das embutidas) → perguntar → efeito — o leitor nunca é
 * consultado para um id inexistente ou embutido.
 */
export async function runPersonaDelete(
  personaService: PersonaService,
  id: string,
  output: OutputGateway,
  deps: RunPersonaDeleteDeps,
): Promise<boolean> {
  const persona = personaService.get(id); // PersonaError se inexistente

  if (PERSONA_IDS.includes(id)) {
    throw new AtlasError('ATLAS_PERSONA', `Não é possível apagar uma Persona embutida: ${id}`);
  }

  if (!deps.assumeYes) {
    if (deps.lineReader === undefined) {
      output.write('Remoção cancelada; nada foi apagado.\n');
      return false;
    }
    const warning =
      deps.activePersonaId === id ? ' (esta é a Persona apontada pela configuração corrente)' : '';
    const answer = await deps.lineReader.next(
      `Apagar a Persona [${id}] ${persona.name}${warning}? [s/N] `,
    );
    const confirmed = answer !== null && /^s(im)?$/i.test(answer.trim());
    if (!confirmed) {
      output.write('Remoção cancelada; nada foi apagado.\n');
      return false;
    }
  }

  personaService.delete(id);
  output.write(`Persona apagada [${id}]: ${persona.name}\n`);
  return true;
}
