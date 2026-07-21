import type { Skill } from '@atlas/contracts';

/**
 * Skill(s) permanente(s) embutida(s) — dado inerte que semeia o Registry
 * para o catálogo não nascer vazio (ADR-0017). Ids fora do namespace
 * reservado a temporárias (`tmp-`) usado pelo Skill Builder. Referencia
 * `toolIds` como dado; não é executada nesta fatia.
 */
export const BUILTIN_SKILLS: readonly Skill[] = [
  {
    id: 'skill-summarize-text',
    name: 'Resumir texto',
    description: 'Produz um resumo conciso de um texto ou arquivo de texto fornecido.',
    instructions:
      'Ao resumir um texto: preserve os pontos principais, seja conciso, não invente ' +
      'informação que não esteja no texto original.',
    toolIds: ['read_file'],
    scope: 'permanent',
    version: '1.0.0',
  },
];
