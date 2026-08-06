# ADR-0022 — `whisper.cpp` como motor de STT local para a entrada por voz do desktop

> **Project Atlas — Architecture Decision Record**

Status: Accepted

Data: 2026-08-01

---

# Contexto

O PRD exige interação por voz (*Requisitos Funcionais → Comunicação*: "O sistema deve permitir interação por voz") e lista "suporte básico à voz" no *Escopo Inicial*. Até aqui, só a metade de **saída** dessa exigência foi entregue: TTS pelas SPECs [0035](../implementation/specs/SPEC-0035-desktop-voice-output-tts.md)/[0036](../implementation/specs/SPEC-0036-desktop-tts-local-voice-only.md) (Web Speech API restrita a vozes locais, fail-closed), [0039](../implementation/specs/SPEC-0039-desktop-persona-authoring.md) ([ADR-0020](ADR-0020-persona-persistence-voice-binding.md)) e [0040](../implementation/specs/SPEC-0040-desktop-piper-neural-tts.md)/[0041](../implementation/specs/SPEC-0041-desktop-piper-only-voice-surface.md)/[0043](../implementation/specs/SPEC-0043-desktop-voice-residues.md) ([ADR-0021](ADR-0021-piper-tts-local-voice-engine.md), Piper como motor neural local). A metade de **entrada** — reconhecimento de fala (STT) — nunca foi entregue, e é o item 2.3-restante do [Roadmap](../04-engineering/Roadmap.md), o último candidato direto em aberto da Fase 2.

A [SPEC-0035](../implementation/specs/SPEC-0035-desktop-voice-output-tts.md) já havia registrado essa lacuna como **escalação E1**: "Entrada por voz (STT) … depende de escolha de motor (ADR novo) e de permissão de microfone". A [SPEC-0046](../implementation/specs/SPEC-0046-desktop-voice-input-stt.md) desenhou a fatia inteira — captura, permissão, fluxo, verificação sem hardware — e isolou como única pergunta humana exatamente esta: **qual motor de reconhecimento, e como ele é distribuído**.

Assim como no ADR-0021, adotar um motor de STT introduz uma **dependência de execução binária nova**: um binário nativo por plataforma mais um arquivo de modelo, que não vêm com o Chromium. É a classe de mudança que a Emenda v1.1 da Constituição reserva à decisão humana — não cabe decidir implicitamente numa SPEC.

Este ADR é a **aplicação simétrica do ADR-0021 ao sentido oposto do fluxo**. Todo o padrão estrutural já foi decidido e validado lá: motor local sem rede, subprocesso invocado só pelo main process com executor injetável e argv em array, resolução de recursos em três níveis, artefato temporário efêmero, fallback fail-closed. Este ADR não reabre nada disso — fixa apenas o motor, o modelo e a distribuição.

---

# Decisão

**(a) O motor de STT é o `whisper.cpp`, invocado como subprocesso local, só pelo main process do Electron — nunca pelo renderer.** Mesma fronteira de segurança em vigor desde o [ADR-0019](ADR-0019-desktop-electron-stack.md) (`contextIsolation: true`, `nodeIntegration: false`) e mesma formulação do ADR-0021(a): o binário e os caminhos de modelo são detalhe do main process, expostos ao renderer só por IPC nos canais `'atlas:*'`. Execução por `spawn`/`execFile` **injetável**, sempre com array de argumentos, nunca `exec` com string concatenada — padrão validado em `packages/tools/src/git-port.ts` (SPEC-0028) e em `apps/desktop/src/piper-tts.ts` (SPEC-0040).

**(b) Módulo local a `apps/desktop`, não Tool em `@atlas/tools` nem package novo.** A entrada por voz é responsabilidade do **Input Gateway**, que o Module Catalog localiza na aplicação cliente e que já lista "voz" entre as entradas aceitas. Não é ação de negócio planejada pelo Cognitive Core: o usuário aperta um botão para ditar, o Planner não decide "transcrever". Criar uma Tool obrigaria Runtime e Permission Service a julgar uma ação que não é de negócio, e o Cognitive Core passaria a conhecer modalidade de entrada — contra os Artigos 2 e 9 (o mecanismo é invisível ao usuário; a modalidade não muda a capacidade). Confinado a `apps/desktop/src/stt-engine.ts` (novo), espelho estrutural de `piper-tts.ts`.

**(c) Nenhuma chamada de rede, em nenhum caminho — sem exceção.** A garantia offline endurecida pela SPEC-0036 e pelo ADR-0021 vale integralmente no lado da entrada, e **não** é relaxada por conveniência de distribuição: não há download sob demanda de binário nem de modelo, nem no primeiro uso, nem atrás de consentimento. Sem motor ou sem modelo, a app degrada — o botão de microfone fica **desabilitado com aviso do motivo**, nunca ativo-porém-mudo (achado A2 da SPEC-0035), e nunca cai num serviço de reconhecimento remoto.

**(d) Nada de áudio ou transcrição é persistido.** O único artefato em disco é um `.wav` temporário gerado no main process, sempre removido — inclusive em erro, timeout e cancelamento. Áudio não vai para memória, log, telemetria nem armazenamento de diagnóstico (Artigo 11: só o Memory Service persiste; e gravação de voz é o dado mais sensível que a app já manipulou).

---

# Decisões de produto (resolvidas em 2026-08-01)

1. **Distribuição: empacotada no instalador.** O binário do `whisper.cpp` e o modelo entram nos recursos do Electron (`extraResources`), exatamente como o Piper na Decisão de produto (1) do ADR-0021. Aumenta o tamanho do instalador, e mantém a instalação 100% offline desde o primeiro uso. **A alternativa de download sob demanda foi explicitamente recusada** — ela exigiria abrir uma exceção à Decisão (c), e essa exceção não foi concedida.
2. **Modelo default: `small`, quantizado.** Um único modelo empacotado, escolhido pelo equilíbrio qualidade × latência × MB. **Sem catálogo multi-modelo nesta fatia** — diferente do Piper, cujo catálogo de vozes PT-BR existe porque a escolha de *voz* é preferência estética do usuário; a escolha de *modelo de reconhecimento* não é preferência, é trade-off técnico, e expor essa escolha na UI seria vazar detalhe interno de arquitetura ao usuário (Restrição do PRD). Ampliar para catálogo é extensão futura sem mudança estrutural.
3. **Idioma fixado em PT-BR (`-l pt`), sem autodetecção.** Mesmo raciocínio que fixou o catálogo Piper em PT-BR: determinismo e previsibilidade. Autodetecção de idioma introduziria uma decisão não determinística no meio de um caminho que precisa ser verificável sem hardware, e degradaria o reconhecimento de português quando o áudio for curto ou ruidoso.

---

# Nota de desempenho — latência esperada

Levantada antes da implementação, para orientar a SPEC:

- O custo é dominado pelo **carregamento do modelo** e pela inferência sobre o buffer completo. Modelos `small` quantizados transcrevem alguns segundos de fala em CPU comum na casa de poucos segundos.
- **Diferente do ADR-0021, não se exige processo de longa duração.** A mitigação obrigatória lá existia porque o TTS é acionado com frequência sobre respostas curtas, onde a recarga do modelo dominava o tempo total. A transcrição é acionada uma vez por fala, já precedida de segundos de gravação — o overhead relativo é muito menor, e um processo residente segurando o modelo na RAM por toda a sessão é custo permanente por benefício ocasional (Artigo 14). A porta de subprocesso é injetada, então trocar essa escolha depois é local.
- **Consequência de design que a SPEC precisa fixar explicitamente:** como a transcrição só começa ao fim da gravação, o usuário espera. Isso torna obrigatórios um **teto de duração de gravação** e um **timeout de transcrição**, ambos com desfecho fail-closed — pinados como dado na [SPEC-0046](../implementation/specs/SPEC-0046-desktop-voice-input-stt.md).

---

# Consequências

Positivas:

- **Nenhum padrão arquitetural novo é introduzido.** A fatia inteira é a aplicação do ADR-0021 ao sentido oposto do fluxo: mesmo molde de subprocesso, mesma resolução de recursos em três níveis, mesmo tratamento de artefato temporário, mesma disciplina fail-closed. É a extensão mais barata possível de uma decisão já paga e já validada em produção no repo.
- Preserva integralmente a garantia offline, que passa a valer nas duas pontas da voz — entrada e saída.
- Nenhum módulo novo no Module Catalog, nenhuma Tool nova, nenhum campo novo em `Persona`, nenhuma alteração em `packages/*` nem em `@atlas/contracts`.
- Qualidade de reconhecimento em português substancialmente melhor que a das alternativas locais — a mesma lógica que levou o Piper a substituir as vozes do SO no lado da saída.

Custos e riscos:

- **Segunda dependência binária nativa empacotada** com o app desktop (a primeira foi o Piper). A superfície de build por plataforma — binários distintos para macOS/Windows/Linux, possivelmente assinatura/notarização adicional — já estava aberta pelo ADR-0021, mas agora dobra de tamanho.
- **Instalador maior**: soma-se ao binário e às vozes do Piper um segundo binário mais um modelo `small` quantizado (dezenas a centenas de MB).
- **Latência perceptível** entre encerrar a gravação e ver o texto, inerente à transcrição por buffer completo sem processo quente. Mitigável depois; não mitigada agora, por decisão explícita.
- **Permissão de microfone** vira uma superfície nova de falha por plataforma (diálogo do SO em macOS, `NSMicrophoneUsageDescription` no app empacotado) — tratada na SPEC, e o empacotamento fica para a Fase 3, mesmo enquadramento que o ADR-0021 deu ao Piper.

---

# Alternativas Consideradas

**`vosk` (modelo pequeno PT-BR, streaming nativo).** Rejeitada: modelos bem menores (~50 MB) e streaming de fábrica — o que abriria caminho barato para ditado ao vivo e, mais tarde, para wake word — mas a qualidade de reconhecimento em PT-BR é notavelmente inferior à do Whisper, e a integração idiomática é por binding nativo do Node, uma superfície de build diferente do padrão "binário + argv" já validado duas vezes no repo. Trocar qualidade e aderência ao padrão existente por tamanho de download não passa no teste da Constituição.

**Whisper em WASM no renderer (`transformers.js` ou build WASM do `whisper.cpp`).** Rejeitada: dispensaria o binário nativo, mas colocaria modelo e inferência no processo **sem privilégio**, contra a Decisão (a) e o molde do ADR-0021(a); pesaria o processo de UI durante a transcrição; e o modelo precisaria ser embutido ou baixado de qualquer forma, então o custo de distribuição não desaparece — só muda de lugar, com desempenho substancialmente pior.

**`SpeechRecognition` da Web Speech API do Chromium.** Rejeitada **de plano — não é opção real**. Ela teria custo zero de dependência, mas no Chromium a implementação envia o áudio a um serviço de reconhecimento **remoto**: quebraria frontalmente a garantia offline que a SPEC-0036 endureceu e testou (fail-closed, nunca rede) e que o ADR-0021 reafirmou. Além disso, no Electron a API sequer é funcional sem credencial de serviço própria. Registrada aqui apenas para constar que foi avaliada e por que jamais deve ser reconsiderada sem mudança explícita da garantia offline.

**Novo módulo dedicado (`packages/voice` ou similar), unificando entrada e saída de voz.** Rejeitada nesta fatia pelo mesmo motivo dos ADRs 0020 e 0021: o Module Catalog já atribui a entrada por voz ao **Input Gateway** (na aplicação cliente) e a saída ao **Output Gateway**/Persona Service; "Voice Service" está na lista de *componentes futuros previstos*, cuja criação exige o Architecture Decision Process. Com um único consumidor real (`apps/desktop`), o package seria indireção pura, contra o Artigo 4. Se e quando uma segunda aplicação precisar de voz, a promoção terá base factual (precedente ADR-0007).

**Enviar automaticamente ao Core o texto transcrito.** Rejeitada como parte desta decisão, e não apenas como detalhe de UI: transcrição é falível e um turno de chat pode acionar Tools. Auto-envio deixaria um erro de reconhecimento virar instrução ao Cognitive Core sem revisão humana — contra o Artigo 7 e o Artigo 13, e contra a Restrição do PRD de não executar sem autorização adequada. O texto sempre aterrissa no campo de entrada.

> **⚠️ Cláusula parcialmente superseded pelo [ADR-0023](ADR-0023-hands-free-voice-conversation.md) (2026-08-05).** O auto-envio passa a ser permitido **exclusivamente dentro do modo hands-free** ali definido — opt-in explícito, desligado por default, com microfone fechado durante o processamento e a fala. O argumento acima foi revisto num ponto: ele tratou *auto-envio* e *execução não autorizada* como o mesmo risco, e eles não são o mesmo — o `ConfirmPort` (ADR-0013) continua guardando toda Tool destrutiva, então o pior desfecho de uma transcrição errada é uma resposta errada, não um efeito colateral. **Fora do modo hands-free, esta cláusula vale sem alteração:** no push-to-talk da SPEC-0046, o texto continua sempre aterrissando no campo de entrada. Todo o resto deste ADR — Decisões (a)–(d) e as três Decisões de produto — permanece em vigor, intocado.

---

# Candidatos futuros (fora desta fatia)

- **Wake word / ativação por voz.** O Roadmap (l. 157) a marca como "candidato, não comprometido". Exige microfone permanentemente ligado e um motor de **detecção** distinto do de transcrição — decisão de privacidade de natureza própria, ADR próprio.
- **Ditado ao vivo (transcrição incremental)** e **processo de longa duração** para eliminar a recarga do modelo — ambos locais à porta injetada, sem mudança estrutural.
- **Catálogo multi-modelo** (`base`/`small`/`medium`), se a qualidade ou a latência do default se mostrarem insuficientes em uso real — é só ampliar o conjunto empacotado da Decisão de produto (1).

---

# Observações

- **Nota de escopo.** O **contrato técnico exato** — versão pinada do binário, argv de invocação, layout dos recursos em disco, formato do WAV de entrada, forma de leitura da transcrição, tetos de duração e timeout, e comportamento de cancelamento — é dado inteiramente pela [SPEC-0046](../implementation/specs/SPEC-0046-desktop-voice-input-stt.md) (Decisão D12 e a seção *Contrato do binário*), **não** duplicado aqui: essa é a única fonte de verdade para esse nível de detalhe, para não haver dois lugares a manter sincronizados. Mesmo enquadramento que o ADR-0021 adotou em relação à SPEC-0040.
- Este ADR resolve formalmente a **escalação E1** registrada na SPEC-0035 e reapresentada pela SPEC-0046.
- **Nota de implementação (2026-08-01, SPEC-0046 concluída — não altera a Decisão).** O que este ADR deixou como estrutural (a/b/c/d, decisões de produto 1-3, nota de desempenho) foi consumido integralmente pela [SPEC-0046](../implementation/specs/SPEC-0046-desktop-voice-input-stt.md): motor `whisper.cpp` invocado como subprocesso por chamada (sem processo de longa duração, divergência deliberada do Piper) em `apps/desktop/src/stt-engine.ts`, janela de captura com watchdog e rearme (`apps/desktop/src/media-permission.ts`) para a permissão de microfone da `session` do Electron, cinco canais IPC (`'atlas:stt:*'`), e captura no renderer por `ScriptProcessorNode`/`GainNode(0)` (sem `AudioWorkletNode`, para não introduzir arquivo de script novo nem CSP nova). O **contrato técnico exato** — versão pinada do binário, argv de invocação, layout dos recursos em disco, validação da fronteira `{pcm, sampleRate}`, formato do WAV, tabela exaustiva de dez desfechos, orçamento de timeout proporcional e regras de limpeza — é dado inteiramente pela SPEC-0046 (Decisões D12/D14/D17/D18), não duplicado aqui. Nenhum microfone ou binário real foi exercitado no shell de automação — cobertura inteira por dublês, mesma pendência de smoke já registrada para o Piper (SPEC-0040, CA 25).
