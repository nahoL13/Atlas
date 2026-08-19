/**
 * Acumulador de consumo de tokens por sessão — SPEC-0054, consumindo o
 * ADR-0025(c). Módulo puro: sem IO, sem `Date`, sem persistência, sem
 * `electron`. É o dono da acumulação em `apps/desktop` (o Cognitive Core só
 * devolve o `usage` de cada turno, como dado — quem soma é aqui).
 */

import type { TokenUsage } from '@atlas/contracts';

export interface TokenUsageSnapshot {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly reportedTurns: number;
  readonly unreportedTurns: number;
}

export interface TokenUsageAccumulator {
  add(usage: TokenUsage | undefined): void;
  snapshot(): TokenUsageSnapshot;
  reset(): void;
}

function isValidTokenCount(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function createTokenUsageAccumulator(): TokenUsageAccumulator {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let reportedTurns = 0;
  let unreportedTurns = 0;

  return {
    add(usage: TokenUsage | undefined): void {
      const prompt = usage?.promptTokens;
      const completion = usage?.completionTokens;
      const total = usage?.totalTokens;
      const validPrompt = isValidTokenCount(prompt) ? Math.round(prompt) : undefined;
      const validCompletion = isValidTokenCount(completion) ? Math.round(completion) : undefined;
      const validTotal = isValidTokenCount(total) ? Math.round(total) : undefined;

      if (validPrompt === undefined && validCompletion === undefined && validTotal === undefined) {
        unreportedTurns += 1;
        return;
      }

      reportedTurns += 1;
      promptTokens += validPrompt ?? 0;
      completionTokens += validCompletion ?? 0;
      // Derivação exclusiva deste módulo (SPEC-0054, Escopo 5): quando o
      // turno não reporta `totalTokens`, soma `prompt + completion` DAQUELE
      // turno — nunca no Cognitive Core.
      totalTokens += validTotal ?? (validPrompt ?? 0) + (validCompletion ?? 0);
    },

    snapshot(): TokenUsageSnapshot {
      return { promptTokens, completionTokens, totalTokens, reportedTurns, unreportedTurns };
    },

    reset(): void {
      promptTokens = 0;
      completionTokens = 0;
      totalTokens = 0;
      reportedTurns = 0;
      unreportedTurns = 0;
    },
  };
}
