# ADR-0021 — Piper como motor de TTS local, em substituição/complemento ao Web Speech API

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-07-29

---

# Contexto

A [SPEC-0035](../implementation/specs/SPEC-0035-desktop-voice-output-tts.md) entregou saída de voz (TTS) no `apps/desktop` sobre a Web Speech API embutida no Chromium (`window.speechSynthesis`), deliberadamente **sem runtime nova** — decisão registrada explicitamente naquela SPEC como o menor raio de mudança possível. A [SPEC-0036](../implementation/specs/SPEC-0036-desktop-tts-local-voice-only.md) endureceu essa fatia para só usar vozes marcadas `localService === true`, fail-closed, nunca caindo numa voz de rede. O [ADR-0020](ADR-0020-persona-persistence-voice-binding.md) foi além, vinculando `Persona.voiceURI?` a uma dessas vozes locais do SO.

Na prática, essas vozes — inclusive as variantes "Enhanced"/"Premium" do macOS, baixadas via Ajustes do Sistema → Acessibilidade → Conteúdo Falado — soam roboticamente aquém do que motores de TTS neural mais recentes entregam. O usuário ouviu amostras do [Piper](https://github.com/OHF-Voice/piper1-gpl) (motor de TTS neural leve, 100% local, sem dependência de GPU) e aprovou a voz `pt_BR-faber-medium` como substituta viável.

Diferente da SPEC-0035/0036, que reusaram uma capacidade **já embutida** no runtime do Electron, adotar o Piper introduz uma **dependência de execução nova**: um binário nativo por plataforma + arquivos de modelo de voz (`.onnx` + `.onnx.json`, alguns MB a dezenas de MB cada) que não vêm com o Chromium. Isso é exatamente o tipo de mudança que a Emenda v1.1 da Constituição classifica como escalação obrigatória (ADR novo, decisão humana) — não cabe decidir isso implicitamente numa SPEC.

---

# Decisão

**(a) Piper roda como subprocesso local, invocado só pelo main process do Electron — nunca pelo renderer.** Mesma fronteira de segurança já em vigor (`contextIsolation: true`, `nodeIntegration: false`, Artigo 4 + ADR-0019): o binário e os caminhos de modelo são um detalhe do main process, exposto ao renderer só por IPC, no molde exato dos canais `'atlas:*'` já existentes. Reusa o padrão de subprocesso já validado em `packages/tools/src/git-port.ts` (SPEC-0028) — execução via `execFile`/`spawn` **injetável**, porta narrow, nenhuma string do usuário interpolada em shell (sempre array de argumentos, nunca `exec` com string concatenada).

**(b) Novo módulo local a `apps/desktop`, não Tool nova em `@atlas/tools`.** TTS continua sendo responsabilidade do Output Gateway (Persona Service controla "voz", `packages/persona`), não uma ação planejada/executada pelo Cognitive Core — o botão "🔊 Ouvir" é acionado manualmente pelo usuário, não pelo Planner. Criar uma Tool exigiria o Runtime/Permission Service julgarem uma "ação" que não é uma ação de negócio, e o Cognitive Core passaria a conhecer voz — contra o Artigo 7 (a Persona, incluindo voz, é invisível ao Cognitive). Confinado a `apps/desktop/src/piper-tts.ts` (novo), reusando a mesma interface `SpeechSynthesisPort`-like já definida em `speech-output.ts` — troca de backend, não de contrato.

**(c) Web Speech API (SPEC-0035/0036) permanece como fallback fail-closed — nunca removida.** Se o binário do Piper ou o modelo de voz referenciado não estiver disponível (não instalado, caminho inválido, subprocesso falhou), `speak` cai para a seleção determinística já existente (1ª voz local do SO), preservando a garantia de nunca ficar mudo por causa da dependência nova e nunca degradar para uma voz de rede. Piper vira a **primeira** camada de preferência; a hierarquia de fallback do ADR-0020(b) (Persona → 1ª voz local) ganha o Piper como camada anterior a ambas.

**(d) `Persona.voiceURI?` é reinterpretado, não duplicado.** Em vez de um campo paralelo, `voiceURI` passa a aceitar tanto o `voiceURI` de uma `SpeechSynthesisVoice` (formato atual) quanto um identificador de modelo Piper (ex. `piper:pt_BR-faber-medium`, prefixo explícito para desambiguar as duas origens sem inspecionar o disco). O resolvedor de voz (`speech-output.ts`) tenta primeiro casar contra os modelos Piper instalados; sem match, cai no comportamento atual (voz do SO). Personas custom já persistidas (SPEC-0039) com um `voiceURI` de SO continuam funcionando sem migração.

---

# Decisões de produto (resolvidas em 2026-07-29)

1. **Distribuição: empacotada no instalador.** O binário Piper e o catálogo de modelos de voz PT-BR entram nos recursos do Electron (`extraResources`), sem download sob demanda — aumenta o tamanho do instalador, mas mantém a instalação 100% offline desde o primeiro uso, sem depender de rede em nenhum momento (nem na configuração inicial).
2. **Catálogo completo de vozes PT-BR, não só `faber`.** O painel de Persona (SPEC-0039) lista todos os modelos Piper PT-BR empacotados, não uma única voz fixa — `faber` fica como default sugerido, não como único disponível.
3. **Personas embutidas (`jarvis`/`neutral`) também passam a usar Piper por padrão.** Onde antes caíam na 1ª voz local do SO (SPEC-0036), passam a apontar para um modelo Piper default — sujeito ao mesmo fallback fail-closed do item (c) acima se o binário/modelo faltar.

---

# Nota de desempenho — latência esperada

Levantada antes da implementação, para orientar a SPEC:

- **Síntese em si não é o gargalo.** Modelos `medium` do Piper rodam com RTF (real-time factor) ~0.1–0.3x em CPU comum — gerar 3s de áudio leva bem menos que 3s de processamento.
- **O custo real é o overhead por chamada** — subir o subprocesso e carregar o modelo `.onnx` do zero a cada "Ouvir" soma dezenas a centenas de ms, perceptível frente à Web Speech API (já residente no processo do Chromium, início quase instantâneo). **Mitigação obrigatória na SPEC:** manter um processo Piper de longa duração (modo streaming por stdin, sem recarregar o modelo a cada frase) — molde análogo à sessão de chat viva da SPEC-0033, não um subprocesso por utterance.
- **Piper não toca áudio sozinho** — devolve bytes WAV; precisa de um player explícito no lado do Electron (ex. `<audio>` no renderer alimentado por IPC). Sem streaming de playback, o usuário espera a síntese completa antes do início do áudio — imperceptível para respostas curtas de chat, mas é uma peça de design que a SPEC precisa decidir explicitamente (buffer completo vs. streaming incremental).
- Estimativa de referência (a validar na implementação real, não assumir): com processo quente, algo na casa de **~100–300ms** de overhead adicional por resposta frente ao Web Speech API atual.

---

# Consequências

Positivas:

- Resolve o problema relatado (vozes robóticas) com um motor comprovadamente melhor, sem abrir mão da garantia offline — Piper roda sem rede, então a garantia da SPEC-0036 fica **mais forte** (não depende mais de o SO reportar `localService` corretamente, um risco que a própria SPEC-0036 já documentava como ressalva).
- Reusa dois padrões já validados no repo: subprocesso local injetável (`git-port.ts`) e porta de saída de voz já isolada do domínio de negócio (`speech-output.ts`) — nenhum módulo novo no Module Catalog, nenhuma Tool nova.
- Fallback preserva 100% da garantia comportamental das SPECs 0035/0036 — quem não configurar Piper não percebe nenhuma mudança.

Custos e riscos:

- Primeira dependência de execução binária nativa empacotada com o app desktop (fora do próprio Electron) — superfície nova de falha por plataforma (macOS/Windows/Linux podem exigir binários distintos) e possivelmente assinatura/notarização adicional no build do instalador (fora do escopo deste ADR, mas relevante para a SPEC).
- Aumenta o tamanho de distribuição do app (binário + ao menos 1 modelo de voz).
- Duplicação deliberada renderer↔main já é um atrito conhecido do TTS (SPEC-0035/0036); Piper roda inteiro no main (não no renderer), então essa duplicação específica não cresce — mas o glue de seleção de voz no renderer precisa aprender a listar também as vozes Piper disponíveis (consultadas por IPC, não mais só `window.speechSynthesis.getVoices()`).

---

# Alternativas Consideradas

**Vozes de nuvem (ElevenLabs, Google/Azure Neural).** Rejeitada: quebra a garantia offline-only que foi requisito explícito e testado da SPEC-0036 (fail-closed, nunca voz de rede) — o usuário não pediu para relaxar essa garantia, só para melhorar a qualidade dentro dela.

**Expor Piper como Tool executável pelo Planner (`speak_text`).** Rejeitada: TTS aqui é saída manual sob controle direto do usuário (botão "Ouvir"), não uma ação que o Cognitive Core decide tomar — criar uma Tool obrigaria o Cognitive a conhecer "voz", contra o Artigo 7, e o Permission Service a julgar uma ação sem risco real de dado (não lê/escreve nada do usuário).

**Substituir Web Speech API por completo (sem fallback).** Rejeitada: reduz a resiliência sem necessidade — se o binário/modelo faltar numa máquina, a app ficaria muda em vez de degradar para a voz do SO já validada nas SPECs 0035/0036.

**Novo módulo dedicado (`packages/voice` ou similar).** Rejeitada nesta fatia pelo mesmo motivo do ADR-0020: TTS já está catalogado como responsabilidade do Persona Service ("voz" nos "Deve controlar") + Output Gateway (`apps/desktop`); criar um módulo novo duplicaria responsabilidade já catalogada, contra o Artigo 4.

---

# Candidatos futuros (fora desta fatia)

- **Vozes femininas PT-BR**, se/quando o catálogo público do Piper (ou variantes PT-PT compatíveis) oferecer alguma — nenhuma decisão de arquitetura nova necessária, é só ampliar o catálogo empacotado da Decisão de produto (2).
- **Treinar uma voz própria (voice cloning/fine-tuning)** via `piper-training` (VITS). Natureza de trabalho distinta de engenharia de produto — exige dataset de áudio+texto (idealmente 1-2h+ de fala limpa e consentida) e treinamento de rede neural offline, fora do runtime do Atlas; o resultado seria só mais um `.onnx` a entrar no catálogo já previsto por este ADR, sem mudança estrutural adicional. Não bloqueia a integração atual do Piper.

---

# Observações

- **Nota de correção editorial (2026-07-29, gate da SPEC-0040 — não altera a Decisão).** As citações constitucionais nas linhas 25 (Decisão (b)) e 72 (Alternativas Consideradas, "Expor Piper como Tool") atribuem ao **Artigo 7** a regra de que a Persona (incluindo voz) é invisível ao Cognitive Core. Na Constituição v1.1, essa regra é o **Artigo 2** ("O usuário interage com apenas uma Persona") em conjunto com o **Artigo 9** ("Especialização deve permanecer invisível"); o **Artigo 7** é "Transparência é obrigatória". O raciocínio e a decisão registrados permanecem válidos e inalterados — só a numeração citada está errada. A [SPEC-0040](../implementation/specs/SPEC-0040-desktop-piper-neural-tts.md) usa a numeração correta.
- **Nota de implementação (2026-07-29, SPEC-0040 concluída — não altera a Decisão).** O que este ADR deixou como estrutural (a/b/c/d, decisões de produto 1-3, mitigação obrigatória de latência) foi consumido integralmente pela [SPEC-0040](../implementation/specs/SPEC-0040-desktop-piper-neural-tts.md): processo Piper de longa duração em `apps/desktop/src/piper-tts.ts`, catálogo de vozes exposto por IPC ao lado das vozes do SO, `Persona.voiceURI?` reinterpretado (`piper:<id>`) sem alterar `@atlas/persona`, e a Web Speech API preservada como fallback fail-closed. O **contrato técnico exato** — versão pinada do binário, argv de invocação, esquema da linha JSON de stdin, sinal de conclusão, timeout e framing da utterance, esquema real do `.onnx.json`, playback e resolução dos recursos em disco — é dado inteiramente pela SPEC-0040 (Decisões D4/D9/D10/D13), não duplicado aqui: esta é a única fonte de verdade para esse nível de detalhe, para não haver dois lugares a manter sincronizados.
