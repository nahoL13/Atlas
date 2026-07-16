import { describe, expect, it } from 'vitest';
import type { ActionRequest } from '@atlas/contracts';
import { createPermissionService } from '../src/index.js';

const read = (path: string, type: 'file' | 'directory' = 'file'): ActionRequest => ({
  resource: { type, path },
  access: 'read',
});

const write = (path: string): ActionRequest => ({
  resource: { type: 'file', path },
  access: 'write',
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
