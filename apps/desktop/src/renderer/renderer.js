function renderStatus(snapshot) {
  const el = document.getElementById('status');
  el.textContent = [
    `Atlas: ${snapshot.state}`,
    `logLevel: ${snapshot.logLevel}`,
    `dataDir: ${snapshot.dataDir}`,
    `persona: ${snapshot.persona.name} (${snapshot.persona.id})`,
    `readRoots: ${snapshot.readRoots.join(', ')}`,
    `writeRoots: ${snapshot.writeRoots.length > 0 ? snapshot.writeRoots.join(', ') : '(nenhuma)'}`,
  ].join('\n');
}

// Voz preferida da Persona ativa (ADR-0020(b)/D8 do SPEC-0040) — amostrada a
// cada `loadStatus()`, usada pelo roteamento de voz abaixo (Piper vs. SO).
let activePersonaVoiceURI;

function loadStatus() {
  return window.atlas.getStatus().then((snapshot) => {
    renderStatus(snapshot);
    renderPermissionLists(snapshot.readRoots, snapshot.writeRoots);
    activePersonaVoiceURI = snapshot.persona.voiceURI;
    return snapshot;
  });
}

// Serialização compartilhada do painel de permissões (item 2.4 / SPEC-0038):
// desabilitado enquanto houver um turno de chat OU um `ask` em voo — os dois
// gestos que o renderer sabe quando disparou.
let chatTurnInFlight = false;
let askInFlight = false;

function refreshPermissionsPanelState() {
  const disabled = chatTurnInFlight || askInFlight;
  for (const id of [
    'read-root-input',
    'read-root-add',
    'write-root-input',
    'write-root-add',
    'permissions-apply',
  ]) {
    document.getElementById(id).disabled = disabled;
  }
  document
    .querySelectorAll('#read-roots-list button, #write-roots-list button')
    .forEach((button) => {
      button.disabled = disabled;
    });
  // O painel de Persona (SPEC-0039) entra na MESMA serialização de turno —
  // desabilitado enquanto houver um turno de chat/ask em voo.
  refreshPersonaPanelState();
}

// Placeholder até a definição real mais abaixo (o painel de Persona é
// declarado depois, junto do restante do CRUD) — evita depender de ordem
// textual entre os dois blocos; reatribuída antes de qualquer chamada real
// (o carregamento do `<script>` é síncrono, então a atribuição abaixo já
// ocorreu quando o primeiro evento do usuário dispara).
let refreshPersonaPanelState = () => {};

// Seletor de Persona em runtime (item 2.4 / SPEC-0037): o usuário sempre vê
// qual Persona está ativa (seletor marcado + painel de status). O seletor
// entra na mesma serialização de turno que a entrada/botão de enviar (fica
// desabilitado enquanto um turno de chat está em voo, reabilitado no
// `finally`).
const personaSelect = document.getElementById('persona-select');
const personaErrorEl = document.getElementById('persona-error');

function markActivePersona(personaId) {
  personaSelect.value = personaId;
}

function loadPersonaOptions(activePersonaId) {
  return window.atlas.persona.list().then((options) => {
    personaSelect.textContent = '';
    for (const option of options) {
      const optionEl = document.createElement('option');
      optionEl.value = option.id;
      optionEl.textContent = option.name;
      personaSelect.appendChild(optionEl);
    }
    markActivePersona(activePersonaId);
  });
}

personaSelect.addEventListener('change', () => {
  const previousPersonaId = personaSelect.dataset.activePersonaId;
  const chosenId = personaSelect.value;
  personaErrorEl.textContent = '';
  window.atlas.persona
    .select(chosenId)
    .then(() => {
      document.getElementById('chat-transcript').textContent = '';
      appendTranscriptLine(`Persona alterada para ${chosenId} — nova conversa iniciada`);
      return window.atlas.chat.open().then((session) => {
        chatSession = session;
      });
    })
    .then(() => loadStatus())
    .then((snapshot) => {
      personaSelect.dataset.activePersonaId = snapshot.persona.id;
    })
    .catch((error) => {
      // Rejeição (id inválido ou turno em voo): transcript e conversa
      // corrente ficam intactos; o seletor volta a mostrar a Persona ativa.
      personaErrorEl.textContent = `⚠️ ${error.message ?? error}`;
      if (previousPersonaId !== undefined) {
        markActivePersona(previousPersonaId);
      }
    });
});

loadStatus().then((snapshot) => {
  personaSelect.dataset.activePersonaId = snapshot.persona.id;
  return loadPersonaOptions(snapshot.persona.id);
});

// Recarrega o seletor de topo + o painel de gerência (lista com
// Editar/Apagar) a partir do estado real — usado depois de toda mutação de
// Persona (criar/editar/apagar/trocar), nunca deixando as duas listas
// divergentes.
function refreshPersonaSurfaces() {
  return loadStatus().then((snapshot) => {
    personaSelect.dataset.activePersonaId = snapshot.persona.id;
    return Promise.all([loadPersonaOptions(snapshot.persona.id), loadPersonaList()]);
  });
}

// Round-trip `ask` de tiro único (stateless — o Core sobe e desliga a cada
// chamada). O traço de `steps` chega já formatado (`StepLine[]`, dado
// plano); este renderer só pinta, sem conhecer `ExecutedStep`/contratos.
document.getElementById('ask-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const objective = document.getElementById('objective').value.trim();
  if (objective === '') {
    return;
  }
  const resultEl = document.getElementById('ask-result');
  resultEl.textContent = 'Perguntando…';
  askInFlight = true;
  refreshPermissionsPanelState();
  window.atlas
    .ask(objective)
    .then((snapshot) => {
      const lines = [];
      for (const step of snapshot.steps) {
        const marker = step.denialKind !== undefined ? ` [${step.denialKind}]` : '';
        lines.push(`🔧 ${step.tool} → ${step.outcome}${marker}`);
      }
      if (lines.length > 0) {
        lines.push('');
      }
      lines.push(snapshot.text);
      for (const fact of snapshot.learned) {
        lines.push(`💡 lembrado: ${fact}`);
      }
      resultEl.textContent = lines.join('\n');
    })
    .finally(() => {
      askInFlight = false;
      refreshPermissionsPanelState();
    });
});

// Chat visual multi-turno (item 2.2): o Core é mantido vivo no main process
// entre turnos — a `session` é um handle opaco (string), o `Conversation`
// nunca cruza o IPC. O renderer só pinta o `TurnSnapshot` plano que chega
// (reply/steps/learned); um turno por vez (entrada desabilitada em voo).
let chatSession = null;

// Saída de voz (TTS, item 2.3), endurecida pela SPEC-0036 para garantir voz
// 100% local: adapter local sobre a Web Speech API do Chromium (glue de
// navegador, não testado em unidade — não coberto pelo Vitest, que roda sem
// sessão gráfica/DOM).
//
// Nota de arquitetura: `renderer.js` é um `<script>` clássico carregado por
// `window.loadFile` (sem `type="module"`, sem bundler — ADR-0019), não pode
// `import` o módulo TypeScript `src/speech-output.ts` (que só é consumido
// pelo Vitest, via o mesmo hook `tsx` usado pelo main process). Por isso a
// função abaixo replica deliberadamente, em JS puro, o mesmo algoritmo
// testado em `tests/speech-output.test.ts` (`createSpeechOutput`):
// normaliza o texto, no-op em vazio, filtra vozes para só `localService ===
// true`, seleciona deterministicamente a primeira, cancela a fala anterior
// antes de iniciar a próxima, fail-safe (nunca lança), `isAvailable` sse
// existir ≥1 voz local. Sem voz local ⇒ no-op, jamais fallback para voz de
// rede. Qualquer mudança de comportamento deve ser espelhada nos dois
// lugares.
const synth = {
  speak(spec) {
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(
      (candidate) => candidate.voiceURI === spec.voiceURI && candidate.localService === true,
    );
    if (voice === undefined) {
      // Voz local sumiu entre a seleção e a fala: fail-closed, não fala
      // (jamais fallback para a voz padrão/de rede do Chromium).
      return;
    }
    const utterance = new SpeechSynthesisUtterance(spec.text);
    utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  },
  cancel() {
    window.speechSynthesis.cancel();
  },
  getVoices() {
    if (window.speechSynthesis === undefined) {
      return [];
    }
    return window.speechSynthesis.getVoices().map((voice) => ({
      voiceURI: voice.voiceURI,
      name: voice.name,
      localService: voice.localService,
    }));
  },
};

// Seleciona deterministicamente a primeira voz local (ordem de
// `getVoices()`) — espelha `selectLocalVoiceURI` de `speech-output.ts`,
// verificado em `tests/speech-output.test.ts`.
function selectLocalVoiceURI(synth) {
  const voices = synth.getVoices();
  const localVoice = voices.find((voice) => voice.localService === true);
  return localVoice === undefined ? undefined : localVoice.voiceURI;
}

function createSpeechOutputGlue({ synth }) {
  return {
    speak(text) {
      const normalized = text.trim().replace(/\s+/g, ' ');
      if (normalized === '') {
        return;
      }
      try {
        const voiceURI = selectLocalVoiceURI(synth);
        if (voiceURI === undefined) {
          // Sem voz local disponível: fail-closed, nunca fala por voz de rede.
          return;
        }
        synth.cancel();
        synth.speak({ text: normalized, voiceURI });
      } catch {
        // fail-safe: nunca propaga para o fluxo do chat
      }
    },
    cancel() {
      try {
        synth.cancel();
      } catch {
        // fail-safe: nunca propaga
      }
    },
    isAvailable() {
      try {
        return selectLocalVoiceURI(synth) !== undefined;
      } catch {
        return false;
      }
    },
  };
}

const speechOutput = createSpeechOutputGlue({ synth });

// Roteamento de voz Piper × SO (SPEC-0040, ADR-0021, Decisões D7/D8/D9):
// replica pura de `isPiperVoiceURI`/`resolveVoiceBackend` de
// `speech-output.ts` (mesma duplicação deliberada renderer↔módulo já
// documentada nas SPECs 0035/0036/0039 — a versão testada é
// `tests/speech-output.test.ts`, critérios 17-21). `piperVoices` é o
// catálogo Piper chegado por IPC (`window.atlas.tts.voices()`), assíncrono e
// independente do `voiceschanged` do Chromium (D17) — populado abaixo.
const PIPER_VOICE_PREFIX = 'piper:';
let piperVoices = [];

// Disponibilidade real do Piper (SPEC-0041): `PiperTts.isAvailable()` por
// IPC (arquivo do binário presente + catálogo não vazio; não sonda o
// binário) — valor inicial `false`, o lado seguro, antes da resposta chegar.
let piperAvailable = false;

function isPiperVoiceURI(voiceURI) {
  return typeof voiceURI === 'string' && voiceURI.startsWith(PIPER_VOICE_PREFIX);
}

// Política de superfície Piper-only (SPEC-0041, Decisão D3): replica pura de
// `isPiperOnlyMode`/`piperOnlyPreference` de `speech-output.ts` (mesma
// duplicação deliberada renderer↔módulo já documentada nas SPECs
// 0035/0036/0039/0040 — 6ª ocorrência; versão testada em
// `tests/speech-output.test.ts`). Único ponto de decisão: `isPiperOnlyMode`
// governa tanto o roteamento (`currentVoiceBackend`) quanto o `<select>`
// (`populatePersonaVoiceSelect`), nunca duas checagens independentes.
function isPiperOnlyMode({ piperAvailable, piperVoiceURIs }) {
  return piperAvailable === true && piperVoiceURIs.length > 0;
}

function piperOnlyPreference({ preferredVoiceURI, piperAvailable, piperVoiceURIs }) {
  if (!isPiperOnlyMode({ piperAvailable, piperVoiceURIs })) {
    return preferredVoiceURI;
  }
  return preferredVoiceURI !== undefined && isPiperVoiceURI(preferredVoiceURI)
    ? preferredVoiceURI
    : undefined;
}

// Catálogo de vozes Piper efetivamente OFERECIDO ao usuário — vazio em modo
// degradado (Decisão D8). Único ponto derivado, consumido tanto pelo
// roteamento quanto pelo `<select>` do formulário de Persona.
function offeredPiperVoices() {
  return isPiperOnlyMode({ piperAvailable, piperVoiceURIs: piperVoices.map((v) => v.voiceURI) })
    ? piperVoices
    : [];
}

function resolveVoiceBackend({
  preferredVoiceURI,
  piperVoiceURIs,
  localVoiceURIs,
  defaultPiperVoiceURI,
}) {
  if (preferredVoiceURI !== undefined) {
    if (piperVoiceURIs.includes(preferredVoiceURI)) {
      return { backend: 'piper', voiceURI: preferredVoiceURI };
    }
    if (localVoiceURIs.includes(preferredVoiceURI)) {
      return { backend: 'os', voiceURI: preferredVoiceURI };
    }
  }
  if (defaultPiperVoiceURI !== undefined && piperVoiceURIs.includes(defaultPiperVoiceURI)) {
    return { backend: 'piper', voiceURI: defaultPiperVoiceURI };
  }
  if (localVoiceURIs.length > 0) {
    return { backend: 'os', voiceURI: localVoiceURIs[0] };
  }
  return { backend: 'none' };
}

// Default de modelo Piper (Decisão D9): `pt_BR-faber-medium` se instalado,
// senão o primeiro por ordem de `id`. Só o renderer tem, ao mesmo tempo, o
// catálogo Piper e a preferência de Persona — resíduo sem cobertura
// automatizada, mesma classe do roteamento replicado já documentada nas
// SPECs 0035/0036/0039.
function computeDefaultPiperVoiceURI(voices) {
  if (voices.length === 0) {
    return undefined;
  }
  const preferred = voices.find((voice) => voice.id === 'pt_BR-faber-medium');
  if (preferred !== undefined) {
    return preferred.voiceURI;
  }
  const sorted = [...voices].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted[0].voiceURI;
}

// SPEC-0041: alimenta `resolveVoiceBackend` (INALTERADO) com
// `piperOnlyPreference(...)` no lugar de `activePersonaVoiceURI` cru, e com
// o catálogo Piper OFERECIDO (`offeredPiperVoices()`) no lugar do catálogo
// cru — réplica pura, mesmo teste de referência apontado acima.
function currentVoiceBackend() {
  const offered = offeredPiperVoices();
  return resolveVoiceBackend({
    preferredVoiceURI: piperOnlyPreference({
      preferredVoiceURI: activePersonaVoiceURI,
      piperAvailable,
      piperVoiceURIs: piperVoices.map((voice) => voice.voiceURI),
    }),
    piperVoiceURIs: offered.map((voice) => voice.voiceURI),
    localVoiceURIs: synth
      .getVoices()
      .filter((voice) => voice.localService === true)
      .map((voice) => voice.voiceURI),
    defaultPiperVoiceURI: computeDefaultPiperVoiceURI(offered),
  });
}

// Playback do WAV devolvido pelo Piper (D5): `Blob`/`URL.createObjectURL`
// num `<audio>` (via `Audio`), buffer completo, `objectURL` revogado ao fim.
function playPiperAudio(audio) {
  try {
    const blob = new Blob([audio.wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const player = new Audio(url);
    const revoke = () => URL.revokeObjectURL(url);
    player.addEventListener('ended', revoke);
    player.addEventListener('error', revoke);
    void player.play();
  } catch {
    // fail-safe: nunca propaga
  }
}

// Roteador único usado tanto pelo botão "🔊 Ouvir" quanto por "Testar voz"
// com a voz da Persona ativa: decide a origem e fala por ela; se o backend
// Piper devolver ausência de áudio (indisponível/erro/timeout), cai no
// `speechOutput` do SO — fallback fail-closed (ADR-0021(c)).
function speakText(text) {
  const backend = currentVoiceBackend();
  if (backend.backend === 'piper') {
    window.atlas.tts
      .speak(text, backend.voiceURI)
      .then((audio) => {
        if (audio === undefined) {
          speechOutput.speak(text);
          return;
        }
        playPiperAudio(audio);
      })
      .catch(() => {
        speechOutput.speak(text);
      });
    return;
  }
  if (backend.backend === 'os') {
    speechOutput.speak(text);
  }
}

// Quirk conhecido do Chromium: `getVoices()` costuma devolver `[]` na
// primeira chamada, até o evento `voiceschanged` disparar de forma
// assíncrona. Um `isAvailable()` de tiro único no load do turno arriscaria
// desabilitar o botão num sistema que TEM voz (falso-negativo). Por isso a
// lista de botões "Ouvir" pendentes é reavaliada quando `voiceschanged`
// dispara (ou preguiçosamente, a cada clique) — e, desde a SPEC-0040 (D17),
// também quando o catálogo Piper chega por IPC (`loadPiperVoices` abaixo),
// gatilho independente e assíncrono do `voiceschanged`.
const pendingSpeakButtons = new Set();

function refreshSpeakButton(button) {
  const available = currentVoiceBackend().backend !== 'none';
  button.disabled = !available;
  button.title = available ? '' : 'voz indisponível neste sistema';
}

// Carrega o catálogo Piper E a disponibilidade real (SPEC-0041) por IPC —
// assíncrono, independente do `voiceschanged` do Chromium (D17): reavalia os
// dois mesmos gatilhos que o `voiceschanged` já reavalia (botões "Ouvir"
// pendentes + `<select>` de voz do formulário de Persona), para nunca deixar
// o botão travado em "voz indisponível" numa máquina com Piper mas sem voz
// local do SO. Rejeição/ausência do canal de disponibilidade ⇒ `false`
// (degradação para o lado seguro, nunca modo Piper-only presumido).
function loadPiperVoices() {
  return Promise.all([
    window.atlas.tts
      .voices()
      .then((voices) => {
        piperVoices = voices;
      })
      .catch(() => {
        piperVoices = [];
      }),
    window.atlas.tts
      .available()
      .then((available) => {
        piperAvailable = available === true;
      })
      .catch(() => {
        piperAvailable = false;
      }),
  ]).finally(() => {
    for (const button of pendingSpeakButtons) {
      refreshSpeakButton(button);
    }
    populatePersonaVoiceSelect();
  });
}

if (window.speechSynthesis !== undefined) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    for (const button of pendingSpeakButtons) {
      refreshSpeakButton(button);
    }
    populatePersonaVoiceSelect();
  });
}

// Autoria de Persona pela GUI (SPEC-0039, item 2.4 estendido): formulário
// com os 8 campos + escolha de voz real do sistema, lista de Personas
// custom com Editar/Apagar, Personas embutidas somente-leitura. Todo o
// painel entra na mesma serialização de turno do chat/`ask` (chamada por
// `refreshPermissionsPanelState`, que já invoca `refreshPersonaPanelState`).
const personaForm = document.getElementById('persona-form');
const personaFormError = document.getElementById('persona-form-error');
const personaVoiceSelect = document.getElementById('persona-voice-uri');
const personaTestVoiceButton = document.getElementById('persona-test-voice');

// `<select>` de vozes do formulário (SPEC-0041, item 3 do Escopo): em modo
// Piper-only, só "Nenhuma (voz padrão)" + vozes Piper; em modo degradado, só
// "Nenhuma (voz padrão)" + vozes locais do SO — nunca as duas origens ao
// mesmo tempo (D8). Populado a partir do catálogo OFERECIDO
// (`offeredPiperVoices()`) e do MESMO `synth` do glue de TTS, reavaliado nos
// dois gatilhos de D17 (`voiceschanged` E a resposta de `atlas:tts:voices`).
// Rótulo de origem visível (Artigo 7). Preserva a opção selecionada quando
// ela ainda existir na lista nova.
function populatePersonaVoiceSelect() {
  const previousValue = personaVoiceSelect.value;
  const piperOnly = isPiperOnlyMode({
    piperAvailable,
    piperVoiceURIs: piperVoices.map((v) => v.voiceURI),
  });
  const offered = offeredPiperVoices();
  const localVoices = piperOnly
    ? []
    : synth.getVoices().filter((voice) => voice.localService === true);

  personaVoiceSelect.textContent = '';
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = 'Nenhuma (voz padrão)';
  personaVoiceSelect.appendChild(noneOption);
  for (const voice of offered) {
    const optionEl = document.createElement('option');
    optionEl.value = voice.voiceURI;
    optionEl.textContent = `${voice.name} (Piper)`;
    personaVoiceSelect.appendChild(optionEl);
  }
  for (const voice of localVoices) {
    const optionEl = document.createElement('option');
    optionEl.value = voice.voiceURI;
    optionEl.textContent = `${voice.name} (SO)`;
    personaVoiceSelect.appendChild(optionEl);
  }
  if ([...personaVoiceSelect.options].some((option) => option.value === previousValue)) {
    personaVoiceSelect.value = previousValue;
  }

  // Estado de "Testar voz" derivado das opções EFETIVAMENTE oferecidas
  // (nunca de `piperVoices.length` cru) — nunca habilitado sobre um
  // catálogo que `isAvailable()` já declarou indisponível.
  const anyVoice = offered.length > 0 || localVoices.length > 0;
  personaTestVoiceButton.disabled = !anyVoice;
  personaTestVoiceButton.title = anyVoice ? '' : 'voz indisponível neste sistema';
}

personaTestVoiceButton.addEventListener('click', () => {
  const voiceURI = personaVoiceSelect.value;
  if (voiceURI === '') {
    return;
  }
  if (isPiperVoiceURI(voiceURI)) {
    // Teste explícito de UMA voz escolhida pelo usuário: sem fallback aqui
    // (cair para outra voz mascararia o teste). Indisponível ⇒ silêncio.
    window.atlas.tts
      .speak('Este é um teste de voz.', voiceURI)
      .then((audio) => {
        if (audio !== undefined) {
          playPiperAudio(audio);
        }
      })
      .catch(() => {
        // fail-safe: nunca propaga
      });
    return;
  }
  try {
    synth.speak({ text: 'Este é um teste de voz.', voiceURI });
  } catch {
    // fail-safe: nunca propaga
  }
});

const personaVoiceLegacyEl = document.getElementById('persona-voice-legacy');

function openPersonaForm(detail) {
  personaFormError.textContent = '';
  document.getElementById('persona-form-id').value = detail ? detail.id : '';
  document.getElementById('persona-name').value = detail ? detail.name : '';
  document.getElementById('persona-tone').value = detail ? detail.tone : '';
  document.getElementById('persona-formality').value = detail ? detail.formality : '';
  document.getElementById('persona-language').value = detail ? detail.language : '';
  document.getElementById('persona-style').value = detail ? detail.style : '';
  document.getElementById('persona-communication-rules').value = detail
    ? detail.communicationRules.join('\n')
    : '';
  document.getElementById('persona-voice').value = detail ? detail.voice : '';
  document.getElementById('persona-emotion').value = detail ? detail.emotion : '';
  populatePersonaVoiceSelect();

  const persistedVoiceURI = (detail && detail.voiceURI) || '';
  // D12: `voiceURI` persistida sem `<option>` correspondente (caso central —
  // voz do SO em modo Piper-only) cai explicitamente em "Nenhuma (voz
  // padrão)" — nunca `selectedIndex === -1` (estado ambíguo).
  const hasOption = [...personaVoiceSelect.options].some(
    (option) => option.value === persistedVoiceURI,
  );
  personaVoiceSelect.value = hasOption ? persistedVoiceURI : '';

  // D6: aviso de voz legada — Persona com `voiceURI` de SO persistida
  // (não-vazia, não-Piper) em modo Piper-only. Nada é gravado só por abrir
  // o formulário; o aviso só explica o que o submit fará.
  const piperOnly = isPiperOnlyMode({
    piperAvailable,
    piperVoiceURIs: piperVoices.map((v) => v.voiceURI),
  });
  const legacyVoice = persistedVoiceURI !== '' && !isPiperVoiceURI(persistedVoiceURI) && piperOnly;
  personaVoiceLegacyEl.textContent = legacyVoice
    ? 'Esta Persona tem uma voz do sistema salva. A fala já está usando a voz Piper padrão; salvar este formulário substituirá o valor salvo.'
    : '';

  personaForm.hidden = false;
}

document.getElementById('persona-new').addEventListener('click', () => {
  openPersonaForm(null);
});

document.getElementById('persona-form-cancel').addEventListener('click', () => {
  personaForm.hidden = true;
});

function readPersonaFormInput() {
  const rulesRaw = document.getElementById('persona-communication-rules').value;
  const communicationRules = rulesRaw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const voiceURIValue = personaVoiceSelect.value;
  return {
    name: document.getElementById('persona-name').value,
    tone: document.getElementById('persona-tone').value,
    formality: document.getElementById('persona-formality').value,
    language: document.getElementById('persona-language').value,
    style: document.getElementById('persona-style').value,
    communicationRules,
    voice: document.getElementById('persona-voice').value,
    emotion: document.getElementById('persona-emotion').value,
    ...(voiceURIValue !== '' ? { voiceURI: voiceURIValue } : {}),
  };
}

personaForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const id = document.getElementById('persona-form-id').value;
  const input = readPersonaFormInput();
  personaFormError.textContent = '';
  const action =
    id === '' ? window.atlas.persona.create(input) : window.atlas.persona.update(id, input);

  Promise.resolve(action)
    .then((result) => {
      personaForm.hidden = true;
      const closedSessions = (result && result.closedSessions) || [];
      if (closedSessions.length > 0) {
        // Sucesso de update na Persona ATIVA (D9): nenhum Core sobrevive à
        // edição sob identidade superada — a sessão corrente já foi
        // encerrada pelo bridge; o renderer limpa o transcript, avisa e
        // reabre a conversa.
        document.getElementById('chat-transcript').textContent = '';
        appendTranscriptLine('Persona atualizada — nova conversa iniciada');
        return window.atlas.chat.open().then((session) => {
          chatSession = session;
        });
      }
      return undefined;
    })
    .then(() => refreshPersonaSurfaces())
    .catch((error) => {
      // Recusa: transcript e conversa corrente ficam intactos; a lista
      // recarrega do estado real (nunca divergente).
      personaFormError.textContent = `⚠️ ${error.message ?? error}`;
      return refreshPersonaSurfaces();
    });
});

function openPersonaFormForEdit(id) {
  window.atlas.persona.describe(id).then((detail) => {
    openPersonaForm(detail);
  });
}

function handleDeletePersona(id) {
  personaFormError.textContent = '';
  window.atlas.persona
    .delete(id)
    .then(() => refreshPersonaSurfaces())
    .catch((error) => {
      // Recusa (embutida/inexistente/ativa/consentimento negado): aviso de
      // erro, listas recarregadas do estado real (a Persona continua lá
      // quando a remoção não foi confirmada).
      personaFormError.textContent = `⚠️ ${error.message ?? error}`;
      return refreshPersonaSurfaces();
    });
}

function renderPersonaList(options) {
  const listEl = document.getElementById('persona-list');
  listEl.textContent = '';
  for (const option of options) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${option.name} (${option.id})${option.builtin ? ' — embutida' : ''}`;
    item.appendChild(label);
    if (!option.builtin) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.textContent = 'Editar';
      editButton.addEventListener('click', () => openPersonaFormForEdit(option.id));
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.textContent = 'Apagar';
      deleteButton.addEventListener('click', () => handleDeletePersona(option.id));
      item.appendChild(editButton);
      item.appendChild(deleteButton);
    }
    listEl.appendChild(item);
  }
  refreshPersonaPanelState();
}

function loadPersonaList() {
  return window.atlas.persona.list().then(renderPersonaList);
}

// Substitui o placeholder declarado junto de `refreshPermissionsPanelState`
// — o painel inteiro (lista + botões + formulário) entra na mesma
// serialização de turno de chat/`ask`.
refreshPersonaPanelState = function refreshPersonaPanelStateImpl() {
  const disabled = chatTurnInFlight || askInFlight;
  document.getElementById('persona-new').disabled = disabled;
  document.querySelectorAll('#persona-list button').forEach((button) => {
    button.disabled = disabled;
  });
  for (const id of ['persona-form-save', 'persona-form-cancel']) {
    document.getElementById(id).disabled = disabled;
  }
};

// Popula a voz do formulário assim que as vozes do SO chegarem (mesmo se o
// formulário ainda estiver oculto), carrega o catálogo Piper por IPC (D17,
// gatilho independente do `voiceschanged`) e a lista de Personas.
populatePersonaVoiceSelect();
loadPiperVoices();
loadPersonaList();

function appendTranscriptLine(text) {
  const transcript = document.getElementById('chat-transcript');
  const line = document.createElement('pre');
  line.textContent = text;
  transcript.appendChild(line);
}

function appendReply(text) {
  const transcript = document.getElementById('chat-transcript');
  const wrapper = document.createElement('div');
  const line = document.createElement('pre');
  line.textContent = text;
  const speakButton = document.createElement('button');
  speakButton.type = 'button';
  speakButton.textContent = '🔊 Ouvir';
  speakButton.addEventListener('click', () => {
    refreshSpeakButton(speakButton);
    if (!speakButton.disabled) {
      speakText(text);
    }
  });
  refreshSpeakButton(speakButton);
  pendingSpeakButtons.add(speakButton);
  wrapper.appendChild(line);
  wrapper.appendChild(speakButton);
  transcript.appendChild(wrapper);
}

function appendTurn(userInput, snapshot) {
  appendTranscriptLine(`> ${userInput}`);
  for (const step of snapshot.steps) {
    const marker = step.denialKind !== undefined ? ` [${step.denialKind}]` : '';
    appendTranscriptLine(`🔧 ${step.tool} → ${step.outcome}${marker}`);
  }
  appendReply(snapshot.reply);
  for (const fact of snapshot.learned) {
    appendTranscriptLine(`💡 lembrado: ${fact}`);
  }
}

window.atlas.chat.open().then((session) => {
  chatSession = session;
  appendTranscriptLine('(sessão de chat aberta)');
});

document.getElementById('chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (chatSession === null) {
    return;
  }
  const inputEl = document.getElementById('chat-input');
  const input = inputEl.value.trim();
  if (input === '') {
    return;
  }
  const sendButton = document.getElementById('chat-send');
  inputEl.disabled = true;
  sendButton.disabled = true;
  // O seletor de Persona entra na mesma serialização de turno (SPEC-0037,
  // Decisão D9): desabilitado enquanto o turno está em voo, reabilitado no
  // `finally` — camada de UX que complementa a recusa garantida no bridge.
  personaSelect.disabled = true;
  // O painel de permissões entra na mesma serialização (SPEC-0038): também
  // desabilitado durante um turno de chat, além de um `ask` em voo.
  chatTurnInFlight = true;
  refreshPermissionsPanelState();
  window.atlas.chat
    .send(chatSession, input)
    .then((snapshot) => {
      appendTurn(input, snapshot);
      inputEl.value = '';
    })
    .catch((error) => {
      appendTranscriptLine(`⚠️ ${error.message ?? error}`);
    })
    .finally(() => {
      inputEl.disabled = false;
      sendButton.disabled = false;
      personaSelect.disabled = false;
      chatTurnInFlight = false;
      refreshPermissionsPanelState();
      inputEl.focus();
    });
});

// Painel de memória (item 2.4): lista os fatos memorizados e permite
// esquecer um por vez — round-trips stateless (`atlas.memory.list`/`forget`,
// o Core sobe e desliga por chamada). O renderer só pinta `FactSnapshot[]`
// plano, sem conhecer `Fact`/`packages/*`.
function renderMemoryList(facts) {
  const listEl = document.getElementById('memory-list');
  listEl.textContent = '';
  for (const fact of facts) {
    const item = document.createElement('li');
    const subjectSuffix = fact.subject !== undefined ? ` — projeto: ${fact.subject}` : '';
    const label = document.createElement('span');
    label.textContent = `[${fact.id}] ${fact.text} (${fact.createdAt}) — origem: ${fact.source} — categoria: ${fact.category}${subjectSuffix}`;
    const forgetButton = document.createElement('button');
    forgetButton.type = 'button';
    forgetButton.textContent = 'Esquecer';
    forgetButton.addEventListener('click', () => {
      forgetButton.disabled = true;
      window.atlas.memory.forget(fact.id).finally(() => {
        loadMemoryList();
      });
    });
    item.appendChild(label);
    item.appendChild(forgetButton);
    listEl.appendChild(item);
  }
}

function loadMemoryList() {
  window.atlas.memory.list().then(renderMemoryList);
}

document.getElementById('memory-refresh').addEventListener('click', () => {
  loadMemoryList();
});

loadMemoryList();

// Painel de permissões (item 2.4 / SPEC-0038, terceira e última linha):
// mostra as raízes CONFIGURADAS em vigor (as que o `getStatus()` já
// consumido reporta — não o que está digitado nas listas), permite
// acrescentar/remover raízes de leitura/escrita e aplica a mudança inteira
// de uma vez (substituição, nunca merge — mesma semântica das flags da
// CLI). `pendingReadRoots`/`pendingWriteRoots` são o rascunho local do
// renderer; só viram a política de verdade ao clicar em "Aplicar".
let pendingReadRoots = [];
let pendingWriteRoots = [];

function paintRootsList(listEl, roots, onRemove) {
  listEl.textContent = '';
  roots.forEach((root, index) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = root;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Remover';
    removeButton.addEventListener('click', () => {
      onRemove(index);
    });
    item.appendChild(label);
    item.appendChild(removeButton);
    listEl.appendChild(item);
  });
  refreshPermissionsPanelState();
}

function paintReadRootsList() {
  paintRootsList(document.getElementById('read-roots-list'), pendingReadRoots, (index) => {
    pendingReadRoots.splice(index, 1);
    paintReadRootsList();
  });
}

function paintWriteRootsList() {
  paintRootsList(document.getElementById('write-roots-list'), pendingWriteRoots, (index) => {
    pendingWriteRoots.splice(index, 1);
    paintWriteRootsList();
  });
}

// Chamada por `loadStatus()` toda vez que o status é (re)carregado — depois
// de uma aplicação bem-sucedida e também depois de uma recusa, para que as
// listas nunca fiquem divergentes da configuração real (o usuário nunca vê
// uma lista que não corresponde ao que o Core recebeu).
function renderPermissionLists(readRoots, writeRoots) {
  pendingReadRoots = [...readRoots];
  pendingWriteRoots = [...writeRoots];
  paintReadRootsList();
  paintWriteRootsList();
}

document.getElementById('read-root-add').addEventListener('click', () => {
  const input = document.getElementById('read-root-input');
  const value = input.value.trim();
  if (value === '') {
    return;
  }
  pendingReadRoots.push(value);
  input.value = '';
  paintReadRootsList();
});

document.getElementById('write-root-add').addEventListener('click', () => {
  const input = document.getElementById('write-root-input');
  const value = input.value.trim();
  if (value === '') {
    return;
  }
  pendingWriteRoots.push(value);
  input.value = '';
  paintWriteRootsList();
});

document.getElementById('permissions-apply').addEventListener('click', () => {
  const errorEl = document.getElementById('permissions-error');
  errorEl.textContent = '';
  window.atlas.permissions
    .select({ readRoots: [...pendingReadRoots], writeRoots: [...pendingWriteRoots] })
    .then(() => {
      // Sucesso: nenhum Core sobrevive à aplicação sob política superada
      // (D7) — a sessão de chat corrente já foi encerrada pelo bridge;
      // o renderer limpa o transcript, avisa e reabre a conversa.
      document.getElementById('chat-transcript').textContent = '';
      appendTranscriptLine('Permissões alteradas — nova conversa iniciada');
      return window.atlas.chat.open().then((session) => {
        chatSession = session;
      });
    })
    .then(() => loadStatus())
    .catch((error) => {
      // Rejeição (caminho inválido, operação em voo, concessão não
      // confirmada): transcript e conversa corrente ficam intactos; as
      // listas recarregam a partir do status real (nunca divergentes).
      errorEl.textContent = `⚠️ ${error.message ?? error}`;
      return loadStatus();
    });
});
