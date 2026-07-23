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

function appendTranscriptLine(text) {
  const transcript = document.getElementById('chat-transcript');
  const line = document.createElement('pre');
  line.textContent = text;
  transcript.appendChild(line);
}

function appendTurn(userInput, snapshot) {
  appendTranscriptLine(`> ${userInput}`);
  for (const step of snapshot.steps) {
    const marker = step.denialKind !== undefined ? ` [${step.denialKind}]` : '';
    appendTranscriptLine(`🔧 ${step.tool} → ${step.outcome}${marker}`);
  }
  appendTranscriptLine(snapshot.reply);
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
