# SPEC-0037 — Desktop: seleção/troca de Persona em runtime pela janela

> **Project Atlas — Implementation Specification**

---

# Informações Gerais

**ID**

SPEC-0037

---

**Título**

Desktop: seleção e troca de Persona em runtime pela interface gráfica — escolher entre as Personas disponíveis (`jarvis`/`neutral`) sem reiniciar a app nem passar flag/env

---

**Status**

- [ ] Draft
- [ ] Ready
- [ ] In Progress
- [ ] Review
- [x] Done

---

**Prioridade**

- [ ] Critical
- [ ] High
- [x] Medium
- [ ] Low

---

**Perfil**

- [ ] micro
- [x] completo

---

**Item do Roadmap**

`Fase 2 — 2.4 Persistência e Gerência Local` (`docs/04-engineering/Roadmap.md`, l. 159-163): "Seleção/troca de Persona em runtime (hoje só por flag/env na inicialização)." Esta SPEC entrega a **segunda** das três linhas do item 2.4 (a primeira — gerência visual de memória — foi entregue pela SPEC-0034); a configuração de permissões (`readRoots`/`writeRoots`) por GUI, a terceira linha, fica para fatia futura própria.

---

# Objetivo

Dar à janela do `apps/desktop` (`@atlas/desktop`) a capacidade de **escolher a Persona ativa em runtime**: o usuário vê as Personas disponíveis (hoje `Jarvis` e `Assistente`/`neutral`), vê qual está ativa e troca de Persona pela interface — sem fechar a app, sem editar variável de ambiente e sem passar flag na inicialização.

Ao final: a partir da janela real, o usuário abre o seletor de Persona, escolhe outra Persona, e todas as interações seguintes com o Core (`status`, `ask`, chat) passam a usar a identidade escolhida; se houver um chat aberto no momento da troca, ele é encerrado e uma conversa nova começa já na Persona nova, com aviso explícito na janela. A escolha vale para a **sessão da app** (não sobrevive ao fechamento), e nenhum estado persistente novo é criado.

---

# Motivação

O PRD estabelece, em Personalização (l. 131-135): **"O sistema deve permitir diferentes Personas"**, **"O sistema deve preservar capacidades independentemente da Persona utilizada"** e **"O usuário deve poder selecionar sua Persona preferida."** Hoje essa seleção existe apenas como configuração de inicialização (`AtlasConfig.persona`, resolvida por `flags > env > defaults` — ADR-0006): trocar de Persona exige reiniciar o processo com `--persona`/`ATLAS_PERSONA`. Não há **nenhuma** superfície de troca em runtime, nem na CLI nem na janela.

O Roadmap 2.4 (l. 162) nomeia exatamente essa lacuna: "Seleção/troca de Persona em runtime (hoje só por flag/env na inicialização)." A janela do `apps/desktop` já cobre `status` (SPEC-0031), `ask` stateless (SPEC-0032), chat multi-turno vivo (SPEC-0033), gerência de memória (SPEC-0034) e saída de voz (SPECs 0035/0036) — e já **exibe** a Persona ativa no painel de status, sem permitir mudá-la.

A capacidade existe quase inteira na superfície pública já pronta: `PersonaService.list()/get()/has()` (`@atlas/persona`, ADR-0010) enumera as Personas embutidas, e `createAtlas({ config: { persona } })` já compõe a plataforma com a Persona escolhida, validando o id em `loadConfig`. O que **falta** é uma porta pela qual a aplicação enxergue esse catálogo **sem violar o ADR-0003** (`packages/core` é o composition root; "aplicações consomem a composição oferecida pelo Core e permanecem finas"; Regra de Dependência 11 do Project Structure, l. 878) — hoje `apps/cli` e `apps/desktop` importam implementação **apenas** de `@atlas/core` (mais tipos de `@atlas/contracts`), e essa invariante é observável no repo. Esta SPEC resolve a lacuna pelo caminho que preserva o ADR-0003: um **re-export de catálogo** no `@atlas/core` (molde de `loadConfig`/`defaultConfig`, já re-exportados e já consumidos por `apps/cli/tests`), aditivo, sem wiring novo e sem tocar `@atlas/contracts` (Decisão D4). Fora isso, não há decisão arquitetural nova: é a mesma casca de interação das SPECs 0031-0034, agora expondo a escolha de identidade que o PRD promete.

---

# Referências

- `docs/04-engineering/Roadmap.md` — Fase 2, item 2.4 (l. 159-163); esta SPEC consome a segunda linha
- `docs/02-product/ProductRequirementsDocument.md` — Personalização (l. 129-135: diferentes Personas, capacidades preservadas, usuário seleciona sua Persona preferida); Consistência entre Personas (l. 179)
- `docs/00-project/ArchitectureConstitution.md` — Artigo 1 (a documentação é a fonte da verdade; nenhum precedente arquitetural sem registro), Artigo 2 (o usuário percebe uma única Persona), Artigo 3 (o Core é o único orquestrador), Artigo 11 (Memória tem autoridade exclusiva sobre estado persistente), Artigo 15 / Emenda v1.1 (escalação obrigatória: ADR novo, módulo novo, emenda)
- `docs/06-adr/ADR-0003-core-composition-root.md` — **`packages/core` é o composition root**: único package autorizado a depender de implementações dos demais; aplicações consomem a composição oferecida pelo Core e permanecem finas; a alternativa "composição nas aplicações" está explicitamente **rejeitada**. Regra que governa a Decisão D4
- `docs/03-architecture/ProjectStructure.md` — Regra de Dependência 11 (l. 878), formalização da exceção do composition root
- `docs/03-architecture/ModuleCatalog.md` — Persona Service (`packages/persona`; "É utilizado por: … aplicações clientes" — mapa lógico de uso, l. 853-858; controla nome/tom/formalidade/idioma/estilo/voz/emoção); Regras de Dependência 1 e 9
- `docs/06-adr/ADR-0010-persona-injected-generation.md` — Persona injetada na geração (`personaPrompt` no system prompt da única `generate`); Cognitive não conhece o conceito de Persona; voz/emoção são slots declarativos inertes
- `docs/06-adr/ADR-0009-context-service-value-store.md` — Context Service: estado temporário da conversa, em memória, mediado pela aplicação
- `docs/06-adr/ADR-0011-memory-service-persistence.md` — Memória × Contexto; conhecimento persistente é autoridade da Memory
- `docs/06-adr/ADR-0006-configuration-precedence.md` — precedência `flags > env > arquivo > defaults` (o slot `arquivo` segue não implementado — Roadmap 1.4)
- `docs/06-adr/ADR-0019-desktop-electron-stack.md` — stack Electron; Core só no main process; renderer isolado; sem `dist/`
- [SPEC-0008](SPEC-0008-persona-service.md) (Done) — Persona Service: `list`/`get`/`has`/`systemPrompt`, Personas `jarvis`/`neutral`
- [SPEC-0031](SPEC-0031-desktop-foundation.md) (Done) — fundação: `core-bridge` testável sem Electron, `main.ts` casca fina, `preload.cjs`, IPC; `StatusSnapshot` já expõe a Persona ativa
- [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) (Done) — `resolveAskSnapshot` stateless com `configOverride`
- [SPEC-0033](SPEC-0033-desktop-visual-chat.md) (Done) — chat vivo: `openChatSession`/`sendChatTurn`/`closeChatSession`, Core vivo entre turnos, `Map<SessionId, { atlas }>` no bridge; serialização do turno feita **no renderer** (entrada e botão desabilitados durante o turno, `renderer.js`)
- [SPEC-0034](SPEC-0034-desktop-visual-memory-management.md) (Done) — primeira linha do item 2.4; molde do painel/round-trip stateless espelhado aqui
- [SPEC-0021](SPEC-0021-live-memory-prompt-recomposition.md) (Done) — só a fatia de memória do system prompt é recomposta ao vivo; **`personaPrompt` permanece estático** no Cognitive Core (fato que determina o tratamento do chat aberto nesta SPEC)

---

# Escopo

- estender `packages/core/src/index.ts` com um **re-export de catálogo** (aditivo, sem wiring, sem lógica nova): `export { createPersonaService, PERSONA_IDS } from '@atlas/persona';`, ao lado dos re-exports já existentes (`loadConfig`, `defaultConfig`, `createLifecycle`). É a porta pela qual a aplicação lê o catálogo de Personas continuando a importar implementação **só** de `@atlas/core` (ADR-0003 / Regra 11 preservados). Nenhuma outra alteração em `@atlas/core`;
- estender `apps/desktop/src/core-bridge.ts` (testável, **sem** Electron) com a superfície de Persona — importando `createPersonaService` de **`@atlas/core`** (nunca de `@atlas/persona`) e o tipo `PersonaService` de `@atlas/contracts`:
  - `listPersonas(deps?): readonly PersonaOption[]` — **síncrono, sem subir o Core**: consulta `PersonaService.list()`/`get(id)` e devolve `{ id, name }` plano por Persona conhecida. `deps` = `{ personaService?: PersonaService }` (default: `createPersonaService()`);
  - `selectPersona(id: string, deps?): Promise<PersonaSelection>` — nesta ordem: (1) valida o `id` contra `PersonaService.has(id)`; (2) recusa se houver **turno de chat em voo** (ver abaixo); só então (3) registra a seleção no estado de módulo do bridge, (4) **encerra todas as sessões de chat vivas** (nenhum Core permanece rodando com Persona superada) e devolve `{ personaId, closedSessions }`. Qualquer recusa (1 ou 2) rejeita com erro estruturado e **não** altera a seleção nem encerra nada. `deps` = `{ personaService?: PersonaService }`;
  - `selectedPersonaId(): string | undefined` — leitura do estado de módulo (seleção corrente; `undefined` enquanto o usuário não trocou), exportada para teste e para o `main.ts`;
  - rastreio de **turno em voo**: `sendChatTurn` marca a sessão como ocupada ao entrar e desmarca em `finally` (conjunto interno de `SessionId` ocupadas, ao lado do `Map` de sessões) — é o que permite a recusa (2) acima. Nenhuma mudança no resultado nem no fluxo do turno em si;
  - helper interno que aplica a seleção corrente ao `AtlasConfigOverride` de **todas** as funções que sobem o Core (`resolveStatusSnapshot`, `resolveAskSnapshot`, `openChatSession`, `resolveMemorySnapshot`, `forgetFact`), com precedência: `configOverride.persona` explícito do chamador **vence** a seleção corrente;
- estender `apps/desktop/src/main.ts` (casca Electron): registrar `ipcMain.handle('atlas:persona:list', () => listPersonas())` e `ipcMain.handle('atlas:persona:select', (_e, id) => selectPersona(id))`, removendo de `openChatSessionIds` as sessões devolvidas em `closedSessions`. Nenhuma lógica de domínio no `main.ts`;
- estender `apps/desktop/src/preload.cjs`: expor `window.atlas.persona` com `list()` e `select(id)`, ao lado de `getStatus`/`ask`/`chat`/`memory`;
- estender `apps/desktop/src/renderer/index.html` + `renderer.js`:
  - um seletor de Persona mínimo (`<select>` populado por `window.atlas.persona.list()`, com a Persona ativa marcada a partir do `getStatus()` já consumido no load);
  - o seletor entra na **mesma serialização de turno** que a SPEC-0033 já aplica à entrada de texto e ao botão de enviar: fica desabilitado enquanto houver turno em voo e é reabilitado no `finally` do turno;
  - ao trocar: chama `select(id)`, limpa o transcript, escreve uma linha explícita de aviso ("Persona alterada para X — nova conversa iniciada"), reabre a sessão de chat (`window.atlas.chat.open()`) e recarrega o painel de status; se `select` rejeitar (id inválido ou turno em voo), mostra o aviso de erro **sem** limpar o transcript e **sem** fechar a conversa corrente. JavaScript plano, sem bundler nem framework;
- testes: estender `apps/desktop/tests/core-bridge.test.ts` com os casos de `listPersonas`/`selectPersona`/propagação da seleção/recusa com turno em voo (ver Estratégia de Testes);
- atualizar `apps/desktop/CLAUDE.md` (superfície de Persona, canais IPC novos, escopo de vida da seleção, fronteira com o restante de 2.4 e com a criação de Personas) e `packages/core/CLAUDE.md` (o re-export de catálogo e sua fronteira).

---

# Fora do Escopo

- **criar Personas pela interface** (escolher personalidade, voz, etc.) — o desejo declarado do usuário para a fatia **seguinte**, deliberadamente não implementado aqui. Ver "Observações → O que a criação de Persona pela GUI vai exigir": ela transforma Persona de **dado inerte embutido** (`PERSONAS` em `@atlas/persona`) em **estado criado pelo usuário e durável entre reinícios**, o que toca o Artigo 11 (autoridade exclusiva da Memory sobre estado persistente), a responsabilidade do Persona Service no Module Catalog e provavelmente o ADR-0010 — território de **ADR novo**, isto é, **escalação obrigatória** (Emenda v1.1), não decisão do `spec-drafter`;
- **editar** os atributos de uma Persona embutida (tom, formalidade, estilo, regras) pela GUI — mesma fronteira do item acima;
- **persistir a Persona escolhida entre reinícios** da app (preferência durável) — exigiria estado persistente novo (Memory Service, Artigo 11) ou o slot `arquivo` da precedência de config (ADR-0006, ainda não implementado — Roadmap 1.4). Ambos são decisão estrutural própria; ver "Decisões de design" (D3);
- **vincular a voz do TTS à Persona** (`Persona.voice` é slot declarativo **inerte** por ADR-0010; a saída de voz das SPECs 0035/0036 seleciona deterministicamente a primeira voz local do SO) — ligar os dois revisita o ADR-0010; fatia futura;
- **troca de Persona pela CLI** (`atlas persona list`/`atlas persona use`) — o Roadmap 2.4 é sobre a interface gráfica; a CLI já tem `--persona` na inicialização. Candidato futuro independente (quando existir, será o 2º consumidor do re-export de catálogo — ver D4);
- **preservar o histórico da conversa ao trocar de Persona** (migrar a `Conversation` viva para o Core novo) — ver "Decisões de design" (D5); candidato futuro;
- **recomposição ao vivo do `personaPrompt` dentro de um Core já criado** (o equivalente para Persona do que a SPEC-0021 fez para memória) — mudaria `@atlas/cognitive`/`@atlas/core`, fora da fronteira desta fatia;
- **cancelamento de um turno de chat em voo** — esta SPEC apenas **recusa** a troca enquanto o turno corre (D9); cancelar/abortar geração é capacidade nova (Task Manager, Roadmap 1.1), fora de escopo;
- **serialização de turno dentro do bridge** além do rastreio mínimo de sessão ocupada — nenhuma fila, retry ou lock geral; a serialização de UX continua sendo do renderer (SPEC-0033);
- configuração de **permissões** (`readRoots`/`writeRoots`) por GUI — a terceira linha do item 2.4, sua própria SPEC;
- promover `PersonaOption`/`PersonaSelection` ou os canais IPC a `@atlas/contracts` — só com um 2º consumidor real, via ADR (mesma regra que manteve `StatusSnapshot`/`AskSnapshot`/`TurnSnapshot`/`FactSnapshot` locais nas SPECs 0031-0034);
- qualquer alteração em `@atlas/contracts`, `@atlas/persona`, `@atlas/cognitive` ou qualquer outro package; e, em `@atlas/core`, qualquer alteração **além** da linha de re-export descrita no Escopo (nada de wiring novo, lógica de catálogo, mudança em `createAtlas`/`loadConfig`/`AtlasPlatform`). Necessidade de mais que isso é motivo para **parar e registrar** (Constituição);
- estilização/UX elaborada (CSS, preview da Persona, descrição longa, avatar) — o seletor desta fatia é diagnóstico/mínimo, como as janelas das SPECs 0031-0035;
- bundler/framework de UI; empacotamento/distribuição (Fase 3); E2E/harness headless de Electron em CI — a janela segue validada por smoke manual.

---

# Pré-requisitos

- [SPEC-0031](SPEC-0031-desktop-foundation.md) (Done) — fundação do `apps/desktop`: `core-bridge`, `main.ts`, `preload.cjs`, renderer, IPC; `StatusSnapshot.persona`.
- [SPEC-0032](SPEC-0032-desktop-confirm-steps-adapters.md) (Done) — `resolveAskSnapshot` com `configOverride`.
- [SPEC-0033](SPEC-0033-desktop-visual-chat.md) (Done) — ciclo de vida do chat vivo (`openChatSession`/`sendChatTurn`/`closeChatSession`) e a serialização de turno no renderer, ambos estendidos aqui.
- [SPEC-0034](SPEC-0034-desktop-visual-memory-management.md) (Done) — primeira linha do item 2.4; molde do painel espelhado aqui.
- [SPEC-0008](SPEC-0008-persona-service.md) (Done) — Persona Service (`list`/`get`/`has`), Personas `jarvis`/`neutral`.

---

# Critérios de Aceitação

- `pnpm lint` passa sem erros, cobrindo os arquivos novos/alterados de `apps/desktop` (inclusive `renderer.js`/`preload.cjs` no contexto browser/CommonJS);
- `pnpm typecheck` passa, cobrindo `apps/desktop` e `packages/core`;
- `pnpm test` executa e passa, incluindo os testes novos/estendidos de `apps/desktop/tests/`;
- teste comprova: `listPersonas()` devolve exatamente uma entrada `{ id, name }` por id de `PersonaService.list()` — para o registro embutido atual, `[{ id: 'jarvis', name: 'Jarvis' }, { id: 'neutral', name: 'Assistente' }]` — planas e serializáveis por IPC (`JSON.stringify` round-trips sem perda), **sem** chamar `createAtlas` (spy: zero chamadas);
- teste comprova: após `selectPersona('neutral')`, um `resolveStatusSnapshot()` subsequente (sem `configOverride`) devolve `persona.id === 'neutral'`; antes de qualquer `selectPersona`, devolve o default da config (`jarvis`);
- teste comprova: `configOverride.persona` explícito passado pelo chamador **vence** a seleção corrente (ex.: com `'neutral'` selecionado, `resolveStatusSnapshot({ persona: 'jarvis' })` devolve `jarvis`);
- teste comprova: a seleção corrente também alcança `openChatSession` — uma sessão aberta **depois** de `selectPersona('neutral')` roda sobre um Core cuja Persona ativa é `neutral`;
- teste comprova: `selectPersona('inexistente')` **rejeita** com erro estruturado (`Error`, mensagem citando o id), **não** altera `selectedPersonaId()` e **não** encerra nenhuma sessão de chat viva (um `sendChatTurn` posterior na mesma sessão ainda funciona);
- teste comprova: com uma sessão de chat aberta e **ociosa**, `selectPersona(outroId)` devolve essa `SessionId` em `closedSessions`, e um `sendChatTurn(sessãoAntiga, …)` subsequente rejeita com o erro estruturado de sessão desconhecida/encerrada; `selectPersona` sem nenhuma sessão aberta devolve `closedSessions: []`;
- teste comprova (**turno em voo**): com um `sendChatTurn` pendente (gateway `fake` instrumentado para só resolver quando o teste liberar), `selectPersona(outroId)` **rejeita** com erro estruturado citando o turno em andamento, `selectedPersonaId()` fica inalterado, nenhuma sessão é encerrada, e o turno em voo **conclui normalmente** — devolvendo seu `TurnSnapshot` e gravando seus `learned` (nenhum fato perdido, nenhum `ContextError` de sessão desconhecida); depois de o turno concluir, `selectPersona(outroId)` passa a ser aceito;
- teste comprova: `listPersonas`/`selectPersona` aceitam um `personaService` injetado (fake) e o usam em vez do default — nenhuma dependência de Electron em `core-bridge.ts`;
- verificação de fronteira (ADR-0003): nenhum arquivo de `apps/desktop/src` nem de `apps/cli/src` importa de `@atlas/persona` ou de qualquer package que não seja `@atlas/core`/`@atlas/contracts` (conferível por `grep` em `apps/*/src`); `apps/desktop/package.json` **não** ganha dependência nova;
- o diff em `packages/core` é **exclusivamente** a linha de re-export descrita no Escopo (nenhuma mudança em `createAtlas`, `loadConfig`, `defaultConfig`, `AtlasPlatform` ou wiring);
- smoke manual (registrado nas Observações): em sessão gráfica real (`pnpm --filter @atlas/desktop start`), (a) o seletor lista as Personas com a ativa marcada; (b) trocar para `Assistente` mostra o aviso de nova conversa, atualiza o painel de status para a Persona nova, e um turno de chat seguinte responde sob a nova identidade; (c) enquanto um turno está em voo, o seletor aparece **desabilitado** junto com a entrada e o botão de enviar, e volta a habilitar quando o turno termina; (d) fechar e reabrir a app volta à Persona da config (a escolha não é durável, por decisão desta SPEC);
- estrutura corresponde à seção "Arquivos Esperados";
- nenhuma alteração em `@atlas/contracts`, `@atlas/persona`, `@atlas/cognitive` nem qualquer package do Core além do re-export em `@atlas/core`.

---

# Arquivos Esperados

```text
packages/
└── core/
    ├── src/
    │   └── index.ts             # + re-export de catálogo: createPersonaService, PERSONA_IDS
    └── CLAUDE.md                # + o re-export de catálogo e sua fronteira

apps/
└── desktop/
    ├── src/
    │   ├── core-bridge.ts       # + PersonaOption/PersonaSelection, listPersonas/selectPersona/
    │   │                        #   selectedPersonaId, rastreio de turno em voo, aplicação da
    │   │                        #   seleção nos configOverride
    │   ├── main.ts              # + ipcMain.handle dos 2 canais de persona; sincroniza openChatSessionIds
    │   ├── preload.cjs          # + window.atlas.persona.list()/select(id)
    │   ├── confirm-port.ts      # inalterado
    │   ├── steps-view.ts        # inalterado
    │   ├── speech-output.ts     # inalterado
    │   └── renderer/
    │       ├── index.html       # + seletor de Persona
    │       └── renderer.js      # + popula/desabilita o seletor, troca, reabre o chat, avisa,
    │                            #   recarrega status
    ├── tests/
    │   └── core-bridge.test.ts  # + casos de listPersonas/selectPersona/propagação/turno em voo
    └── CLAUDE.md                # + superfície de Persona, canais IPC, escopo de vida da seleção
```

`apps/desktop/package.json` fica **inalterado** (o app continua dependendo só de `@atlas/core` + `@atlas/contracts`). Nenhum arquivo novo em `docs/06-adr/` ou `@atlas/contracts`. Essa lista é expectativa e pode sofrer pequenos ajustes.

---

# Componentes Impactados

Camada Interaction do Module Catalog, no app `apps/desktop`:

- Input Gateway (semente desktop, SPECs 0031-0034) — entrada ganha o gesto de "escolher Persona";
- Output Gateway (semente desktop) — saída ganha o seletor, o aviso de troca e o status atualizado.

Platform:

- Core (`packages/core`) — **apenas a superfície de export**: um re-export de catálogo, sem wiring, sem lógica, sem mudança de comportamento de `createAtlas`.

Consome, **sem alterar**: Persona Service (`list`/`get`/`has`), Core (`createAtlas` com `config.persona`), Context Service (via `closeChatSession` já existente), Lifecycle Manager (`shutdown`).

---

# Interfaces Necessárias

Em `packages/core` (superfície de export, nenhuma interface nova):

```text
export { createPersonaService, PERSONA_IDS } from '@atlas/persona';
```

Locais em `apps/desktop` (não em `@atlas/contracts` — não há segundo consumidor):

```text
PersonaOption {
  id: string        // PersonaService.list()
  name: string      // PersonaService.get(id).name
}

PersonaSelection {
  personaId: string
  closedSessions: readonly SessionId[]   // sessões de chat encerradas pela troca
}

listPersonas(deps?: { personaService?: PersonaService }): readonly PersonaOption[]

selectPersona(id: string, deps?: {
  personaService?: PersonaService
}): Promise<PersonaSelection>
  // rejeita (sem efeito colateral) se: id desconhecido | há turno de chat em voo

selectedPersonaId(): string | undefined
```

`PersonaService`/`SessionId`/`AtlasConfigOverride` vêm de `@atlas/contracts` (tipos já existentes); a implementação default do serviço vem de **`@atlas/core`** (`createPersonaService()`, re-exportado). Nenhuma interface nova em `@atlas/contracts`.

Canais IPC novos (nomes estáveis, ao lado de `'atlas:status'`/`'atlas:ask'`/`'atlas:chat:*'`/`'atlas:memory:*'`):

```text
main:     ipcMain.handle('atlas:persona:list',   ()       => listPersonas())
          ipcMain.handle('atlas:persona:select', (_e, id) => selectPersona(id))
preload:  window.atlas.persona.list()      → ipcRenderer.invoke('atlas:persona:list')
          window.atlas.persona.select(id)  → ipcRenderer.invoke('atlas:persona:select', id)
renderer: const personas  = await window.atlas.persona.list()
          const selection = await window.atlas.persona.select(id)
```

---

# Fluxo Esperado

```text
[abertura da janela]
renderer → window.atlas.persona.list()   → [main] listPersonas()  (sem subir o Core)
renderer → window.atlas.getStatus()      → [main] resolveStatusSnapshot() → persona ativa
  → pinta o seletor com a Persona ativa marcada

[turno de chat em voo]
renderer: desabilita entrada + botão enviar + SELETOR DE PERSONA (molde SPEC-0033)
  → reabilita os três no finally do turno
[main] selectPersona(id) enquanto a sessão está ocupada → rejeita (nada muda, nada encerra)

[usuário escolhe outra Persona]
renderer → window.atlas.persona.select(id)
  → [main] ipcMain.handle('atlas:persona:select')
      → selectPersona(id)
          → personaService.has(id)?      não → rejeita (nada muda, nada encerra)
          → alguma sessão ocupada?       sim → rejeita (nada muda, nada encerra)
          → registra a seleção no estado de módulo do bridge
          → closeChatSession(s) para toda sessão viva  → { personaId, closedSessions }
      → main.ts remove closedSessions de openChatSessionIds
  → renderer: limpa o transcript, escreve "Persona alterada para X — nova conversa iniciada",
    reabre a sessão (window.atlas.chat.open()) e recarrega o painel de status
  → se rejeitou: mostra o aviso de erro, mantém transcript e conversa corrente intactos

[interações seguintes]
resolveStatusSnapshot / resolveAskSnapshot / openChatSession / resolveMemorySnapshot / forgetFact
  → createAtlas({ config: { ...override, persona: override.persona ?? seleção } })
  → Persona nova injetada na geração pelo caminho normal (ADR-0010)
```

Regras (para remover ambiguidade):

- o Core vive **exclusivamente no main process**; o renderer nunca importa `packages/*` nem tipos de contrato — recebe só `PersonaOption[]`/`PersonaSelection` planos (Artigo 3 / segurança Electron);
- `apps/desktop` importa implementação **apenas** de `@atlas/core` (mais tipos de `@atlas/contracts`) — a leitura do catálogo de Personas passa pelo re-export do composition root, nunca por import direto de `@atlas/persona` (ADR-0003 / Regra 11);
- a Persona chega ao modelo **só** pelo caminho já existente do ADR-0010 (`createAtlas` → `personaService.systemPrompt(persona)` → `personaPrompt` do Cognitive Core); o app **não** compõe prompt de identidade nem toca o Cognitive;
- **turno em voo bloqueia a troca, em duas camadas**: o renderer desabilita o seletor durante o turno (UX, molde SPEC-0033) e o bridge recusa `selectPersona` enquanto alguma sessão estiver ocupada (garantia, testável). Sem isso, encerrar a sessão no meio de um `respond` faria o `updateConversation` posterior lançar `ContextError: Sessão desconhecida`, perdendo os `learned` daquele turno (a gravação vem depois do `updateConversation`) e sujando um transcript recém-limpo com um erro;
- a seleção é **estado de sessão da app**, em memória do main process (mesmo lugar/molde do `Map` de sessões de chat da SPEC-0033): não é conhecimento persistente, logo não passa pela Memory (Artigo 11) nem cria arquivo novo;
- a validação final do id continua sendo do Core (`loadConfig` rejeita persona desconhecida); `selectPersona` apenas antecipa a recusa com `PersonaService.has` (mesma divisão "borda antecipa, módulo garante" já usada pela CLI na SPEC-0029);
- trocar de Persona **encerra** as sessões de chat vivas (ociosas): um Core criado com a Persona anterior tem o `personaPrompt` **estático** (SPEC-0021 recompõe ao vivo só a fatia de memória), então mantê-lo vivo produziria uma janela falando com identidade superada — proibido pelo Artigo 2 (uma única Persona percebida);
- o usuário sempre vê qual Persona está ativa (seletor marcado + painel de status), e a troca é sempre anunciada na janela — nada de troca silenciosa.

---

# Estratégia de Implementação

1. `packages/core/src/index.ts`: adicionar o re-export de catálogo (`createPersonaService`, `PERSONA_IDS`) ao lado de `loadConfig`/`defaultConfig`/`createLifecycle`; conferir que nada mais no package muda;
2. estender `core-bridge.ts`: `PersonaOption`/`PersonaSelection`, estado de módulo da seleção, conjunto de sessões ocupadas (`sendChatTurn` marca/desmarca em `try`/`finally`), `listPersonas`/`selectPersona`/`selectedPersonaId`, e o helper que injeta a seleção no `AtlasConfigOverride` das cinco funções que sobem o Core (precedência: override explícito do chamador vence). Atenção ao `exactOptionalPropertyTypes`: só definir `persona` quando houver valor (padrão já recorrente no repo);
3. testes de `core-bridge.test.ts` (TDD): catálogo sem boot do Core; propagação da seleção a `status`/chat; precedência do override explícito; id inválido rejeitado sem efeito colateral; encerramento das sessões ociosas na troca; **recusa com turno em voo** (gateway `fake` com resolução controlada pelo teste) e conclusão íntegra do turno; `personaService` injetável;
4. `main.ts`: registrar os dois `ipcMain.handle`, sincronizando `openChatSessionIds` com `closedSessions`; casca fina;
5. `preload.cjs`: expor `window.atlas.persona.{list,select}`; `renderer/index.html` + `renderer.js`: seletor populado no load, com a ativa marcada, incluído na serialização de turno já existente (desabilita/reabilita junto com entrada e botão); ao trocar — `select(id)` → limpar transcript → aviso explícito → `chat.open()` → recarregar status; em rejeição, aviso de erro sem destruir a conversa;
6. validar `pnpm lint`/`typecheck`/`test` e a verificação de fronteira por `grep` (nenhum import de `@atlas/persona` em `apps/*/src`);
7. smoke manual em sessão gráfica real (trocar de Persona, ver o aviso, conversar sob a nova identidade, observar o seletor desabilitado durante um turno, reabrir a app e confirmar o retorno à Persona da config) e registrar o resultado;
8. atualizar `apps/desktop/CLAUDE.md` e `packages/core/CLAUDE.md`; validar todos os critérios de aceitação.

---

# Estratégia de Testes

- testes unitários em `apps/desktop/tests/core-bridge.test.ts` sob o Vitest já configurado, **sem Electron** — a fronteira testável é a superfície de Persona do `core-bridge`, como nas SPECs 0031-0034;
- **listPersonas**: uma entrada por id do `PersonaService`, `{ id, name }` planos e serializáveis; nenhum boot do Core; com `personaService` fake injetado, devolve o catálogo do fake;
- **selectPersona (feliz)**: registra a seleção (`selectedPersonaId()`), e `resolveStatusSnapshot()` subsequente reporta a Persona nova; `openChatSession` posterior nasce com a Persona nova;
- **selectPersona (precedência)**: `resolveStatusSnapshot({ persona: 'jarvis' })` com `'neutral'` selecionado devolve `jarvis`;
- **selectPersona (inválido)**: rejeita, `selectedPersonaId()` inalterado, sessões vivas intactas (um `sendChatTurn` posterior na mesma sessão ainda funciona);
- **selectPersona (chat vivo ocioso)**: sessão aberta é devolvida em `closedSessions` e fica inutilizável depois (`sendChatTurn` rejeita); sem sessões, `closedSessions` é `[]`;
- **selectPersona (turno em voo)**: com o gateway `fake` instrumentado para segurar a resposta até o teste liberar, disparar `sendChatTurn` sem aguardar, chamar `selectPersona` e asseverar: rejeição estruturada, seleção inalterada, nenhuma sessão encerrada; liberar o turno e asseverar que ele conclui com `TurnSnapshot` íntegro e `learned` gravados; então `selectPersona` passa a ser aceito;
- **isolamento entre testes**: a seleção e o conjunto de sessões ocupadas são estado de módulo — cada teste que os altera precisa restaurá-los (ex.: `selectPersona` de volta ao default no `afterEach`, ou um reset explícito exportado só para teste, se o implementador julgar mais limpo; a decisão fica com o implementador desde que os testes não vazem estado entre si);
- sem mocks do Core — `createAtlas` real com gateway `fake` e `dataDir` temporário isolado (ADR-0004), padrão das suítes desktop;
- `main.ts`/`preload.cjs`/`renderer.js` (camada Electron/DOM) **não** são unit-testados nesta fatia — validação por smoke manual, incluindo o item (c) do critério de smoke (seletor desabilitado durante o turno).

---

# Definition of Done

Esta SPEC será considerada concluída somente quando:

- todos os critérios de aceitação forem atendidos;
- testes estiverem passando;
- documentação atualizada;
- arquitetura preservada;
- revisão concluída;
- lições aprendidas registradas em `implementation/LESSONS_LEARNED.md`.

A sincronização das docs vivas (`CLAUDE.md` raiz, `NEXT_CONTEXT.md`, `CURRENT_SPRINT.md`, `Roadmap.md`) é passo de fecho (`doc-sync`), não do implementador; o implementador toca a doc específica da própria SPEC (o arquivo da SPEC, os `CLAUDE.md` de `apps/desktop` e `packages/core`).

---

# Restrições

- Não criar novos packages, módulos, Tools, Skills nem **Personas**; o código novo vive em `apps/desktop`, mais uma linha de re-export em `packages/core/src/index.ts`. Esta SPEC apenas **seleciona** entre as Personas já documentadas — criar Persona é decisão humana (Artigo 3).
- **ADR-0003 preservado**: `packages/core` continua sendo o único lugar que importa implementações de outros packages; `apps/*` continuam importando implementação só de `@atlas/core` (+ tipos de `@atlas/contracts`). O re-export é **superfície de leitura de catálogo inerte**, não wiring: o app nunca compõe plataforma, nunca injeta o `PersonaService` em nada, nunca instancia outro serviço da plataforma.
- Consumir o Core **só** por suas superfícies públicas (`createAtlas`, `AtlasConfigOverride.persona`, `createPersonaService()` re-exportado) — nunca internals (Artigo 3); nunca compor prompt de identidade no app (isso é do Persona Service, ADR-0010).
- Nenhum estado persistente novo: a seleção vive em memória do main process e morre com a app. Se a implementação sugerir gravar a preferência em disco, **parar e registrar** (Artigo 11 / escalação).
- O Core vive só no main process; o renderer não importa `packages/*` nem tipos de contrato. `contextIsolation: true`, `nodeIntegration: false`.
- `core-bridge.ts` **não** importa `electron` (a dependência de Electron fica confinada a `main.ts`) — é o que o mantém testável no Vitest.
- Não alterar `@atlas/contracts`/`@atlas/persona`/`@atlas/cognitive` nem qualquer package do Core; em `@atlas/core`, nada além da linha de re-export.
- Sem `dist/`, sem bundler, sem framework de UI: main process em `.ts` via `tsx` (ADR-0005/0019); renderer/preload em JS plano.
- `PersonaOption`/`PersonaSelection` e os canais IPC ficam **locais** a `apps/desktop`; promoção a `@atlas/contracts` só com 2º consumidor real, via ADR.

---

# Observações

**Fronteira do re-export de catálogo (para não virar "composição na aplicação").** O que esta SPEC autoriza é estreito e deve ser lido literalmente: `@atlas/core` pode **re-exportar superfícies de leitura de catálogo/configuração inerte** de packages que ele já compõe (molde de `loadConfig`/`defaultConfig`), e `apps/*` podem consumi-las **somente para exibir/validar escolha do usuário**. O que continua proibido, sem ADR: a aplicação importar qualquer package que não seja `@atlas/core`/`@atlas/contracts`; instanciar serviços da plataforma para **injetá-los** em outro componente; montar ou substituir wiring que hoje vive em `createAtlas`. Se uma fatia futura precisar de mais que leitura inerte, é sinal de ADR, não de mais re-exports. Ver Decisão D4.

**Por que a troca não é durável.** A seleção vale para a sessão da app. Torná-la durável exigiria ou (a) gravá-la como conhecimento persistente — território exclusivo do Memory Service (Artigo 11), e "qual Persona eu prefiro" é preferência de configuração, não conhecimento aprendido; ou (b) o slot `arquivo` da precedência de config (ADR-0006), **ainda não implementado** (candidato do Roadmap 1.4). Qualquer dos dois é decisão estrutural própria, com ADR — fora do que esta fatia decide. O Roadmap 2.4 pede troca "em runtime", e é isso que esta SPEC entrega; a preferência durável fica nomeada como fatia futura (ver "Decisões de design" D3).

**Troca com turno de chat em voo.** `sendChatTurn` não é serializado no bridge (a serialização é do renderer, SPEC-0033, e cobre hoje só entrada e botão de enviar). Sem tratamento, a sequência "usuário envia → troca a Persona" é alcançável (um turno com Ollama leva segundos) e o resultado é ruim: `selectPersona` encerraria a sessão (`context.closeSession` + `shutdown`), e o `respond` em voo, ao retornar, faria `updateConversation` lançar `ContextError: Sessão desconhecida` — o turno rejeita, os `learned` daquele turno se perdem (a gravação vem **depois** do `updateConversation`) e o renderer pinta um erro logo abaixo do aviso "nova conversa iniciada", num transcript recém-limpo. Por isso esta SPEC trata o caso em duas camadas (UX no renderer, garantia no bridge) — ver Decisão D9.

**O que a criação de Persona pela GUI vai exigir** (desejo declarado do usuário para a fatia seguinte, avaliado aqui e deliberadamente adiado):

1. **Persona deixa de ser dado inerte.** Hoje `PERSONAS` é um objeto literal embutido em `packages/persona/src/personas.ts`, e `PERSONA_IDS` é a fonte de validação de config no `@atlas/core`. Uma Persona criada pelo usuário precisa existir **fora do código-fonte** e sobreviver ao reinício — isto é, estado persistente novo.
2. **Colisão direta com o Artigo 11.** Estado persistente é autoridade exclusiva do Memory Service. Ou a Persona do usuário vira um tipo de conhecimento sob a Memory (mudança de responsabilidade e de contrato), ou o Persona Service ganha uma **porta de storage própria** (no molde do ADR-0011) — o que altera a responsabilidade do módulo registrada no Module Catalog.
3. **ADR novo, quase certamente dois.** A decisão "onde vive uma Persona criada pelo usuário" é inédita (ADR próprio); e "escolher voz" para a Persona revisita o ADR-0010, que hoje declara `voice`/`emotion` **slots declarativos inertes**, mais a fatia de TTS das SPECs 0035/0036 (que hoje escolhe deterministicamente a primeira voz **local** do SO).
4. **Artigo 3.** Criar Persona é hoje decisão humana documentada; uma GUI que cria Personas em runtime precisa de uma definição explícita de fronteira (o que o usuário pode definir, e o que continua sendo mudança arquitetural).

Conclusão: essa fatia **não** é decisão do `spec-drafter` — cai na escalação obrigatória da Emenda v1.1 (ADR novo / possível mudança de responsabilidade no Module Catalog) e deve começar por brainstorming humano, exatamente como o Roadmap marca itens `ADR primeiro`. Esta SPEC prepara o terreno sem prejulgá-la: a superfície de escolha (`listPersonas`/`selectPersona`) é a mesma que uma Persona criada pelo usuário usaria depois, sem retrabalho da parte visual.

**Coexistência com o chat vivo (SPEC-0033).** O `personaPrompt` é injetado na criação do Cognitive Core e **não** é recomposto a cada turno (a SPEC-0021 recompõe ao vivo apenas a fatia de memória). Portanto não existe "trocar a Persona de um Core já vivo" sem mudar `@atlas/cognitive`/`@atlas/core` — fora do escopo. A troca encerra as sessões vivas ociosas e a próxima conversa nasce já na Persona nova. Ver "Decisões de design" (D5).

**Smoke manual.** Como nas SPECs 0031-0036, o shell de automação sem WindowServer não executa `app.whenReady()`; a confirmação visual deve ser feita por quem tiver sessão gráfica real, antes de fechar a SPEC. A cadeia testável (`core-bridge`) roda em CI sob Vitest sem Electron. Atrito recorrente de toda fatia visual da Fase 2.

**Estado de módulo e testes.** A seleção corrente e o conjunto de sessões ocupadas são estado de módulo do `core-bridge` (mesmo molde do `Map` de sessões de chat da SPEC-0033) — os testes que os alteram precisam restaurá-los para não vazar entre casos. Ponto de atenção explícito para o implementador, e custo pesado em D3.

---

# Checklist para IA

Antes de implementar:

- ler documentação referenciada (Roadmap 2.4, PRD Personalização, ADR-0003/0010/0009/0019, Regra de Dependência 11, SPECs 0008/0031-0034, `packages/persona/src`);
- compreender objetivo (escolher a Persona ativa em runtime pela janela, sem estado persistente novo, sem quebrar o composition root);
- confirmar que nenhum contrato precisa mudar e que o diff em `@atlas/core` é só o re-export.

Durante implementação:

- manter o app fino; Core só no main process; renderer isolado;
- `core-bridge.ts` livre de import de Electron e de import direto de `@atlas/persona`; Persona sempre pelo `PersonaService`/`createAtlas`, nunca prompt de identidade no app;
- nenhuma gravação em disco da preferência; nenhuma Persona nova criada;
- manter simplicidade (sem bundler, sem framework); seletor diagnóstico/mínimo.

Após implementação:

- executar testes e a verificação de fronteira por `grep`;
- smoke manual do app real (trocar Persona, ver aviso, seletor desabilitado durante o turno, conversar, reabrir a app);
- validar critérios de aceitação;
- registrar lições aprendidas;
- registrar conclusão.

---

# Decisões de design

> Decisões tomadas pelo `spec-drafter` (Emenda v1.1), em formato de veto. Quem as ataca é o `architecture-reviewer` no gate `Draft → Ready`.

**D1. Perfil `completo`.**

- **Decisão**: classificar a SPEC como `completo`.
- **Porquê**: a fatia mexe em `apps/desktop/src` — fora da superfície de containment do perfil `micro` (`packages/X/src` + opcionalmente `apps/cli/src`) — toca também `packages/core/src` e envolve integração gráfica validada só por smoke manual. Paridade com as cinco SPECs irmãs do desktop (0031-0036), todas `completo` pela mesma razão. Na dúvida, `completo` (default seguro).
- **Alternativa descartada**: `micro` — falha a condição de containment; classificar `micro` só a faria cair no pipeline completo no gate, sem ganho.

**D2. Escopo da fatia: só a troca, não a criação de Persona.**

- **Decisão**: entregar apenas seleção/troca entre as Personas já existentes; criação de Persona pela GUI fica de fora, com o levantamento do que ela exigirá registrado nas Observações.
- **Porquê**: é exatamente o que o Roadmap 2.4 (l. 162) e o PRD (l. 135, "o usuário deve poder selecionar sua Persona preferida") pedem, e é o que a documentação existente determina sozinha. A criação envolve estado persistente novo, colide com o Artigo 11 e exige ADR novo — escalação obrigatória (Emenda v1.1), não decisão do drafter.
- **Alternativa descartada**: já incluir a criação de Persona nesta SPEC — decidiria por conta própria onde vive uma Persona criada pelo usuário (ADR novo) e possivelmente moveria responsabilidade entre módulos; proibido pela Emenda v1.1.

**D3. A Persona escolhida vive em estado de módulo do `core-bridge` (main process), pela sessão da app — não é persistida.**

- **Decisão**: a seleção é estado de módulo do `core-bridge` (molde do `Map` de sessões da SPEC-0033), aplicado como `config.persona` em cada `createAtlas` subsequente; fechar a app volta à Persona da config (`flags > env > defaults`).
- **Porquê**: mantém a fatia inteiramente dentro do que a documentação já determina — nenhum estado persistente novo, logo nenhuma tensão com o Artigo 11 nem com o ADR-0011, e nenhum ADR necessário. A seleção também **não** pertence ao Context Service (ADR-0009), que guarda estado de **conversa**, não preferência de identidade da app. Guardá-la no main process (onde o Core vive) mantém o renderer burro e torna a regra "toda chamada ao Core usa a Persona ativa" verificável num único lugar, por teste de Vitest sem Electron. "Troca em runtime" é literalmente o que o Roadmap 2.4 pede.
- **Alternativa descartada (1)**: **a seleção viver no renderer** e viajar como argumento (`configOverride.persona`) em cada chamada IPC, usando a precedência que D7 já define — elimina estado global, o risco de vazamento entre testes e a necessidade de `selectedPersonaId()`. Perde, apesar disso, porque: (a) engrossaria `main.ts` e todos os canais IPC já existentes (`status`/`ask`/`chat:open`/`memory:*` passariam a carregar persona), contrariando a casca fina das SPECs 0031-0034; (b) faria do renderer a **fonte de verdade** de qual Persona o Core usa, quando o Core vive só no main process (Artigo 3 / isolamento do ADR-0019) — um renderer com bug passaria a poder divergir silenciosamente; (c) a garantia central desta SPEC ("nenhuma sessão viva sobrevive com Persona superada", D5/D9) precisa de um ponto único no main process de qualquer forma. O custo aceito (estado de módulo exige restauração entre testes) está registrado na Estratégia de Testes e nas Observações.
- **Alternativa descartada (2)**: persistir a preferência (na Memory ou num arquivo de config) — a Memory é autoridade sobre **conhecimento**, não sobre preferência de configuração (Artigo 11 + ADR-0011), e o slot `arquivo` do ADR-0006 nem existe ainda (Roadmap 1.4). Qualquer dos dois é decisão estrutural própria e escalaria; rejeitada por escopo.

**D4. O catálogo de Personas chega ao app por um re-export em `@atlas/core` — o app continua importando implementação só do composition root.**

- **Decisão**: `packages/core/src/index.ts` passa a re-exportar `createPersonaService`/`PERSONA_IDS` de `@atlas/persona` (aditivo, sem wiring, molde de `loadConfig`/`defaultConfig`, já re-exportados e já consumidos por `apps/cli/tests`); `apps/desktop` consome esse re-export. `@atlas/contracts` fica com diff vazio e `apps/desktop/package.json` fica inalterado.
- **Porquê**: o **ADR-0003** e a Regra de Dependência 11 do Project Structure estabelecem `packages/core` como composition root — único package autorizado a depender de implementações dos demais — e dizem que "aplicações consomem a composição oferecida pelo Core e permanecem finas"; a alternativa "composição nas aplicações" está **explicitamente rejeitada** naquele ADR. Hoje a invariante é observável no repo (nenhum app importa implementação além de `@atlas/core`), e quebrá-la abriria precedente sem registro (Artigo 1). O re-export resolve a necessidade real — ler um catálogo inerte para o usuário escolher — pela porta que o ADR-0003 já define, sem subir o Core, sem tocar `@atlas/contracts`, sem quebrar fakes de `AtlasPlatform` e sem adicionar dependência ao app. Mais simples e mais sustentável: quando a CLI quiser `atlas persona list`, ou a fatia de permissões por GUI precisar ler catálogo/config, a porta já existe e é a mesma.
- **Fronteira registrada** (para o precedente não virar "composição na aplicação"): o re-export é limitado a **leitura de catálogo/config inerte**, consumida pela app só para exibir ou validar escolha do usuário. Continua proibido, sem ADR: app importar package que não seja `@atlas/core`/`@atlas/contracts`; instanciar serviço da plataforma para **injetá-lo** em outro componente; montar/substituir wiring que vive em `createAtlas`. Registrado também nas Restrições e nas Observações.
- **Alternativa descartada (1)**: `apps/desktop` depender de `@atlas/persona` e chamar `createPersonaService()` direto (a decisão da 1ª versão desta SPEC) — apoiava-se só no Module Catalog l. 853-858 ("Persona Service é utilizado por aplicações clientes", que é mapa **lógico** de uso, não regra de dependência física) e na Regra 1, ignorando o ADR-0003/Regra 11, que governam o caso e são mais específicos. Instanciaria um **segundo** `PersonaService` fora do composition root (o `createAtlas` já cria o seu, `packages/core/src/index.ts:51`) e abriria precedente para cada app compor o que quisesse — exatamente o que o ADR-0003 rejeita. Rejeitada.
- **Alternativa descartada (2)**: expor o catálogo pela plataforma (`AtlasPlatform.personas`/`personaService`) — tocaria `@atlas/contracts` **e** o wiring de `createAtlas`, quebraria os fakes tipados de `AtlasPlatform` (padrão recorrente das SPECs 0025/0027) e exigiria **subir o Core** só para listar duas Personas inertes, sem 2º consumidor que justifique a promoção de contrato. Rejeitada por custo e acoplamento prematuro; se um dia o catálogo precisar refletir estado composto (ex.: Personas criadas pelo usuário), essa é a alternativa a reabrir — via ADR, junto com a fatia de criação.

**D5. Trocar de Persona encerra as sessões de chat vivas (ociosas); a próxima conversa nasce na Persona nova, com aviso explícito.**

- **Decisão**: `selectPersona` encerra todas as sessões vivas (devolvendo-as em `closedSessions`); o renderer limpa o transcript, anuncia a troca e abre uma sessão nova.
- **Porquê**: o `personaPrompt` é estático dentro de um Core já criado (a SPEC-0021 recompõe ao vivo **só** a fatia de memória), então um chat aberto continuaria respondendo com a identidade antiga — o usuário perceberia duas Personas ao mesmo tempo, contra o Artigo 2. Encerrar é honesto, verificável por teste e mantém a fatia sem tocar o Cognitive. Mais transparente.
- **Alternativas descartadas**: (a) aplicar a troca só a sessões futuras, deixando o chat aberto na Persona antiga — silencioso e enganoso (o seletor diria uma coisa, a conversa outra); (b) migrar a `Conversation` viva para um Core novo, preservando o histórico — tecnicamente plausível (a `Conversation` é dado, ADR-0008, e `respond` reescreve a mensagem `system`-cabeça a cada turno), mas move dados entre duas plataformas e exige raciocinar sobre o que mais o Core antigo carregava; é uma decisão maior que esta fatia, nomeada como candidato futuro no Fora do Escopo.

**D6. Id inválido é recusado antes de qualquer efeito colateral (fail-closed).**

- **Decisão**: `selectPersona` valida com `PersonaService.has(id)` antes de registrar a seleção e antes de encerrar qualquer sessão; id desconhecido rejeita com erro estruturado e deixa tudo como estava.
- **Porquê**: sem isso, um id ruim derrubaria o chat do usuário **e** deixaria a app com uma seleção que faria todo `createAtlas` seguinte falhar em `loadConfig`. A divisão "a borda antecipa a recusa, o módulo garante a invariante" já é padrão do repo (CLI/SPEC-0029). Mais sustentável.
- **Alternativa descartada**: deixar a validação só para o `createAtlas` seguinte — a falha apareceria longe da causa, depois de já ter encerrado a conversa; rejeitada.

**D7. Override explícito do chamador vence a seleção corrente.**

- **Decisão**: nas funções do bridge, `configOverride.persona` passado pelo chamador tem precedência sobre a seleção registrada.
- **Porquê**: preserva o comportamento atual de todas as funções existentes quando o chamador é explícito (nenhuma regressão nos testes/consumidores já escritos) e espelha a precedência de config do ADR-0006 (fonte mais específica vence). Mais transparente e testável.
- **Alternativa descartada**: a seleção sobrepor sempre o override — tornaria as funções do bridge não-parametrizáveis e quebraria a testabilidade que as SPECs 0031-0034 construíram.

**D8. Prioridade `Medium`.**

- **Decisão**: prioridade `Medium`.
- **Porquê**: avança a Fase 2 (segunda linha do item 2.4) e cumpre um requisito explícito do PRD (l. 135), mas a capacidade de escolher Persona já existe sem regressão na inicialização (`--persona`/`ATLAS_PERSONA`) — não há bloqueio de fase inteira nem correção/segurança em jogo. Mesmo peso da SPEC-0034, sua irmã no item 2.4.
- **Alternativa descartada**: `High` — reservada à fatia que abriu a fase (SPEC-0031); `Critical` — reservada a correção/segurança bloqueante, que não é o caso.

**D9. Turno de chat em voo bloqueia a troca — em duas camadas (renderer desabilita, bridge recusa).**

- **Decisão**: o seletor de Persona entra na serialização de turno que a SPEC-0033 já aplica à entrada e ao botão de enviar (desabilitado durante o turno); e, independentemente disso, `selectPersona` **rejeita** com erro estruturado enquanto alguma sessão estiver ocupada — `sendChatTurn` marca/desmarca a sessão em `try`/`finally`. Nenhuma seleção é registrada e nenhuma sessão é encerrada na recusa.
- **Porquê**: sem isso, trocar a Persona no meio de um `respond` (segundos, com Ollama) encerra a sessão e faz o `updateConversation` posterior lançar `ContextError: Sessão desconhecida` — o turno rejeita, os `learned` daquele turno se perdem (a gravação vem depois) e o erro aparece num transcript recém-limpo, logo abaixo de "nova conversa iniciada". A camada do renderer resolve a UX (o usuário nem tenta); a camada do bridge é a **garantia**, testável no Vitest sem Electron — a mesma lógica de fail-closed já adotada no `ConfirmPort` default. Mais transparente e mais seguro contra perda de dados.
- **Alternativas descartadas**: (a) só desabilitar o seletor no renderer — a garantia ficaria numa camada não testada, e qualquer outro chamador do canal IPC reintroduziria a corrida; (b) enfileirar a troca para depois do turno — esconderia do usuário que a troca não aconteceu ainda e exigiria máquina de estado nova no bridge, complexidade além da fatia; (c) cancelar o turno em voo — cancelamento de execução é capacidade inexistente (Task Manager, Roadmap 1.1), fora de escopo.

---

# Resultado Esperado

A janela do `@atlas/desktop` passa a oferecer **seleção de Persona em runtime**: um seletor lista as Personas disponíveis (`Jarvis`, `Assistente`), marca a ativa e permite trocar sem reiniciar a app nem passar flag/env. A escolha é aplicada a toda interação seguinte com o Core (`status`, `ask`, chat, memória) pelo caminho já existente do ADR-0010 — `createAtlas({ config: { persona } })` → `personaPrompt` —, sem que o app componha qualquer prompt de identidade. O catálogo chega ao app pelo **composition root** (`@atlas/core` re-exporta a superfície de leitura de `@atlas/persona`), preservando literalmente o ADR-0003/Regra 11: `apps/*` seguem importando implementação só de `@atlas/core`, e `@atlas/contracts` fica intocado. Trocar de Persona com um chat aberto encerra a conversa corrente e abre uma nova já na identidade escolhida, anunciando a troca na janela; enquanto um turno está em voo, a troca é bloqueada no renderer e recusada no bridge, de modo que nenhum turno é destruído no meio e nenhum fato aprendido se perde. A seleção vive em memória do main process pela sessão da app — nenhum estado persistente novo, nenhuma tensão com o Artigo 11 —, e reabrir a app volta à Persona da config. A lógica de valor (`listPersonas`/`selectPersona`) vive fora do runtime gráfico, testada no Vitest sem Electron; o renderer só pinta dados planos. É a segunda das três linhas do item 2.4 — resta a configuração de permissões por GUI —, e deixa deliberadamente para uma fatia futura, precedida de brainstorming humano e ADR, a **criação** de Personas pela interface.
