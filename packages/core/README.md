# @atlas/core

Plataforma mínima do Atlas: configuração validada e ciclo de vida.

```ts
import { createAtlas } from '@atlas/core';

const atlas = await createAtlas({ config: { logLevel: 'debug' } });
console.log(atlas.state); // 'ready'
await atlas.shutdown();
```
