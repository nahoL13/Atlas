import { describe, expect, it } from 'vitest';
import type { ActionRequest } from '@atlas/contracts';
import { createPermissionService } from '../src/index.js';
import type { PathResolverPort } from '../src/path-resolver-port.js';

interface FakeResolverConfig {
  /** path -> realpath, só para paths que "existem" no fake disco. */
  readonly real?: Readonly<Record<string, string>>;
  /** path -> código de erro != ENOENT, simula falha inesperada (ex.: EACCES). */
  readonly errors?: Readonly<Record<string, string>>;
}

function makeErrnoException(code: string): NodeJS.ErrnoException {
  const error = new Error(`fake ${code}`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

/** PathResolverPort fake e determinístico, sem disco real; registra chamadas. */
function createFakeResolver(config: FakeResolverConfig): {
  resolver: PathResolverPort;
  calls: string[];
} {
  const calls: string[] = [];
  const resolver: PathResolverPort = {
    realpathSync(path: string): string {
      calls.push(path);
      const errorCode = config.errors?.[path];
      if (errorCode) throw makeErrnoException(errorCode);
      const real = config.real?.[path];
      if (real !== undefined) return real;
      throw makeErrnoException('ENOENT');
    },
  };
  return { resolver, calls };
}

const read = (path: string, type: 'file' | 'directory' = 'file'): ActionRequest => ({
  resource: { type, path },
  access: 'read',
});

const write = (path: string): ActionRequest => ({
  resource: { type: 'file', path },
  access: 'write',
});

const del = (path: string): ActionRequest => ({
  resource: { type: 'file', path },
  access: 'delete',
});

describe('createPermissionService.evaluate — leitura', () => {
  it('permite leitura dentro de uma raiz permitida', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(read('/work/repo/src/index.ts'))).toEqual({ verdict: 'allowed' });
  });

  it('permite quando o path é a própria raiz (diretório)', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(read('/work/repo', 'directory')).verdict).toBe('allowed');
  });

  it('bloqueia leitura fora de toda raiz permitida', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    const decision = service.evaluate(read('/etc/passwd'));
    expect(decision.verdict).toBe('blocked');
    expect(decision.reason).toBeTypeOf('string');
  });

  it('bloqueia escape por .. que sai da raiz', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(read('/work/repo/../secret.txt')).verdict).toBe('blocked');
  });

  it('não confunde prefixo de nome (/work/repo-secret) com raiz /work/repo', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(read('/work/repo-secret/x')).verdict).toBe('blocked');
  });

  it('permite quando o path está em QUALQUER uma das raízes', () => {
    const service = createPermissionService({ readRoots: ['/a', '/b'], writeRoots: [] });
    expect(service.evaluate(read('/b/file')).verdict).toBe('allowed');
  });

  it('trata a raiz do sistema (/) sem duplicar o separador', () => {
    const service = createPermissionService({ readRoots: ['/'], writeRoots: [] });
    expect(service.evaluate(read('/etc/hosts')).verdict).toBe('allowed');
  });
});

describe('createPermissionService.evaluate — escrita', () => {
  it('permite escrita dentro de uma raiz de escrita permitida', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    expect(service.evaluate(write('/work/out/a.txt'))).toEqual({ verdict: 'allowed' });
  });

  it('bloqueia escrita fora de toda raiz de escrita', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    const decision = service.evaluate(write('/etc/passwd'));
    expect(decision.verdict).toBe('blocked');
    expect(decision.reason).toContain('escrita');
  });

  it('bloqueia escrita quando writeRoots está vazio (default seguro)', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(write('/work/repo/a.txt')).verdict).toBe('blocked');
  });

  it('não confunde prefixo de nome na escrita (/work/out-evil)', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    expect(service.evaluate(write('/work/out-evil/x')).verdict).toBe('blocked');
  });

  it('grants são independentes: raiz de leitura não concede escrita', () => {
    const service = createPermissionService({ readRoots: ['/shared'], writeRoots: [] });
    expect(service.evaluate(read('/shared/a.txt')).verdict).toBe('allowed');
    expect(service.evaluate(write('/shared/a.txt')).verdict).toBe('blocked');
  });
});

describe('createPermissionService.evaluate — delete', () => {
  it('produz confirm para delete dentro de uma raiz de escrita permitida', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    expect(service.evaluate(del('/work/out/a.txt'))).toEqual({ verdict: 'confirm' });
  });

  it('bloqueia delete fora de toda raiz de escrita', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    const decision = service.evaluate(del('/etc/passwd'));
    expect(decision.verdict).toBe('blocked');
    expect(decision.reason).toContain('escrita');
  });

  it('bloqueia delete quando writeRoots está vazio (default seguro)', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'], writeRoots: [] });
    expect(service.evaluate(del('/work/repo/a.txt')).verdict).toBe('blocked');
  });

  it('não confunde prefixo de nome no delete (/work/out-evil)', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    expect(service.evaluate(del('/work/out-evil/x')).verdict).toBe('blocked');
  });

  it('a mesma raiz produz veredictos distintos para write (allowed) e delete (confirm)', () => {
    const service = createPermissionService({ readRoots: [], writeRoots: ['/work/out'] });
    expect(service.evaluate(write('/work/out/a.txt')).verdict).toBe('allowed');
    expect(service.evaluate(del('/work/out/a.txt')).verdict).toBe('confirm');
  });
});

describe('createPermissionService — endurecimento de symlink (SPEC-0015)', () => {
  it('bloqueia quando o realpath de um symlink escapa da raiz (read/write/delete)', () => {
    const { resolver } = createFakeResolver({
      real: {
        '/work/repo': '/work/repo',
        '/work/repo/link': '/outside/secret',
        '/work/out': '/work/out',
        '/work/out/link': '/outside/secret',
      },
    });
    const readService = createPermissionService({
      readRoots: ['/work/repo'],
      writeRoots: [],
      pathResolver: resolver,
    });
    expect(readService.evaluate(read('/work/repo/link')).verdict).toBe('blocked');

    const writeService = createPermissionService({
      readRoots: [],
      writeRoots: ['/work/out'],
      pathResolver: resolver,
    });
    expect(writeService.evaluate(write('/work/out/link')).verdict).toBe('blocked');
    expect(writeService.evaluate(del('/work/out/link')).verdict).toBe('blocked');
  });

  it('autoriza como antes quando o realpath do symlink cai dentro da raiz', () => {
    const { resolver } = createFakeResolver({
      real: {
        '/work/repo': '/work/repo',
        '/work/repo/link': '/work/repo/actual/file.txt',
        '/work/out': '/work/out',
        '/work/out/link': '/work/out/actual/file.txt',
      },
    });
    const readService = createPermissionService({
      readRoots: ['/work/repo'],
      writeRoots: [],
      pathResolver: resolver,
    });
    expect(readService.evaluate(read('/work/repo/link')).verdict).toBe('allowed');

    const writeService = createPermissionService({
      readRoots: [],
      writeRoots: ['/work/out'],
      pathResolver: resolver,
    });
    expect(writeService.evaluate(write('/work/out/link')).verdict).toBe('allowed');
    expect(writeService.evaluate(del('/work/out/link')).verdict).toBe('confirm');
  });

  it('preserva "criar algo novo dentro de uma raiz válida": path inexistente com ancestral dentro da raiz', () => {
    const { resolver } = createFakeResolver({
      real: { '/work/out': '/work/out' },
    });
    const service = createPermissionService({
      readRoots: [],
      writeRoots: ['/work/out'],
      pathResolver: resolver,
    });
    expect(service.evaluate(write('/work/out/newdir/newfile.txt')).verdict).toBe('allowed');
    expect(service.evaluate(del('/work/out/newdir/newfile.txt')).verdict).toBe('confirm');
  });

  it('bloqueia path novo cujo ancestral existente mais profundo (symlink) resolve para fora da raiz', () => {
    const { resolver } = createFakeResolver({
      real: {
        '/work/out': '/work/out',
        '/work/out/link': '/outside',
      },
    });
    const service = createPermissionService({
      readRoots: [],
      writeRoots: ['/work/out'],
      pathResolver: resolver,
    });
    expect(service.evaluate(write('/work/out/link/newfile.txt')).verdict).toBe('blocked');
  });

  it('resolve corretamente uma raiz configurada que é (ou contém) um symlink, comparando contra o alvo resolvido', () => {
    const { resolver } = createFakeResolver({
      real: {
        '/work/out': '/real/out',
        '/work/out/a.txt': '/real/out/a.txt',
      },
    });
    const service = createPermissionService({
      readRoots: [],
      writeRoots: ['/work/out'],
      pathResolver: resolver,
    });
    expect(service.evaluate(write('/work/out/a.txt')).verdict).toBe('allowed');
  });

  it('resolve uma raiz configurada ainda inexistente pelo ancestral existente, sem lançar na criação', () => {
    const { resolver } = createFakeResolver({
      real: { '/work': '/work' },
    });
    expect(() =>
      createPermissionService({
        readRoots: [],
        writeRoots: ['/work/newroot'],
        pathResolver: resolver,
      }),
    ).not.toThrow();

    const service = createPermissionService({
      readRoots: [],
      writeRoots: ['/work/newroot'],
      pathResolver: resolver,
    });
    expect(service.evaluate(write('/work/newroot/file.txt')).verdict).toBe('allowed');
  });

  it('fail closed no alvo: erro != ENOENT ao resolver o path avaliado vira blocked, sem lançar', () => {
    const { resolver } = createFakeResolver({
      real: { '/work/out': '/work/out' },
      errors: { '/work/out/protected.txt': 'EACCES' },
    });
    const service = createPermissionService({
      readRoots: [],
      writeRoots: ['/work/out'],
      pathResolver: resolver,
    });
    let decision: ReturnType<typeof service.evaluate> | undefined;
    expect(() => {
      decision = service.evaluate(write('/work/out/protected.txt'));
    }).not.toThrow();
    expect(decision?.verdict).toBe('blocked');
  });

  it('fail closed na criação: raiz cuja resolução falha (!= ENOENT) não derruba o serviço nem as demais raízes', () => {
    const { resolver } = createFakeResolver({
      real: { '/work/good': '/work/good' },
      errors: { '/work/bad': 'EACCES' },
    });
    let service: ReturnType<typeof createPermissionService> | undefined;
    expect(() => {
      service = createPermissionService({
        readRoots: [],
        writeRoots: ['/work/bad', '/work/good'],
        pathResolver: resolver,
      });
    }).not.toThrow();

    // raiz que falhou na criação: nada é considerado contido nela.
    expect(service?.evaluate(write('/work/bad/file.txt')).verdict).toBe('blocked');
    // a raiz que resolveu com sucesso segue funcionando normalmente.
    expect(service?.evaluate(write('/work/good/file.txt')).verdict).toBe('allowed');
  });

  it('resolve as raízes uma única vez na criação, não a cada evaluate', () => {
    const { resolver, calls } = createFakeResolver({
      real: {
        '/work/repo': '/work/repo',
        '/work/repo/a.txt': '/work/repo/a.txt',
        '/work/repo/b.txt': '/work/repo/b.txt',
      },
    });
    createPermissionService({ readRoots: ['/work/repo'], writeRoots: [], pathResolver: resolver });
    const callsAfterCreation = calls.filter((path) => path === '/work/repo').length;
    expect(callsAfterCreation).toBe(1);

    const service = createPermissionService({
      readRoots: ['/work/repo'],
      writeRoots: [],
      pathResolver: resolver,
    });
    const callsAfterSecondCreation = calls.filter((path) => path === '/work/repo').length;
    expect(callsAfterSecondCreation).toBe(2); // uma resolução por serviço criado

    service.evaluate(read('/work/repo/a.txt'));
    service.evaluate(read('/work/repo/b.txt'));
    service.evaluate(read('/work/repo/a.txt'));

    // evaluate() nunca volta a resolver a raiz — só o alvo de cada chamada.
    expect(calls.filter((path) => path === '/work/repo').length).toBe(2);
  });

  it('independência read/write e access não suportado seguem válidos com resolução real', () => {
    const { resolver } = createFakeResolver({
      real: {
        '/shared': '/shared',
        '/shared/a.txt': '/shared/a.txt',
      },
    });
    const service = createPermissionService({
      readRoots: ['/shared'],
      writeRoots: [],
      pathResolver: resolver,
    });
    expect(service.evaluate(read('/shared/a.txt')).verdict).toBe('allowed');
    expect(service.evaluate(write('/shared/a.txt')).verdict).toBe('blocked');
    const unsupported = {
      resource: { type: 'file', path: '/shared/a.txt' },
      access: 'execute',
    } as unknown as ActionRequest;
    expect(service.evaluate(unsupported).verdict).toBe('blocked');
  });
});

describe('resolução do ancestral existente (algoritmo interno, via fake)', () => {
  it('resolve diretamente quando o path existe', () => {
    const { resolver } = createFakeResolver({ real: { '/work/repo': '/work/repo' } });
    const service = createPermissionService({
      readRoots: ['/work/repo'],
      writeRoots: [],
      pathResolver: resolver,
    });
    expect(service.evaluate(read('/work/repo')).verdict).toBe('allowed');
  });

  it('sobe vários níveis inexistentes até achar o primeiro ancestral existente', () => {
    const { resolver } = createFakeResolver({ real: { '/work': '/work' } });
    const service = createPermissionService({
      readRoots: ['/work'],
      writeRoots: [],
      pathResolver: resolver,
    });
    expect(service.evaluate(read('/work/a/b/c/d.txt')).verdict).toBe('allowed');
  });
});

describe('isContained — método novo (SPEC-0017/ADR-0014), puro/síncrono sobre caminho canônico', () => {
  it('julga um caminho já canônico contido em readRoots como true para access "read"', () => {
    const { resolver } = createFakeResolver({ real: { '/work/repo': '/work/repo' } });
    const service = createPermissionService({
      readRoots: ['/work/repo'],
      writeRoots: [],
      pathResolver: resolver,
    });
    expect(service.isContained('/work/repo/a.txt', 'read')).toBe(true);
  });

  it('julga um caminho já canônico fora de readRoots como false para access "read"', () => {
    const { resolver } = createFakeResolver({ real: { '/work/repo': '/work/repo' } });
    const service = createPermissionService({
      readRoots: ['/work/repo'],
      writeRoots: [],
      pathResolver: resolver,
    });
    expect(service.isContained('/etc/passwd', 'read')).toBe(false);
  });

  it('roteia "write" e "delete" contra writeRoots, independente de readRoots', () => {
    const { resolver } = createFakeResolver({
      real: { '/out': '/out', '/work/repo': '/work/repo' },
    });
    const service = createPermissionService({
      readRoots: ['/work/repo'],
      writeRoots: ['/out'],
      pathResolver: resolver,
    });
    expect(service.isContained('/out/a.txt', 'write')).toBe(true);
    expect(service.isContained('/out/a.txt', 'delete')).toBe(true);
    expect(service.isContained('/work/repo/a.txt', 'write')).toBe(false);
    expect(service.isContained('/work/repo/a.txt', 'read')).toBe(true);
  });

  it('não faz IO nem re-resolve caminho: o resolver injetado não é chamado por isContained', () => {
    const { resolver, calls } = createFakeResolver({ real: { '/work/repo': '/work/repo' } });
    const service = createPermissionService({
      readRoots: ['/work/repo'],
      writeRoots: [],
      pathResolver: resolver,
    });
    const callsBefore = calls.length;
    service.isContained('/work/repo/a.txt', 'read');
    service.isContained('/etc/passwd', 'read');
    expect(calls.length).toBe(callsBefore);
  });

  it('permanece síncrono: devolve boolean diretamente, não Promise', () => {
    const { resolver } = createFakeResolver({ real: { '/work/repo': '/work/repo' } });
    const service = createPermissionService({
      readRoots: ['/work/repo'],
      writeRoots: [],
      pathResolver: resolver,
    });
    const result = service.isContained('/work/repo/a.txt', 'read');
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result).toBe('boolean');
  });
});
