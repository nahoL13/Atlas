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
