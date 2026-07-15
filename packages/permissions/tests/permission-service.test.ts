import { describe, expect, it } from 'vitest';
import type { ActionRequest } from '@atlas/contracts';
import { createPermissionService } from '../src/index.js';

const read = (path: string, type: 'file' | 'directory' = 'file'): ActionRequest => ({
  resource: { type, path },
  access: 'read',
});

describe('createPermissionService.evaluate', () => {
  it('permite leitura dentro de uma raiz permitida', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    expect(service.evaluate(read('/work/repo/src/index.ts'))).toEqual({ verdict: 'allowed' });
  });

  it('permite quando o path é a própria raiz (diretório)', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    expect(service.evaluate(read('/work/repo', 'directory')).verdict).toBe('allowed');
  });

  it('bloqueia leitura fora de toda raiz permitida', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    const decision = service.evaluate(read('/etc/passwd'));
    expect(decision.verdict).toBe('blocked');
    expect(decision.reason).toBeTypeOf('string');
  });

  it('bloqueia escape por .. que sai da raiz', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    expect(service.evaluate(read('/work/repo/../secret.txt')).verdict).toBe('blocked');
  });

  it('não confunde prefixo de nome (/work/repo-secret) com raiz /work/repo', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    expect(service.evaluate(read('/work/repo-secret/x')).verdict).toBe('blocked');
  });

  it('permite quando o path está em QUALQUER uma das raízes', () => {
    const service = createPermissionService({ readRoots: ['/a', '/b'] });
    expect(service.evaluate(read('/b/file')).verdict).toBe('allowed');
  });

  it('trata a raiz do sistema (/) sem duplicar o separador', () => {
    const service = createPermissionService({ readRoots: ['/'] });
    expect(service.evaluate(read('/etc/hosts')).verdict).toBe('allowed');
  });

  it('bloqueia access reservado (write)', () => {
    const service = createPermissionService({ readRoots: ['/work/repo'] });
    const decision = service.evaluate({
      resource: { type: 'file', path: '/work/repo/x' },
      access: 'write',
    });
    expect(decision.verdict).toBe('blocked');
  });
});
