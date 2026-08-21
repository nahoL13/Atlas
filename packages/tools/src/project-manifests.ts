/**
 * Tabela pura de manifests reconhecidos (SPEC-0056/D5): lookup determinístico
 * por nome exato de arquivo, sem glob, sem heurística, sem recursão — a
 * decisão "que ecossistema é este" fica com o modelo, na composição da
 * resposta (mesma postura de SPEC-0028/D6 para o texto cru do git).
 */
export interface ProjectManifest {
  readonly file: string;
  readonly ecosystem: string;
}

export const PROJECT_MANIFESTS: readonly ProjectManifest[] = [
  { file: 'package.json', ecosystem: 'Node.js' },
  { file: 'pnpm-workspace.yaml', ecosystem: 'Node.js' },
  { file: 'tsconfig.json', ecosystem: 'TypeScript' },
  { file: 'deno.json', ecosystem: 'Deno' },
  { file: 'deno.jsonc', ecosystem: 'Deno' },
  { file: 'pyproject.toml', ecosystem: 'Python' },
  { file: 'requirements.txt', ecosystem: 'Python' },
  { file: 'setup.py', ecosystem: 'Python' },
  { file: 'Cargo.toml', ecosystem: 'Rust' },
  { file: 'go.mod', ecosystem: 'Go' },
  { file: 'pom.xml', ecosystem: 'Java/JVM' },
  { file: 'build.gradle', ecosystem: 'Java/JVM' },
  { file: 'build.gradle.kts', ecosystem: 'Java/JVM' },
  { file: 'Gemfile', ecosystem: 'Ruby' },
  { file: 'composer.json', ecosystem: 'PHP' },
  { file: 'CMakeLists.txt', ecosystem: 'C/C++' },
];

/** Teto de nomes de script devolvidos por `extractPackageScripts` (D6/A3). */
export const PROJECT_SCRIPT_LIMIT = 50;

/**
 * Interseção entre `entries` (listagem de um diretório) e `PROJECT_MANIFESTS`
 * — devolvida na **ordem da tabela**, não na ordem de `entries`. Casamento
 * sensível a maiúsculas/minúsculas (nome exato).
 */
export function selectManifests(entries: readonly string[]): readonly ProjectManifest[] {
  const present = new Set(entries);
  return PROJECT_MANIFESTS.filter((manifest) => present.has(manifest.file));
}

/** Ecossistemas distintos dos manifests dados, deduplicados na ordem da tabela. */
export function listEcosystems(manifests: readonly ProjectManifest[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const manifest of manifests) {
    if (!seen.has(manifest.ecosystem)) {
      seen.add(manifest.ecosystem);
      result.push(manifest.ecosystem);
    }
  }
  return result;
}

export type ExtractScriptsResult =
  | {
      readonly ok: true;
      readonly scripts: readonly string[];
      readonly truncated: boolean;
      readonly total: number;
    }
  | { readonly ok: false; readonly error: string };

/**
 * Extrai os nomes das chaves de `scripts` de um `package.json` cru — pura,
 * nunca lança. JSON inválido, chave ausente ou `scripts` de tipo inesperado
 * (não-objeto, array, `null`) devolvem `ok:false` com o motivo. No máximo
 * `PROJECT_SCRIPT_LIMIT` nomes **reais**; a truncagem é sinalizada fora da
 * lista, por `truncated`/`total` — nunca um marcador dentro de `scripts`.
 */
export function extractPackageScripts(text: string): ExtractScriptsResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSON inválido' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'conteúdo não é um objeto JSON' };
  }

  const scripts = (parsed as Record<string, unknown>).scripts;
  if (typeof scripts !== 'object' || scripts === null || Array.isArray(scripts)) {
    return { ok: false, error: 'chave "scripts" ausente ou não é um objeto' };
  }

  const names = Object.keys(scripts);
  const total = names.length;
  const truncated = total > PROJECT_SCRIPT_LIMIT;
  return {
    ok: true,
    scripts: truncated ? names.slice(0, PROJECT_SCRIPT_LIMIT) : names,
    truncated,
    total,
  };
}
