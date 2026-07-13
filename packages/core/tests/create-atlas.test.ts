import { describe, expect, it } from 'vitest';
import { InvalidConfigError } from '@atlas/contracts';
import { createAtlas } from '../src/index.js';

describe('createAtlas', () => {
  it('sobe a plataforma até ready com config mesclada e congelada', async () => {
    const atlas = await createAtlas({ config: { logLevel: 'debug' } });
    expect(atlas.state).toBe('ready');
    expect(atlas.config.logLevel).toBe('debug');
    expect(Object.isFrozen(atlas.config)).toBe(true);
    await atlas.shutdown();
  });

  it('desliga com segurança até stopped, com shutdown idempotente', async () => {
    const atlas = await createAtlas();
    await atlas.shutdown();
    expect(atlas.state).toBe('stopped');
    await expect(atlas.shutdown()).resolves.toBeUndefined();
  });

  it('propaga config inválida antes de subir', async () => {
    await expect(createAtlas({ config: { dataDir: '' } })).rejects.toBeInstanceOf(
      InvalidConfigError,
    );
  });

  it('expõe um cognitive que responde via provider fake', async () => {
    const atlas = await createAtlas({ config: { model: { provider: 'fake' } } });
    const answer = await atlas.cognitive.ask('olá');
    expect(answer).toBe('[fake] olá');
    await atlas.shutdown();
  });

  it('expõe um context que guarda e devolve a conversa da sessão', async () => {
    const atlas = await createAtlas({ config: { model: { provider: 'fake' } } });
    const initial = atlas.cognitive.startConversation();
    const id = atlas.context.openSession(initial);
    expect(atlas.context.getConversation(id)).toBe(initial);

    const turn = await atlas.cognitive.respond(atlas.context.getConversation(id), 'oi');
    atlas.context.updateConversation(id, turn.conversation);
    expect(atlas.context.getConversation(id)).toBe(turn.conversation);

    await atlas.shutdown();
  });
});
