# @atlas/model-gateway

Acesso padronizado a modelos de IA (Module Catalog: Model Gateway).

`createModelGateway(config)` devolve um `ModelGateway` com uma operação — `generate(request)` (geração única, sem streaming). O provedor é escolhido por `config.provider`:

- `fake` — respostas determinísticas, sem rede (testes).
- `local` — Ollama (`POST {baseUrl}/api/chat`, default `http://localhost:11434`), grátis.
- `remote` — endpoint OpenAI-compatible (`POST {baseUrl}/chat/completions`, `Bearer apiKey`), pago genérico.

Trocar de provedor é só mudar a config; consumidores não conhecem o fornecedor.

## Uso

```ts
import { createModelGateway } from '@atlas/model-gateway';

const gateway = createModelGateway({ provider: 'local', model: 'llama3.2' });
const { text } = await gateway.generate({
  messages: [{ role: 'user', content: 'Olá!' }],
});
```

## Smoke (verificação manual)

Executado via `tsx`; use `exec tsx` para repassar flags (o `pnpm run` intercepta o `--`):

```bash
# fake (sem rede/credenciais)
pnpm --filter @atlas/model-gateway exec tsx scripts/smoke.ts --provider fake --prompt "oi"

# local (Ollama rodando)
ATLAS_MODEL_NAME=llama3.2 \
  pnpm --filter @atlas/model-gateway exec tsx scripts/smoke.ts --provider local

# remote (endpoint OpenAI-compatible)
ATLAS_MODEL_BASE_URL=https://api.exemplo/v1 ATLAS_MODEL_API_KEY=sk-... ATLAS_MODEL_NAME=gpt-x \
  pnpm --filter @atlas/model-gateway exec tsx scripts/smoke.ts --provider remote
```
