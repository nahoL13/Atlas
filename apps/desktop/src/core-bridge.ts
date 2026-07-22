import { createAtlas } from '@atlas/core';
import type { ActionRequest, AtlasConfigOverride } from '@atlas/contracts';
import { formatSteps } from './steps-view.js';
import type { StepLine } from './steps-view.js';

export interface StatusSnapshot {
  readonly state: string;
  readonly logLevel: string;
  readonly dataDir: string;
  readonly persona: { readonly id: string; readonly name: string };
  readonly readRoots: readonly string[];
  readonly writeRoots: readonly string[];
}

/**
 * Round-trip mínimo com o Core (análogo ao `runStatus` da CLI): sobe a
 * plataforma via `createAtlas`, lê `state`/`config`/`persona`, desliga e
 * devolve um objeto plano serializável por IPC. Não mantém a plataforma
 * viva entre chamadas nesta fatia.
 */
export async function resolveStatusSnapshot(
  configOverride: AtlasConfigOverride = {},
): Promise<StatusSnapshot> {
  const atlas = await createAtlas({ config: configOverride });
  try {
    const { state, config, persona } = atlas;
    return {
      state,
      logLevel: config.logLevel,
      dataDir: config.dataDir,
      persona: { id: persona.id, name: persona.name },
      readRoots: [...config.permissions.readRoots],
      writeRoots: [...config.permissions.writeRoots],
    };
  } finally {
    await atlas.shutdown();
  }
}

/**
 * `ConfirmPort` interno ao `@atlas/runtime`, satisfeito estruturalmente
 * (mesmo padrão da CLI): declarado localmente, sem importar `@atlas/runtime`.
 */
export interface ConfirmPort {
  request(action: ActionRequest): Promise<boolean>;
}

export interface AskSnapshot {
  readonly text: string;
  readonly steps: readonly StepLine[];
  readonly learned: readonly string[];
}

/** Default fail-closed: sem `confirm` injetado, nenhuma ação destrutiva é aprovada silenciosamente. */
const fallbackConfirm: ConfirmPort = {
  request: () => Promise.resolve(false),
};

/**
 * Round-trip stateless com o Core (espelho de `resolveStatusSnapshot` e do
 * `runAsk` da CLI): sobe a plataforma via `createAtlas` injetando o
 * `ConfirmPort` recebido, chama `atlas.cognitive.ask`, grava os fatos
 * aprendidos (`atlas.memory.remember(fact, 'learned')`, paridade com
 * `runAsk` — nunca gravação silenciosa), desliga (`finally`) e devolve um
 * `AskSnapshot` plano serializável por IPC. Não mantém a plataforma nem uma
 * `Conversation` viva entre chamadas (isso é 2.2).
 */
export async function resolveAskSnapshot(
  objective: string,
  deps: { confirm?: ConfirmPort; configOverride?: AtlasConfigOverride } = {},
): Promise<AskSnapshot> {
  const { confirm = fallbackConfirm, configOverride = {} } = deps;
  const atlas = await createAtlas({ config: configOverride }, { confirm });
  try {
    const result = await atlas.cognitive.ask(objective);
    const learned: string[] = [];
    for (const fact of result.learned ?? []) {
      const { created } = await atlas.memory.remember(fact, 'learned');
      if (created) {
        learned.push(fact);
      }
    }
    return {
      text: result.text,
      steps: formatSteps(result.steps),
      learned,
    };
  } finally {
    await atlas.shutdown();
  }
}
