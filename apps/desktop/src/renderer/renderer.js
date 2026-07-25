window.atlas.getStatus().then((snapshot) => {
  const el = document.getElementById('status');
  el.textContent = [
    `Atlas: ${snapshot.state}`,
    `logLevel: ${snapshot.logLevel}`,
    `dataDir: ${snapshot.dataDir}`,
    `persona: ${snapshot.persona.name} (${snapshot.persona.id})`,
    `readRoots: ${snapshot.readRoots.join(', ')}`,
    `writeRoots: ${snapshot.writeRoots.length > 0 ? snapshot.writeRoots.join(', ') : '(nenhuma)'}`,
  ].join('\n');
});

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
  window.atlas.ask(objective).then((snapshot) => {
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
  });
});

// Chat visual multi-turno (item 2.2): o Core é mantido vivo no main process
// entre turnos — a `session` é um handle opaco (string), o `Conversation`
// nunca cruza o IPC. O renderer só pinta o `TurnSnapshot` plano que chega
// (reply/steps/learned); um turno por vez (entrada desabilitada em voo).
let chatSession = null;

// Saída de voz (TTS, item 2.3): adapter local sobre a Web Speech API do
// Chromium (glue de navegador, não testada em unidade — não coberta pelo
// Vitest, que roda sem sessão gráfica/DOM).
//
// Nota de arquitetura: `renderer.js` é um `<script>` clássico carregado por
// `window.loadFile` (sem `type="module"`, sem bundler — ADR-0019), não pode
// `import` o módulo TypeScript `src/speech-output.ts` (que só é consumido
// pelo Vitest, via o mesmo hook `tsx` usado pelo main process). Por isso a
// função abaixo replica deliberadamente, em JS puro, o mesmo algoritmo
// testado em `tests/speech-output.test.ts` (`createSpeechOutput`):
// normaliza o texto, no-op em vazio, cancela a fala anterior antes de
// iniciar a próxima, fail-safe (nunca lança), `isAvailable` via
// `getVoices().length > 0`. Qualquer mudança de comportamento deve ser
// espelhada nos dois lugares.
const synth = {
  speak(spec) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(spec.text));
  },
  cancel() {
    window.speechSynthesis.cancel();
  },
  getVoices() {
    return window.speechSynthesis === undefined ? [] : window.speechSynthesis.getVoices();
  },
};

function createSpeechOutputGlue({ synth }) {
  return {
    speak(text) {
      const normalized = text.trim().replace(/\s+/g, ' ');
      if (normalized === '') {
        return;
      }
      try {
        synth.cancel();
        synth.speak({ text: normalized });
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
        return synth.getVoices().length > 0;
      } catch {
        return false;
      }
    },
  };
}

const speechOutput = createSpeechOutputGlue({ synth });

// Quirk conhecido do Chromium: `getVoices()` costuma devolver `[]` na
// primeira chamada, até o evento `voiceschanged` disparar de forma
// assíncrona. Um `isAvailable()` de tiro único no load do turno arriscaria
// desabilitar o botão num sistema que TEM voz (falso-negativo). Por isso a
// lista de botões "Ouvir" pendentes é reavaliada quando `voiceschanged`
// dispara (ou preguiçosamente, a cada clique).
const pendingSpeakButtons = new Set();

function refreshSpeakButton(button) {
  const available = speechOutput.isAvailable();
  button.disabled = !available;
  button.title = available ? '' : 'voz indisponível neste sistema';
}

if (window.speechSynthesis !== undefined) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    for (const button of pendingSpeakButtons) {
      refreshSpeakButton(button);
    }
  });
}

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
      speechOutput.speak(text);
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
