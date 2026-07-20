/**
 * Teto fixo embutido de candidatos de aprendizado por turno (SPEC-0020/
 * ADR-0016): guardrail contra modelo tagarela. Não configurável por
 * flag/env nesta fatia.
 */
const CANDIDATE_LIMIT = 3;

export interface Learner {
  instruction(knownFacts?: string): string;
  parse(modelOutput: string): readonly string[];
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  return text.slice(start, end + 1);
}

/**
 * Learner puro (Etapa 6 do Cognitive Lifecycle, ADR-0016), no molde de
 * `createPlanner()`/`observe()`: sem gateway, sem IO, testável isolado.
 * `instruction()` ancora o framing no Artigo 13 da Constituição — o modelo
 * só pode extrair fatos que o usuário afirmou ou fortemente implicou, nunca
 * fatos inferidos/inventados. `parse` devolve 0..N textos (teto embutido de
 * `CANDIDATE_LIMIT`); saída inválida, vazia ou não-JSON devolve lista
 * vazia — nunca lança.
 *
 * `instruction(knownFacts?)` (SPEC-0021): quando o chamador passa os fatos já
 * conhecidos (o `memoryPrompt` amostrado do turno), a instrução passa a
 * listá-los e pede explicitamente para NÃO os re-propor — supressão da
 * duplicação intra-sessão **por instrução ao modelo**, sem garantia
 * determinística (não é deduplicação programática). O Artigo 13
 * (só o afirmado/implicado, nunca o inventado) permanece intacto.
 */
export function createLearner(): Learner {
  return {
    instruction(knownFacts?: string): string {
      const lines = [
        'Analise o turno de conversa acima (o que o usuário disse e a resposta dada) e decida ' +
          'se há fatos ou preferências do usuário que valham ser preservados para conversas futuras.',
        'Extraia APENAS fatos que o usuário afirmou explicitamente ou fortemente implicou. ' +
          'NUNCA infira, deduza ou invente fatos que o usuário não disse — não assuma fatos ' +
          'inexistentes.',
        'Se não houver nada que valha preservar, devolva uma lista vazia.',
      ];
      if (knownFacts !== undefined && knownFacts !== '') {
        lines.push(
          `Fatos já conhecidos e preservados sobre o usuário:\n${knownFacts}`,
          'NÃO reproponha fatos que já estejam nessa lista de fatos conhecidos — extraia só o que ' +
            'ainda não está preservado.',
        );
      }
      lines.push(
        'Responda APENAS com um array JSON de strings, sem nenhum texto ao redor, no formato:',
        '["fato 1", "fato 2"]',
        'Ou, se nada valer preservar: []',
      );
      return lines.join('\n');
    },

    parse(modelOutput: string): readonly string[] {
      const json = extractJsonArray(modelOutput);
      if (json === null) {
        return [];
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return [];
      }
      if (!Array.isArray(parsed)) {
        return [];
      }
      const facts = parsed.filter(
        (item): item is string => typeof item === 'string' && item.trim() !== '',
      );
      return facts.slice(0, CANDIDATE_LIMIT);
    },
  };
}
