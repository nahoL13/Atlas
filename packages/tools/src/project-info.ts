import { join } from 'node:path';
import type { ActionRequest, Tool } from '@atlas/contracts';
import type { FsReadPort } from './fs-port.js';
import { nodeFsReadPort } from './fs-port.js';
import { GitRootError, nodeGitReadPort, type GitReadPort } from './git-port.js';
import { resolveTargetDirectory } from './target-dir.js';
import {
  extractPackageScripts,
  listEcosystems,
  selectManifests,
  PROJECT_SCRIPT_LIMIT,
} from './project-manifests.js';

export interface ProjectInfoDeps {
  fs?: FsReadPort;
  git?: GitReadPort;
  cwd?: () => string;
}

/**
 * Conjunto fechado de cinco strings literais para `origem da raiz` (D12) —
 * nunca interpola caminho descoberto nem mensagem/stderr de subprocesso.
 */
const ORIGIN_GIT_REPOSITORY = 'repositório git';
const ORIGIN_EXPLICIT_PATH = 'diretório informado';
const ORIGIN_NO_REPOSITORY = 'diretório alvo (sem repositório git)';
const ORIGIN_DENIED = 'diretório alvo (repositório fora do diretório permitido)';
const ORIGIN_RESOLVE_FAILED = 'diretório alvo (falha ao resolver o repositório)';

/** Classifica a falha de `git.toplevel` pelo `reason` de `GitRootError` — nunca por mensagem. */
function degradedOrigin(cause: unknown): string {
  if (cause instanceof GitRootError) {
    switch (cause.reason) {
      case 'no-repository':
        return ORIGIN_NO_REPOSITORY;
      case 'denied':
        return ORIGIN_DENIED;
      case 'resolve-failed':
        return ORIGIN_RESOLVE_FAILED;
    }
  }
  // Fallback exaustivo (D12): qualquer erro não classificado degrada com o
  // mesmo motivo genérico de "falha ao resolver", nunca a mensagem crua.
  return ORIGIN_RESOLVE_FAILED;
}

const DESCRIPTION =
  'Descreve a estrutura de um projeto de software: raiz efetiva, manifests reconhecidos ' +
  '(package.json, tsconfig.json, Cargo.toml...), ecossistemas observados e scripts declarados ' +
  'no package.json, quando houver. Recebe { path? }. Somente-leitura, olha só a raiz (sem ' +
  'recursão). Omitir "path" para descrever o projeto do diretório atual — a raiz sobe ' +
  'automaticamente até o repositório git; informar "path" para descrever exatamente aquele ' +
  'diretório, sem ascensão (use para inspecionar um subpacote de monorepo).';

export function createProjectInfoTool(deps: ProjectInfoDeps = {}): Tool {
  const fs = deps.fs ?? nodeFsReadPort();
  const git = deps.git ?? nodeGitReadPort();
  const cwd = deps.cwd ?? (() => process.cwd());

  return {
    name: 'project_info',
    description: DESCRIPTION,
    requirements(args: Record<string, unknown>): ActionRequest {
      const resolution = resolveTargetDirectory(args, cwd);
      const path = resolution.ok ? resolution.target : '';
      return { resource: { type: 'directory', path }, access: 'read' };
    },
    async run(args: Record<string, unknown>) {
      const resolution = resolveTargetDirectory(args, cwd);
      if (!resolution.ok) {
        return { ok: false, error: `project_info: ${resolution.error}` };
      }
      const target = resolution.target;
      const pathOmitted = args.path === undefined;

      let root: string;
      let origin: string;
      if (pathOmitted) {
        try {
          root = await git.toplevel(target);
          origin = ORIGIN_GIT_REPOSITORY;
        } catch (cause) {
          root = target;
          origin = degradedOrigin(cause);
        }
      } else {
        root = target;
        origin = ORIGIN_EXPLICIT_PATH;
      }

      let entries: readonly string[];
      try {
        entries = await fs.readdir(root);
      } catch (cause) {
        return {
          ok: false,
          error: `project_info: falha ao listar ${root}: ${(cause as Error).message}`,
        };
      }

      const manifests = selectManifests(entries);
      const ecosystems = listEcosystems(manifests);
      const hasPackageJson = manifests.some((manifest) => manifest.file === 'package.json');

      const lines: string[] = [`raiz: ${root}`, `origem da raiz: ${origin}`];

      if (manifests.length === 0) {
        lines.push('manifests: (nenhum manifest reconhecido na raiz)');
      } else {
        lines.push('manifests:');
        for (const manifest of manifests) {
          lines.push(`- ${manifest.file} (${manifest.ecosystem})`);
        }
        lines.push(`ecossistemas: ${ecosystems.join(', ')}`);
      }

      if (hasPackageJson) {
        let motive: string | undefined;
        let scripts: readonly string[] = [];
        let truncationLine: string | undefined;
        try {
          const text = await fs.readFile(join(root, 'package.json'));
          const extracted = extractPackageScripts(text);
          if (extracted.ok) {
            scripts = extracted.scripts;
            if (extracted.truncated) {
              truncationLine = `(lista truncada: ${PROJECT_SCRIPT_LIMIT} de ${extracted.total} scripts)`;
            }
          } else {
            motive = extracted.error;
          }
        } catch (cause) {
          motive = (cause as Error).message;
        }

        if (motive !== undefined) {
          lines.push(`scripts (package.json): (não foi possível ler os scripts: ${motive})`);
        } else {
          lines.push('scripts (package.json):');
          for (const name of scripts) {
            lines.push(`- ${name}`);
          }
          if (truncationLine !== undefined) {
            lines.push(truncationLine);
          }
        }
      }

      return { ok: true, output: lines.join('\n') };
    },
  };
}
