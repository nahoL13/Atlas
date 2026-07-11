import { describe, expect, it } from 'vitest';

const workspaceName = 'atlas-workspace';

describe('workspace bootstrap', () => {
  it('executa TypeScript no pipeline de testes', () => {
    const parts: readonly string[] = workspaceName.split('-');
    expect(parts).toEqual(['atlas', 'workspace']);
  });
});
