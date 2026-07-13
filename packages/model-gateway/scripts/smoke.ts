import { parseArgs } from 'node:util';
import { createModelGateway } from '../src/index.js';
import type { ModelGatewayConfig, ProviderName } from '../src/index.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      provider: { type: 'string', default: 'fake' },
      model: { type: 'string' },
      prompt: { type: 'string', default: 'Responda com uma saudação curta.' },
    },
  });

  const model = values.model ?? process.env.ATLAS_MODEL_NAME;
  const baseUrl = process.env.ATLAS_MODEL_BASE_URL;
  const apiKey = process.env.ATLAS_MODEL_API_KEY;

  const config: ModelGatewayConfig = { provider: values.provider as ProviderName };
  if (model !== undefined) config.model = model;
  if (baseUrl !== undefined) config.baseUrl = baseUrl;
  if (apiKey !== undefined) config.apiKey = apiKey;

  const gateway = createModelGateway(config);
  const result = await gateway.generate({
    messages: [{ role: 'user', content: values.prompt as string }],
  });

  process.stdout.write(`${result.text}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
