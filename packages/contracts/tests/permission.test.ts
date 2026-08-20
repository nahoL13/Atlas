import { describe, expect, it } from 'vitest';
import type { AccessMode, ResourceRef, ResourceType } from '../src/permission.js';

describe('ResourceRef (ADR-0026(a)) — união discriminada', () => {
  it('{ type: "network", host } compila', () => {
    const network: ResourceRef = { type: 'network', host: 'example.com' };
    expect(network.type).toBe('network');
  });

  it('{ type: "file"/"directory", path } compila', () => {
    const file: ResourceRef = { type: 'file', path: '/a' };
    const directory: ResourceRef = { type: 'directory', path: '/a' };
    expect(file.type).toBe('file');
    expect(directory.type).toBe('directory');
  });

  it('{ type: "network", path } NÃO compila (teste de tipo negativo)', () => {
    // @ts-expect-error 'network' não carrega 'path' — só 'host' (ADR-0026(a)).
    const invalid: ResourceRef = { type: 'network', path: '/a' };
    expect(invalid).toBeDefined();
  });

  it('ResourceType inclui "network"', () => {
    const types: readonly ResourceType[] = ['file', 'directory', 'network'];
    expect(types).toContain('network');
  });

  it('AccessMode permanece "read" | "write" | "delete" (nenhum modo novo)', () => {
    const modes: readonly AccessMode[] = ['read', 'write', 'delete'];
    expect(modes).toHaveLength(3);
    // @ts-expect-error 'execute' não é um AccessMode válido.
    const invalidMode: AccessMode = 'execute';
    expect(invalidMode).toBeDefined();
  });
});
