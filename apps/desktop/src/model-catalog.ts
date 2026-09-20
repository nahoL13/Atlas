/**
 * Catálogo curado e fixo de modelos Ollama instaláveis pelo desktop
 * (SPEC-0063, ADR-0029(e)) — dado local ao app, sem IO, sem rede, sem
 * `electron`. `llama3.2` é o único `recommended: true`, por ser o modelo de
 * `defaultConfig().model.model` (`packages/core/src/config/defaults.ts`) —
 * a coincidência é amarrada por CA em `tests/model-catalog.test.ts`.
 *
 * Tamanhos aproximados e declarados, nunca medidos em runtime; atualizar a
 * tabela é mudança de dado revisável por PR (ADR-0029(e)).
 */

export interface CatalogModel {
  /** Referência técnica do Ollama (usada como valor de `pullOllamaModel`). */
  readonly name: string;
  /** String pinada, nunca calculada. */
  readonly sizeLabel: string;
  /** Descrição em português, uma frase. */
  readonly description: string;
  readonly recommended: boolean;
}

/** Ordem pinada (SPEC-0063, D12) — `llama3.2` primeiro e único `recommended: true`. */
export const MODEL_CATALOG: readonly CatalogModel[] = [
  {
    name: 'llama3.2',
    sizeLabel: '≈ 2 GB',
    description: 'Modelo geral leve — é o modelo que o Atlas usa por padrão.',
    recommended: true,
  },
  {
    name: 'llama3.1:8b',
    sizeLabel: '≈ 4,9 GB',
    description: 'Modelo geral mais capaz; peça 16 GB de memória ou mais.',
    recommended: false,
  },
  {
    name: 'qwen2.5:7b',
    sizeLabel: '≈ 4,7 GB',
    description: 'Bom equilíbrio entre português e raciocínio.',
    recommended: false,
  },
  {
    name: 'qwen2.5-coder:7b',
    sizeLabel: '≈ 4,7 GB',
    description: 'Especializado em programação e leitura de código.',
    recommended: false,
  },
  {
    name: 'gemma2:2b',
    sizeLabel: '≈ 1,6 GB',
    description: 'A menor opção — para máquinas com pouca memória.',
    recommended: false,
  },
];

/**
 * Normaliza a tag implícita `:latest` (SPEC-0063, D13): um nome sem `:` é
 * comparado como `<nome>:latest`; igualdade exata depois disso — sem
 * `toLowerCase`, sem correspondência parcial (evita casar `llama3.2` com
 * `llama3.2-vision`).
 */
function withImplicitTag(name: string): string {
  return name.includes(':') ? name : `${name}:latest`;
}

/**
 * Aceita `'llama3.2'` e `'llama3.2:latest'` como a mesma entrada do
 * catálogo, pela mesma normalização de `isInstalledModel`.
 */
export function findCatalogModel(name: string): CatalogModel | undefined {
  const normalized = withImplicitTag(name);
  return MODEL_CATALOG.find((entry) => withImplicitTag(entry.name) === normalized);
}

/**
 * `true` sse `name` (normalizado) está entre os `installed` (também
 * normalizados) — igualdade exata após normalização, nunca prefixo.
 */
export function isInstalledModel(name: string, installed: readonly string[]): boolean {
  const normalized = withImplicitTag(name);
  return installed.some((candidate) => withImplicitTag(candidate) === normalized);
}
