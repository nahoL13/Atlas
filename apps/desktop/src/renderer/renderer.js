let globalAlert = '';
let bootSettled = false;
let playbackPending = false;
let playbackActive = false;
let currentReplyEvent = null;
let selectedTimelineEvent = null;
let unseenTimelineEvents = 0;

function setGlobalAlert(kind, error) {
  globalAlert = `⚠️ ${error.message ?? error}`;
  const alert = document.getElementById('global-alert');
  alert.textContent = globalAlert;
  alert.hidden = false;
  appendTimelineEvent('error', kind, globalAlert, globalAlert);
  refreshPresence();
}

function clearGlobalAlert() {
  globalAlert = '';
  const alert = document.getElementById('global-alert');
  alert.textContent = '';
  alert.hidden = true;
  refreshPresence();
}

function presenceStateLabel(state) {
  return {
    error: 'Erro',
    speaking: 'Falando',
    thinking: 'Pensando',
    transcribing: 'Transcrevendo',
    listening: 'Ouvindo',
    booting: 'Iniciando',
    ready: 'Pronto',
  }[state];
}

function derivePresenceState() {
  if (globalAlert !== '') return 'error';
  if (playbackActive) return 'speaking';
  if (
    chatTurnInFlight ||
    askInFlight ||
    handsFreeState === 'sending' ||
    handsFreeState === 'thinking' ||
    playbackPending
  )
    return 'thinking';
  if (micState === 'transcribing' || handsFreeState === 'transcribing') return 'transcribing';
  if (micState === 'recording' || handsFreeState === 'listening' || handsFreeState === 'capturing')
    return 'listening';
  if (!bootSettled) return 'booting';
  return 'ready';
}

function refreshPresence() {
  const state = derivePresenceState();
  const core = document.getElementById('presence-core');
  core.dataset.state = state;
  document.getElementById('presence-state').textContent = presenceStateLabel(state);
  renderPresenceFrame();
}

// ---------------------------------------------------------------------------
// SPEC-0053 (Escopo 6-8): núcleo holográfico volumétrico — nuvem de pontos
// determinística (Canvas 2D puro), mapa fechado de perfis por estado e um
// único ciclo de `requestAnimationFrame`. Autocontido: só lê
// `#presence-core[data-state]` (derivado acima) e os dois sinais de playback
// (`playbackPending`/`playbackActive`, geridos por `speakText`). Declarado
// logo após `refreshPresence()` — que já a invoca em `renderPresenceFrame()`
// — para que toda variável usada abaixo esteja inicializada antes de
// qualquer chamada síncrona posterior no arquivo (nenhuma chamada síncrona
// acontece ANTES deste ponto).

// PRNG determinístico — aritmética JS de 32 bits, forma exata da SPEC.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 320 pontos de superfície (Fibonacci sphere, ângulo áureo) + 80 pontos
// internos (mulberry32, semente `0x0a71a5`) — ordem e fórmulas vinculantes
// (Escopo 6). Gerada uma única vez; prova mecânica em
// `renderer.layout.test.ts` (sentinelas + digest SHA-256 canônico).
function generatePresencePointCloud() {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 320; i += 1) {
    const y = 1 - (2 * i) / 319;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * goldenAngle;
    const x = Math.cos(theta) * ring;
    const z = Math.sin(theta) * ring;
    points.push({ layer: 'surface', x, y, z });
  }
  const rng = mulberry32(0x0a71a5);
  for (let i = 0; i < 80; i += 1) {
    const u = rng();
    const v = rng();
    const w = rng();
    const axis = 1 - 2 * u;
    const ring = Math.sqrt(Math.max(0, 1 - axis * axis));
    const radius = Math.cbrt(w);
    const x = Math.cos(2 * Math.PI * v) * ring * radius;
    const y = axis * radius;
    const z = Math.sin(2 * Math.PI * v) * ring * radius;
    points.push({ layer: 'inner', x, y, z });
  }
  return points;
}

const PRESENCE_POINTS = generatePresencePointCloud();

function easeOutCubic(progress) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return 1 - (1 - clamped) ** 3;
}

// Mapa fechado dos sete estados (Escopo 7) — única fonte de rotação,
// deformação temporal e intensidade máxima por estado; nenhuma função de
// fluxo aplica parâmetros visuais independentes.
const PRESENCE_PROFILES = {
  ready: { rotationSpeed: 0.16, hz: 0, amount: 0, kind: 'none', token: '--royal-bright' },
  booting: {
    rotationSpeed: 0.12,
    hz: 0,
    amount: 1,
    kind: 'formation',
    formationMs: 900,
    token: '--royal-soft',
  },
  listening: {
    rotationSpeed: 0.22,
    hz: 0.65,
    amount: 0.08,
    kind: 'breathing',
    token: '--royal-lilac',
  },
  transcribing: {
    rotationSpeed: 0.32,
    hz: 1.8,
    amount: 0.06,
    kind: 'latitudinal',
    token: '--royal-magenta',
  },
  thinking: {
    rotationSpeed: 0.55,
    hz: 2.2,
    amount: 0.18,
    kind: 'flicker',
    token: '--royal-violet',
  },
  speaking: { rotationSpeed: 0.28, hz: 2.4, amount: 0.12, kind: 'wave', token: '--royal-bright' },
  error: { rotationSpeed: 0.08, hz: 7, amount: 2, kind: 'jitter', token: '--royal-error' },
};

// Réplica local (JS) dos tokens roxo-realeza claros de `styles.css`/`:root`
// — o Canvas 2D não resolve custom properties de folha externa em runtime
// (mesma duplicação deliberada renderer↔folha já documentada para voz).
const PRESENCE_TOKEN_COLORS = {
  '--royal-bright': '#7c3aed',
  '--royal-violet': '#8b5cf6',
  '--royal-soft': '#c7adff',
  '--royal-lilac': '#d8c8ff',
  '--royal-magenta': '#c84ad8',
  '--royal-error': '#c92c5b',
};

function presenceTokenColor(token) {
  return PRESENCE_TOKEN_COLORS[token] || PRESENCE_TOKEN_COLORS['--royal-bright'];
}

function presenceHexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const presenceCanvasEl = document.getElementById('presence-canvas');
const presenceCoreEl = document.getElementById('presence-core');
const presenceStageEl = document.getElementById('presence-stage');

// Falha de `getContext('2d')` não derruba o boot (Escopo 6/CA23): Persona,
// estado, chat e todos os controles seguem funcionais sem o efeito
// decorativo.
const presenceCtx = (() => {
  try {
    return typeof presenceCanvasEl.getContext === 'function'
      ? presenceCanvasEl.getContext('2d')
      : null;
  } catch {
    return null;
  }
})();

const PRESENCE_MAX_TILT_RAD = (12 * Math.PI) / 180;
const PRESENCE_CAMERA_DISTANCE = 2.6;

let presenceCanvasCssSize = 280;
let presenceRotation = 0;
let presenceLastFrameTime = null;
let presenceCurrentTrackedState = null;
let presenceStateEnteredAt = null;
let presenceAnimationHandle = null;

let pointerYawTarget = 0;
let pointerPitchTarget = 0;
let pointerYaw = 0;
let pointerPitch = 0;

let waveEnvelopeValue = 0;
let waveEnvelopeIsSpeaking = false;
let waveEnvelopeFrom = 0;
let waveEnvelopeTo = 0;
let waveEnvelopeStart = null;
let waveEnvelopeDuration = 160;

// `Date.now()` (não `performance.now()`): o harness de teste dubla
// `window.Date.now`, não `window.performance.now` — usar a mesma fonte de
// tempo do relógio injetável (SPEC-0046/D19) em produção e em teste.
function presenceNow() {
  return Date.now();
}

function presenceReducedMotionQuery() {
  if (typeof window.matchMedia !== 'function') {
    return { matches: false };
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)');
  } catch {
    return { matches: false };
  }
}

function presenceReducedMotion() {
  return presenceReducedMotionQuery().matches === true;
}

function resizePresenceCanvas() {
  if (presenceCtx === null) {
    return;
  }
  const rect = presenceCoreEl.getBoundingClientRect();
  const cssSize =
    rect.width > 0 ? rect.width : rect.height > 0 ? rect.height : presenceCanvasCssSize;
  presenceCanvasCssSize = cssSize;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const backingSize = Math.max(1, Math.round(cssSize * dpr));
  if (presenceCanvasEl.width !== backingSize || presenceCanvasEl.height !== backingSize) {
    presenceCanvasEl.width = backingSize;
    presenceCanvasEl.height = backingSize;
  }
}

function convergePointer(deltaMs) {
  const factor = 1 - Math.exp(-deltaMs / 120);
  pointerYaw += (pointerYawTarget - pointerYaw) * factor;
  pointerPitch += (pointerPitchTarget - pointerPitch) * factor;
}

if (presenceStageEl !== null) {
  presenceStageEl.addEventListener('pointermove', (event) => {
    const rect = presenceStageEl.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 1;
    const height = rect.height > 0 ? rect.height : 1;
    const relX = Math.min(1, Math.max(-1, ((event.clientX - rect.left) / width) * 2 - 1));
    const relY = Math.min(1, Math.max(-1, ((event.clientY - rect.top) / height) * 2 - 1));
    pointerYawTarget = relX * PRESENCE_MAX_TILT_RAD;
    pointerPitchTarget = relY * PRESENCE_MAX_TILT_RAD;
  });
  presenceStageEl.addEventListener('pointerleave', () => {
    pointerYawTarget = 0;
    pointerPitchTarget = 0;
  });
}

function trackPresenceStateEntry(state, now) {
  if (state !== presenceCurrentTrackedState) {
    presenceCurrentTrackedState = state;
    presenceStateEnteredAt = now;
  }
}

// Ataque `easeOutCubic` de 0→1 em 160ms ao entrar em `speaking`; release do
// valor corrente até zero em 450ms ao sair — sem salto de geometria.
function updateWaveEnvelope(now, isSpeaking) {
  if (isSpeaking !== waveEnvelopeIsSpeaking) {
    waveEnvelopeIsSpeaking = isSpeaking;
    waveEnvelopeFrom = waveEnvelopeValue;
    waveEnvelopeTo = isSpeaking ? 1 : 0;
    waveEnvelopeStart = now;
    waveEnvelopeDuration = isSpeaking ? 160 : 450;
  }
  if (waveEnvelopeStart === null) {
    waveEnvelopeValue = isSpeaking ? 1 : 0;
    return;
  }
  const elapsed = now - waveEnvelopeStart;
  const progress = waveEnvelopeDuration <= 0 ? 1 : elapsed / waveEnvelopeDuration;
  waveEnvelopeValue =
    waveEnvelopeFrom + (waveEnvelopeTo - waveEnvelopeFrom) * easeOutCubic(progress);
}

function computePresenceDeformation(point, profile, timeSec, elapsedSinceEnterMs) {
  switch (profile.kind) {
    case 'formation': {
      const progress = Math.min(elapsedSinceEnterMs / profile.formationMs, 1);
      return { radiusScale: easeOutCubic(progress), alphaBoost: 0 };
    }
    case 'breathing': {
      const wave = Math.sin(2 * Math.PI * profile.hz * timeSec);
      return { radiusScale: 1 + profile.amount * wave, alphaBoost: 0 };
    }
    case 'latitudinal': {
      const phase = point.y * Math.PI;
      const wave = Math.sin(2 * Math.PI * profile.hz * timeSec + phase);
      return { radiusScale: 1 + profile.amount * wave, alphaBoost: 0 };
    }
    case 'flicker': {
      const wave = 0.5 + 0.5 * Math.sin(2 * Math.PI * profile.hz * timeSec + point.x * 3);
      return { radiusScale: 1, alphaBoost: profile.amount * wave };
    }
    case 'wave': {
      const longitude = Math.atan2(point.z, point.x);
      const wave = Math.sin(longitude * 3 - 2 * Math.PI * profile.hz * timeSec);
      return { radiusScale: 1 + profile.amount * waveEnvelopeValue * wave, alphaBoost: 0 };
    }
    default:
      return { radiusScale: 1, alphaBoost: 0 };
  }
}

// Rotação em x/y/z, projeção perspectiva e ordenação de trás para frente
// (Escopo 6) — jitter angular do perfil `error` soma-se à rotação (yaw), não
// desloca pontos individualmente.
function projectPresencePoints(profile, reduced, now, elapsedSinceEnterMs, deltaMs) {
  if (!reduced) {
    presenceRotation += profile.rotationSpeed * (deltaMs / 1000);
    convergePointer(deltaMs);
  }
  updateWaveEnvelope(now, presenceCoreEl.dataset.state === 'speaking');

  let yawJitter = 0;
  if (!reduced && profile.kind === 'jitter') {
    const jitterRad = (profile.amount * Math.PI) / 180;
    yawJitter = jitterRad * Math.sin(2 * Math.PI * profile.hz * (now / 1000));
  }

  const timeSec = now / 1000;
  const totalYaw = presenceRotation + (reduced ? 0 : pointerYaw + yawJitter);
  const pitch = reduced ? 0 : pointerPitch;
  const cosYaw = Math.cos(totalYaw);
  const sinYaw = Math.sin(totalYaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);

  const projected = [];
  for (const point of PRESENCE_POINTS) {
    const { radiusScale, alphaBoost } = reduced
      ? { radiusScale: 1, alphaBoost: 0 }
      : computePresenceDeformation(point, profile, timeSec, elapsedSinceEnterMs);
    const rx = point.x * radiusScale;
    const ry = point.y * radiusScale;
    const rz = point.z * radiusScale;

    const x1 = rx * cosYaw + rz * sinYaw;
    const z1 = -rx * sinYaw + rz * cosYaw;
    const y2 = ry * cosPitch - z1 * sinPitch;
    const z2 = ry * sinPitch + z1 * cosPitch;

    projected.push({ x: x1, y: y2, z: z2, alphaBoost });
  }

  // Ordenação de trás para frente: ponto frontal (maior `z`) desenhado por
  // último — maior e mais opaco que seu par traseiro (CA17).
  projected.sort((a, b) => a.z - b.z);
  return projected;
}

// Somente partículas circulares preenchidas e glow difuso — nunca `lineTo`,
// `stroke` ou paths lineares (Escopo 6/CA18): sem meridianos, grades, anéis,
// trilhos, caudas ou órbitas.
function drawPresenceCanvas(points, profile) {
  const ctx = presenceCtx;
  const backingSize = presenceCanvasEl.width || 1;
  const half = backingSize / 2;
  const baseRadius = half * 0.86;
  const tokenColor = presenceTokenColor(profile.token);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, backingSize, backingSize);

  ctx.beginPath();
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, presenceHexToRgba(tokenColor, 0.32));
  gradient.addColorStop(1, presenceHexToRgba(tokenColor, 0));
  ctx.fillStyle = gradient;
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.fill();

  for (const point of points) {
    const perspective = PRESENCE_CAMERA_DISTANCE / (PRESENCE_CAMERA_DISTANCE - point.z);
    const screenX = half + point.x * baseRadius * perspective;
    const screenY = half + point.y * baseRadius * perspective;
    const depthFactor = Math.min(1, Math.max(0, (point.z + 1) / 2));
    const size = Math.max(0.6, (backingSize / 220) * (0.55 + depthFactor * 1.15)) * perspective;
    const alpha = Math.min(1, 0.25 + depthFactor * 0.68 + point.alphaBoost);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = tokenColor;
    ctx.beginPath();
    ctx.arc(screenX, screenY, Math.max(0.4, size), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function renderPresenceGeometry(now) {
  if (presenceCtx === null) {
    return;
  }
  const state = presenceCoreEl.dataset.state || 'ready';
  const profile = PRESENCE_PROFILES[state] || PRESENCE_PROFILES.ready;
  trackPresenceStateEntry(state, now);
  const elapsedSinceEnter = now - (presenceStateEnteredAt ?? now);
  const deltaMs = presenceLastFrameTime === null ? 0 : Math.max(0, now - presenceLastFrameTime);
  presenceLastFrameTime = now;

  const reduced = presenceReducedMotion();
  const points = projectPresencePoints(profile, reduced, now, elapsedSinceEnter, deltaMs);
  drawPresenceCanvas(points, profile);
}

function presenceFrameStep() {
  // Fonte de tempo única (`Date.now()`, não o timestamp nativo do `rAF`) —
  // consistente entre o loop contínuo e o frame estático de reduced motion
  // (ambos chamam `presenceNow()`), evitando um salto de época ao alternar.
  renderPresenceGeometry(presenceNow());
  presenceAnimationHandle = window.requestAnimationFrame(presenceFrameStep);
}

// Única instância de `requestAnimationFrame` (Escopo 8/CA22) — iniciada uma
// vez; mudança de estado nunca cria loops paralelos.
function startPresenceLoop() {
  if (presenceAnimationHandle !== null) {
    return;
  }
  presenceAnimationHandle = window.requestAnimationFrame(presenceFrameStep);
}

function stopPresenceLoop() {
  if (presenceAnimationHandle !== null) {
    window.cancelAnimationFrame(presenceAnimationHandle);
    presenceAnimationHandle = null;
  }
}

// Ponto de entrada único chamado por `refreshPresence()`: desenha o estado
// corrente IMEDIATAMENTE (uma mudança de estado nunca espera o próximo tick
// do `rAF` para aparecer) e garante a cadeia contínua rodando para as
// próximas animações. Com reduced motion ativo, cancela o loop contínuo — só
// o frame estático imediato (por mudança de estado/resize) é desenhado.
function renderPresenceFrame() {
  resizePresenceCanvas();
  if (presenceCtx === null) {
    return;
  }
  const reduced = presenceReducedMotion();
  if (reduced) {
    stopPresenceLoop();
  }
  renderPresenceGeometry(presenceNow());
  if (!reduced) {
    startPresenceLoop();
  }
}

window.addEventListener('resize', () => {
  renderPresenceFrame();
});

const presenceReducedMotionMql = (() => {
  try {
    return typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  } catch {
    return null;
  }
})();
if (presenceReducedMotionMql !== null) {
  const onPresenceReducedMotionChange = () => renderPresenceFrame();
  if (typeof presenceReducedMotionMql.addEventListener === 'function') {
    presenceReducedMotionMql.addEventListener('change', onPresenceReducedMotionChange);
  } else if (typeof presenceReducedMotionMql.addListener === 'function') {
    presenceReducedMotionMql.addListener(onPresenceReducedMotionChange);
  }
}
// ---------------------------------------------------------------------------

function renderStatus(snapshot) {
  const el = document.getElementById('status');
  el.textContent = [
    `Atlas: ${snapshot.state}`,
    `logLevel: ${snapshot.logLevel}`,
    `dataDir: ${snapshot.dataDir}`,
    `persona: ${snapshot.persona.name} (${snapshot.persona.id})`,
    `readRoots: ${snapshot.readRoots.join(', ')}`,
    `writeRoots: ${snapshot.writeRoots.length > 0 ? snapshot.writeRoots.join(', ') : '(nenhuma)'}`,
    `netRoots: ${snapshot.netRoots.length > 0 ? snapshot.netRoots.join(', ') : '(nenhum)'}`,
    `searchUrl: ${snapshot.searchUrl !== '' ? snapshot.searchUrl : '(não configurada)'}`,
  ].join('\n');
  document.getElementById('presence-persona').textContent = snapshot.persona.name;
}

// Voz preferida da Persona ativa (ADR-0020(b)/D8 do SPEC-0040) — amostrada a
// cada `loadStatus()`, usada pelo roteamento de voz abaixo (Piper vs. SO).
let activePersonaVoiceURI;

// SPEC-0059 (achado A1 do gate — regra determinística): `loadStatus()` é o
// ponto único de repintura chamado em pelo menos 6 lugares (arranque, troca
// de Persona, refreshPersonaSurfaces após CRUD de Persona, apply de FS no
// sucesso e na rejeição). Por isso repinta SÓ `#network-inforce` (a config
// EM VIGOR, via `renderNetworkInForce`) e NUNCA o rascunho de rede
// (`pendingNetRoots`/`pendingSearchUrl`) — o rascunho só é semeado (i) no
// arranque e (ii) depois de um `network.select` bem-sucedido
// (`seedNetworkDraftFromStatus`, definida junto do painel de rede/busca
// abaixo). Se `loadStatus()` também semeasse o rascunho, a preservação de
// rascunho em rejeição (D17) seria derrotada em todo ponto de chamada exceto
// o testado por `#network-apply`.
function loadStatus() {
  return window.atlas.getStatus().then((snapshot) => {
    renderStatus(snapshot);
    renderPermissionLists(snapshot.readRoots, snapshot.writeRoots);
    renderNetworkInForce(snapshot.netRoots, snapshot.searchUrl);
    activePersonaVoiceURI = snapshot.persona.voiceURI;
    bootSettled = true;
    clearGlobalAlert();
    return snapshot;
  });
}

function setupDrawer() {
  const toggle = document.getElementById('menu-toggle');
  const drawer = document.getElementById('panel-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const close = document.getElementById('drawer-close');
  const controls = [...document.querySelectorAll('#drawer-navigation [data-drawer-nav]')];

  const closeDrawer = () => {
    drawer.hidden = true;
    backdrop.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
    // SPEC-0054 (Escopo 9/CA24): fechar o drawer por botão/Escape/backdrop
    // cancela o timer do painel `Sistema`, se estiver vivo (idempotente).
    stopSystemPanelTimer();
  };
  const openDrawer = () => {
    drawer.hidden = false;
    backdrop.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    controls[0]?.focus();
  };

  toggle.addEventListener('click', () => {
    if (drawer.hidden) openDrawer();
    else closeDrawer();
  });
  close.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (drawer.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...drawer.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
      ),
    ].filter((element) => !element.hidden);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  for (const control of controls) {
    control.addEventListener('click', () => {
      const panelId = control.getAttribute('aria-controls');
      const panel = panelId === null ? null : document.getElementById(panelId);
      if (panel === null) return;
      const opening = panel.hidden;
      for (const other of controls) {
        const otherPanel = document.getElementById(other.getAttribute('aria-controls'));
        other.setAttribute('aria-expanded', 'false');
        if (otherPanel !== null) otherPanel.hidden = true;
      }
      panel.hidden = !opening;
      control.setAttribute('aria-expanded', String(opening));
      // SPEC-0054 (Escopo 9/CA24): o painel `Sistema` só tem timer vivo
      // enquanto ele PRÓPRIO estiver visível — abrir outro painel, fechar
      // este ou reabri-lo (re)inicia/cancela o ciclo, sempre idempotente.
      if (panelId === 'panel-system' && opening) {
        startSystemPanelTimer();
      } else {
        stopSystemPanelTimer();
      }
    });
  }

  return { openDrawer, closeDrawer, controls };
}

const drawer = setupDrawer();

// Serialização compartilhada do painel de permissões (item 2.4 / SPEC-0038):
// desabilitado enquanto houver um turno de chat OU um `ask` em voo — os dois
// gestos que o renderer sabe quando disparou.
let chatTurnInFlight = false;
let askInFlight = false;

// SPEC-0059 (D16, camada de renderer do mutex de política): `true` enquanto
// `window.atlas.permissions.select`/`window.atlas.network.select` estiver
// pendente — os dois botões de aplicar política ficam ADICIONALMENTE
// desabilitados (além de `chatTurnInFlight`/`askInFlight`), calculado nesta
// mesma origem única, para que nunca haja dois diálogos de consentimento de
// política empilhados na tela.
let policyApplicationInFlight = false;

function refreshPermissionsPanelState() {
  const disabled = chatTurnInFlight || askInFlight;
  for (const id of [
    'read-root-input',
    'read-root-add',
    'write-root-input',
    'write-root-add',
    'net-root-input',
    'net-root-add',
    'search-url-input',
    'search-url-clear',
  ]) {
    document.getElementById(id).disabled = disabled;
  }
  document
    .querySelectorAll('#read-roots-list button, #write-roots-list button, #net-roots-list button')
    .forEach((button) => {
      button.disabled = disabled;
    });
  // Os dois botões de aplicar política (D16): a MESMA origem única —
  // desabilitados por turno em voo E, adicionalmente, por uma aplicação de
  // política já pendente.
  const applyDisabled = disabled || policyApplicationInFlight;
  document.getElementById('permissions-apply').disabled = applyDisabled;
  document.getElementById('network-apply').disabled = applyDisabled;
  // O painel de Persona (SPEC-0039) entra na MESMA serialização de turno —
  // desabilitado enquanto houver um turno de chat/ask em voo.
  refreshPersonaPanelState();
  // Entrada por voz (STT, SPEC-0046, item 2.3-restante): com um turno de
  // chat/ask em voo, o botão de microfone fica desabilitado — CA34, uma das
  // duas direções da serialização de gestos entre voz e chat.
  refreshMicButtons();
  refreshChatControlsForMic();
  // SPEC-0049: `#ask-submit` ganha a mesma origem única de cálculo dos
  // demais controles serializados.
  refreshAskControls();
  // SPEC-0052: o toggle do modo hands-free entra na MESMA serialização —
  // desabilitado enquanto houver turno de chat/`ask` em voo.
  refreshHandsFreeToggle();
}

// SPEC-0049: `#ask-form` entra na mesma serialização de gestos já em vigor
// para `#chat-send`/painel de permissões/Persona — desabilitado enquanto
// houver turno de chat OU um `ask` em voo (D2: um turno de chat mantém um
// Core vivo executando Tools; a mesma classe de risco que motivou a
// SPEC-0048 na direção inversa). `#objective` fica deliberadamente fora
// (D3) — digitar não dispara gesto contra o Core.
//
// SPEC-0051 (Frente 5): `#ask-cancel` (gesto de escape) é calculado aqui —
// origem única — visível/habilitado SSE `askInFlight`. Nenhum `.finally` do
// gesto atribui `hidden`/`disabled` deste botão diretamente (D10).
function refreshAskControls() {
  const disabled = chatTurnInFlight || askInFlight;
  const submitButton = document.getElementById('ask-submit');
  if (submitButton !== null) {
    submitButton.disabled = disabled;
  }
  const cancelButton = document.getElementById('ask-cancel');
  if (cancelButton !== null) {
    cancelButton.hidden = !askInFlight;
    cancelButton.disabled = !askInFlight;
  }
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
    .then(() =>
      reopenChatSession(
        'session-reopened-persona',
        `Persona alterada para ${chosenId} — nova conversa iniciada`,
      ),
    )
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

loadStatus()
  .then((snapshot) => {
    personaSelect.dataset.activePersonaId = snapshot.persona.id;
    // SPEC-0059 (D17/A1): o rascunho de rede/busca só é semeado do status no
    // ARRANQUE e depois de um `network.select` bem-sucedido — nunca por
    // `loadStatus()` sozinho (ver comentário acima de `loadStatus`).
    seedNetworkDraftFromStatus(snapshot.netRoots, snapshot.searchUrl);
    return loadPersonaOptions(snapshot.persona.id);
  })
  .catch((error) => {
    bootSettled = true;
    setGlobalAlert('boot-failure', error);
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

// Gesto de escape (SPEC-0051): aviso de transparência ÚNICO, acrescentado
// pelos dois `.catch` (ask/chat) logo após a linha `⚠️ <mensagem>` sempre
// que a rejeição vier de um cancelamento bem-sucedido — nunca repetido numa
// rejeição não-cancelada seguinte (a flag é lida e limpa no mesmo `.catch`).
// Texto pinado exato (CA 21/D11): declara os três efeitos reais do trabalho
// abandonado — o que ele ainda pode concluir e o que ele bloqueia.
const CANCEL_NOTICE =
  '⏳ Cancelado: o trabalho já iniciado continua encerrando em segundo plano — ' +
  'ações de arquivo já autorizadas ainda podem concluir; até ele assentar, esta ' +
  'conversa não aceita turnos novos e os painéis de configuração podem recusar.';
let cancelNoticePending = false;

// Round-trip `ask` de tiro único (stateless — o Core sobe e desliga a cada
// chamada). O traço de `steps` chega já formatado (`StepLine[]`, dado
// plano); este renderer só pinta, sem conhecer `ExecutedStep`/contratos.
function setAskResultDisclosure(open) {
  const toggle = document.getElementById('ask-result-toggle');
  const result = document.getElementById('ask-result');
  toggle.hidden = !open && result.textContent === '';
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Ocultar resultado' : 'Ver resultado';
  result.hidden = !open;
}

document.getElementById('ask-result-toggle').addEventListener('click', () => {
  const toggle = document.getElementById('ask-result-toggle');
  setAskResultDisclosure(toggle.getAttribute('aria-expanded') !== 'true');
});

document.getElementById('ask-form').addEventListener('submit', (event) => {
  event.preventDefault();
  // SPEC-0049/D2 e D4: guarda explícita, além do atributo `disabled` de
  // `#ask-submit` — um `submit` despachado programaticamente ou por
  // submissão implícita do `<form>` (Enter em `#objective`, que fica
  // deliberadamente habilitado — D3) contorna o botão. Recusa silenciosa:
  // não escreve em `#ask-result`, não limpa `#objective` (D4).
  if (chatTurnInFlight || askInFlight) {
    return;
  }
  const objective = document.getElementById('objective').value.trim();
  if (objective === '') {
    return;
  }
  const resultEl = document.getElementById('ask-result');
  resultEl.textContent = 'Processando…';
  setAskResultDisclosure(true);
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
    .catch((error) => {
      // SPEC-0049/Frente 3: sem isto, uma falha de `atlas.ask` virava
      // unhandled rejection e o painel ficava congelado em "Perguntando…".
      resultEl.textContent = `⚠️ ${error.message ?? error}`;
      // SPEC-0051: se a rejeição veio de um cancelamento bem-sucedido,
      // acrescenta o aviso de transparência DEPOIS — uma única vez.
      if (cancelNoticePending) {
        resultEl.textContent += `\n${CANCEL_NOTICE}`;
        cancelNoticePending = false;
      }
    })
    .finally(() => {
      askInFlight = false;
      refreshPermissionsPanelState();
    });
});

// Gesto de escape do `ask` (SPEC-0051): visível/habilitado só enquanto
// `askInFlight` (`refreshAskControls`). O clique só chama `window.atlas.cancel()`
// e marca a flag — nunca escreve texto nem mexe em `askInFlight` diretamente,
// que cai sozinho pelo `.finally` acima quando a promessa do `ask` rejeitar.
document.getElementById('ask-cancel').addEventListener('click', () => {
  window.atlas.cancel().then((outcome) => {
    if (outcome && outcome.cancelled === true) {
      cancelNoticePending = true;
    }
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
// `synth` é a IMPLEMENTAÇÃO DA PORTA `SpeechSynthesisPort` (molde de
// `speech-output.ts`) sobre `window.speechSynthesis` — adaptador de
// navegador, NUNCA uma réplica registrada no gate de paridade (R4, achado
// do 2º passe do `architecture-reviewer` na SPEC-0052: o comentário anterior
// descrevia o bloco inteiro abaixo, incluindo `synth`, como réplica — mas o
// registro de `renderer.speech-parity.test.ts` só cobre as funções PURAS
// declaradas depois deste objeto, nunca `synth` em si). A RÉPLICA
// propriamente dita — o mesmo algoritmo testado em
// `tests/speech-output.test.ts` (`createSpeechOutput`): normaliza o texto,
// no-op em vazio, filtra vozes para só `localService === true`, seleciona
// deterministicamente a primeira, cancela a fala anterior antes de iniciar a
// próxima, fail-safe (nunca lança), `isAvailable` sse existir ≥1 voz local,
// sem voz local ⇒ no-op, jamais fallback para voz de rede — vive em
// `createSpeechOutputGlue`/`selectVoiceURI`/`selectLocalVoiceURI`, mais
// abaixo. Qualquer mudança de comportamento das funções replicadas deve ser
// espelhada nos dois lugares (`renderer.js` ↔ `speech-output.ts`).
//
// Nota de arquitetura: `renderer.js` é um `<script>` clássico carregado por
// `window.loadFile` (sem `type="module"`, sem bundler — ADR-0019), não pode
// `import` o módulo TypeScript `src/speech-output.ts` (que só é consumido
// pelo Vitest, via o mesmo hook `tsx` usado pelo main process).
//
// Observador de fim de fala do SO (D20/SPEC-0052) — setado pelo modo
// hands-free ANTES de uma chamada que pode criar um `SpeechSynthesisUtterance`,
// consumido (e zerado) aqui mesmo, no ÚNICO ponto de criação do utterance.
// `null`/no-op fora do modo hands-free. Nunca vive em `createSpeechOutputGlue`
// (réplica vigiada) nem em `speech-output.ts` (diff vazio, D16/D20).
let handsFreeUtteranceObserver = null;
let speechFailureObserver = null;

// SPEC-0053 (Escopo 7): sinal de início real do backend do SO — só o evento
// nativo `start` da tentativa corrente ativa `playbackActive`. `null` fora de
// uma tentativa de playback gerenciada por `speakText` (ex.: "Testar voz",
// que fala direto por `synth.speak`, nunca alimenta o núcleo).
let playbackStartObserver = null;

// Token de identidade da tentativa corrente de playback (Escopo 7): eventos
// de uma tentativa substituída por uma nova (`speakText` chamado de novo
// antes da anterior assentar) são ignorados, nunca sobrescrevem o estado
// visual da tentativa nova.
let presencePlaybackAttempt = 0;

function isCurrentPlaybackAttempt(token) {
  return token === presencePlaybackAttempt;
}

// Solicitar fala aceita marca somente `playbackPending` — nunca `speaking`
// por clique, resolução de IPC, `audio.play()` resolvido, criação do
// utterance ou `canplay`.
function beginPlaybackAttempt() {
  presencePlaybackAttempt += 1;
  playbackPending = true;
  playbackActive = false;
  refreshPresence();
  return presencePlaybackAttempt;
}

function activatePlayback(token) {
  if (!isCurrentPlaybackAttempt(token)) {
    return;
  }
  playbackPending = false;
  playbackActive = true;
  refreshPresence();
}

// Falha Piper (antes OU depois de `playing`) volta a `playbackPending` — a
// sequência visual só reativa `speaking` se o fallback do SO emitir `start`.
function revertToPending(token) {
  if (!isCurrentPlaybackAttempt(token)) {
    return;
  }
  playbackActive = false;
  playbackPending = true;
  refreshPresence();
}

function endPlaybackAttempt(token) {
  if (!isCurrentPlaybackAttempt(token)) {
    return;
  }
  playbackPending = false;
  playbackActive = false;
  refreshPresence();
}

const synth = {
  speak(spec) {
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(
      (candidate) => candidate.voiceURI === spec.voiceURI && candidate.localService === true,
    );
    if (voice === undefined) {
      // Voz local sumiu entre a seleção e a fala: fail-closed, não fala
      // (jamais fallback para a voz padrão/de rede do Chromium).
      // R3 (SPEC-0052): nenhum utterance é criado — o observador pendente
      // (se houver) é resolvido AQUI, senão o modo hands-free ficaria preso
      // em `speaking` até o watchdog (mínimo de 8s de microfone fechado).
      playbackStartObserver = null;
      if (handsFreeUtteranceObserver !== null) {
        const observer = handsFreeUtteranceObserver;
        handsFreeUtteranceObserver = null;
        observer();
      }
      speechFailureObserver = null;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(spec.text);
    utterance.voice = voice;
    // SPEC-0053 (Escopo 7): só o evento nativo `start` da tentativa corrente
    // ativa `playbackActive` — nunca a criação do utterance nem `speak()`.
    if (playbackStartObserver !== null) {
      const startObserver = playbackStartObserver;
      playbackStartObserver = null;
      utterance.addEventListener('start', startObserver);
    }
    if (handsFreeUtteranceObserver !== null) {
      const observer = handsFreeUtteranceObserver;
      handsFreeUtteranceObserver = null;
      utterance.addEventListener('end', observer);
      utterance.addEventListener('error', () => {
        const failure = speechFailureObserver;
        speechFailureObserver = null;
        if (failure !== null) failure();
        observer();
      });
      utterance.addEventListener('end', () => {
        speechFailureObserver = null;
      });
    }
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

// Resíduo (2) da SPEC-0043: espelha `selectVoiceURI` de `speech-output.ts`
// (verificado em `tests/speech-output.test.ts`, testes de
// `preferredVoiceURI`) — entre as vozes `localService === true`, prefere a
// de `voiceURI` igual ao devolvido pelo provider, amostrado a cada `speak`
// (nunca fixado); sem preferência (ausente, lançando, ou apontando para voz
// inexistente/não-local), cai na primeira voz local.
function selectVoiceURI(synth, preferredVoiceURI) {
  const voices = synth.getVoices();
  let preferred;
  try {
    preferred = preferredVoiceURI === undefined ? undefined : preferredVoiceURI();
  } catch {
    preferred = undefined;
  }
  if (preferred !== undefined) {
    const match = voices.find(
      (voice) => voice.voiceURI === preferred && voice.localService === true,
    );
    if (match !== undefined) {
      return match.voiceURI;
    }
  }
  const localVoice = voices.find((voice) => voice.localService === true);
  return localVoice === undefined ? undefined : localVoice.voiceURI;
}

function createSpeechOutputGlue({ synth, preferredVoiceURI }) {
  return {
    speak(text) {
      const normalized = text.trim().replace(/\s+/g, ' ');
      if (normalized === '') {
        return;
      }
      try {
        const voiceURI = selectVoiceURI(synth, preferredVoiceURI);
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

// Resíduo (2) da SPEC-0043 (Decisão D6): restaura ADR-0020(b)/D16 da
// SPEC-0040 no caminho `'os'` do glue — o MESMO ponto de política de
// superfície já usado por `currentVoiceBackend` abaixo, sem condição de voz
// nova. Um `piper:<id>` nunca casa com o `voiceURI` de uma voz do SO (filtro
// `localService === true` em `selectVoiceURI`), então degrada naturalmente
// para a 1ª voz local — ADR-0021(c) intacto. Amostrado a cada `speak` (não
// fixado): trocar/editar a Persona ativa muda a voz sem recriar o glue.
const speechOutput = createSpeechOutputGlue({
  synth,
  preferredVoiceURI: () =>
    piperOnlyPreference({
      preferredVoiceURI: activePersonaVoiceURI,
      piperAvailable,
      piperVoiceURIs: piperVoices.map((voice) => voice.voiceURI),
    }),
});

// Catálogo de vozes Piper efetivamente OFERECIDO ao usuário — vazio em modo
// degradado (Decisão D8). Único ponto derivado, consumido tanto pelo
// roteamento quanto pelo `<select>` do formulário de Persona.
function offeredPiperVoices() {
  return isPiperOnlyMode({ piperAvailable, piperVoiceURIs: piperVoices.map((v) => v.voiceURI) })
    ? piperVoices
    : [];
}

// Resíduo (1) da SPEC-0043 (Decisões D2-D4): replica pura de
// `resolvePersistedVoiceSelection` de `speech-output.ts` — 7ª ocorrência do
// padrão de duplicação deliberada renderer↔módulo (mesma classe das SPECs
// 0035/0036/0039/0040/0041), versão testada em
// `tests/speech-output.test.ts`. Classifica em quatro desfechos exaustivos o
// destino de uma `Persona.voiceURI` persistida, composta SOBRE
// `piperOnlyPreference` (nunca uma condição paralela): `none` (sem
// `voiceURI`), `available` (entre as oferecidas), `dropped` (deixou de ser
// honrada pela política Piper-only — D6/D12 da SPEC-0041, substituição
// anunciada e desejada), `retained` (continua honrada, só não ofertável por
// razão ambiental — preservada, nunca apagada em silêncio).
function resolvePersistedVoiceSelection({
  persistedVoiceURI,
  offeredVoiceURIs,
  piperAvailable,
  piperVoiceURIs,
}) {
  if (persistedVoiceURI === undefined || persistedVoiceURI === '') {
    return { kind: 'none' };
  }
  if (offeredVoiceURIs.includes(persistedVoiceURI)) {
    return { kind: 'available', voiceURI: persistedVoiceURI };
  }
  const stillHonored =
    piperOnlyPreference({
      preferredVoiceURI: persistedVoiceURI,
      piperAvailable,
      piperVoiceURIs,
    }) !== undefined;
  return stillHonored
    ? { kind: 'retained', voiceURI: persistedVoiceURI }
    : { kind: 'dropped', voiceURI: persistedVoiceURI };
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
// catálogo Piper e a preferência de Persona — réplica de
// `resolveDefaultPiperVoiceURI` (`piper-tts.ts`), coberta pelo gate de
// paridade desde a SPEC-0047; teste de referência:
// `apps/desktop/tests/renderer.speech-parity.test.ts`.
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
// `onDone` (SPEC-0052/D16) — opcional, chamado exatamente uma vez em `ended`
// ou `error`; ausente para os chamadores que não precisam saber o fim (botão
// "Testar voz").
function playPiperAudio(audio, onDone, onFailure, onPlaying) {
  const done = onDone || (() => {});
  try {
    const blob = new Blob([audio.wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const player = new Audio(url);
    const revoke = () => URL.revokeObjectURL(url);
    // SPEC-0053 (Escopo 7): só o evento nativo `playing` da tentativa
    // corrente ativa `playbackActive` — nunca `audio.play()` resolvido nem a
    // criação do `<audio>`.
    if (onPlaying !== undefined) {
      player.addEventListener('playing', () => {
        onPlaying();
      });
    }
    player.addEventListener('ended', () => {
      revoke();
      done();
    });
    player.addEventListener('error', () => {
      revoke();
      if (onFailure !== undefined) {
        onFailure();
      } else {
        done();
      }
    });
    void player.play();
  } catch {
    // fail-safe: nunca propaga
    if (onFailure !== undefined) {
      onFailure();
    } else {
      done();
    }
  }
}

// Roteador único usado tanto pelo botão "🔊 Ouvir" quanto por "Testar voz"
// com a voz da Persona ativa: decide a origem e fala por ela; se o backend
// Piper devolver ausência de áudio (indisponível/erro/timeout), cai no
// `speechOutput` do SO — fallback fail-closed (ADR-0021(c)).
//
// `onDone` (SPEC-0052/D16, opcional): chamado EXATAMENTE UMA VEZ, em
// `ended`/`error` do `<audio>` Piper, `end`/`error` do utterance do SO,
// imediatamente quando o backend é `none` ou quando nenhum utterance chega a
// ser criado (R3), OU por watchdog `clamp(8_000 + 80 × caracteres, 8_000,
// 120_000)` — armado só quando um `onDone` real é passado (o modo
// hands-free usa isto para saber quando reabrir o microfone; os demais
// chamadores, como o botão "🔊 Ouvir", seguem sem passar `onDone` e sem
// nenhum timer criado).
function speakText(text, onDone) {
  const done = onDone || (() => {});
  let settled = false;
  let watchdogTimer;
  // SPEC-0053 (Escopo 7): sinais visuais locais compartilhados por playback
  // manual e hands-free — só eventos nativos reais os movem, nunca o
  // pedido/criação/resolução de IPC.
  const token = beginPlaybackAttempt();
  const finish = () => {
    if (settled) {
      return;
    }
    settled = true;
    if (watchdogTimer !== undefined) {
      clearTimeout(watchdogTimer);
    }
    endPlaybackAttempt(token);
    done();
  };
  if (onDone !== undefined) {
    watchdogTimer = setTimeout(finish, speakingWatchdogMs(text));
  }

  const backend = currentVoiceBackend();
  const speakWithLocalFallback = () => {
    if (!speechOutput.isAvailable()) {
      finish();
      return;
    }
    speechFailureObserver = () => {
      setGlobalAlert('voice-failure', new Error('A reprodução de voz falhou.'));
    };
    handsFreeUtteranceObserver = finish;
    playbackStartObserver = () => activatePlayback(token);
    speechOutput.speak(text);
    if (handsFreeUtteranceObserver !== null) {
      // Sem utterance local real: indisponibilidade esperada, nunca erro global.
      handsFreeUtteranceObserver = null;
      playbackStartObserver = null;
      speechFailureObserver = null;
      finish();
    }
  };
  const recoverFromPiperFailure = () => {
    // A conclusão pertence ao fallback: encerrar antes dele reabre o microfone
    // hands-free e remove o estado visual de fala prematuramente. Volta a
    // `playbackPending` (nunca `speaking`) antes do fallback — a sequência
    // visual só reativa `speaking` se o fallback do SO emitir `start`.
    revertToPending(token);
    speakWithLocalFallback();
  };
  if (backend.backend === 'none') {
    finish();
    return;
  }
  if (backend.backend === 'piper') {
    window.atlas.tts
      .speak(text, backend.voiceURI)
      .then((audio) => {
        if (audio === undefined) {
          speakWithLocalFallback();
          return;
        }
        playPiperAudio(audio, finish, recoverFromPiperFailure, () => activatePlayback(token));
      })
      .catch(() => {
        speakWithLocalFallback();
      });
    return;
  }
  if (backend.backend === 'os') {
    speakWithLocalFallback();
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
    // SPEC-0052 (D9/achado A6): a disponibilidade de saída de voz é um dos
    // três fatores do toggle hands-free — reavaliado no MESMO gatilho.
    refreshHandsFreeToggle();
  });
}

if (window.speechSynthesis !== undefined) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    for (const button of pendingSpeakButtons) {
      refreshSpeakButton(button);
    }
    populatePersonaVoiceSelect();
    // SPEC-0052 (D9/achado A6): mesmo gatilho reavalia o toggle hands-free.
    refreshHandsFreeToggle();
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

document.getElementById('persona-status-toggle').addEventListener('click', () => {
  const toggle = document.getElementById('persona-status-toggle');
  const status = document.getElementById('status');
  const open = status.hidden;
  status.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
});

function setPersonaFormDisclosure(open, invoker) {
  personaForm.hidden = !open;
  document.querySelectorAll('[aria-controls="persona-form"]').forEach((control) => {
    control.setAttribute('aria-expanded', String(open && control === invoker));
  });
}

// Resíduo (1) da SPEC-0043 (Decisão D2): `voiceURI` persistida que o modo
// corrente não pode oferecer AGORA por razão ambiental, mas que a política
// Piper-only ainda honraria (desfecho `retained` de
// `resolvePersistedVoiceSelection`). `undefined` fora desse caso. Definida
// por `openPersonaForm`; limpa ao cancelar, ao submeter com sucesso e ao
// abrir o formulário de Persona nova — nunca vaza de uma Persona para outra.
let retainedVoiceURI;

// Snapshot único das vozes efetivamente oferecidas pelo modo corrente
// (Piper OFERECIDO + locais do SO, D8) — usado tanto para popular o
// `<select>` quanto para `resolvePersistedVoiceSelection` em
// `openPersonaForm` (SPEC-0043, achado A5): os dois lados leem do MESMO
// `offeredPiperVoices()` + `synth.getVoices()`, nunca snapshots divergentes.
function offeredVoiceSelectionSnapshot() {
  const piperOnly = isPiperOnlyMode({
    piperAvailable,
    piperVoiceURIs: piperVoices.map((v) => v.voiceURI),
  });
  const offeredPiper = offeredPiperVoices();
  const localVoices = piperOnly
    ? []
    : synth.getVoices().filter((voice) => voice.localService === true);
  return { offeredPiper, localVoices };
}

// `<select>` de vozes do formulário (SPEC-0041, item 3 do Escopo; estendido
// pela SPEC-0043, resíduo 1): em modo Piper-only, só "Nenhuma (voz padrão)" +
// vozes Piper; em modo degradado, só "Nenhuma (voz padrão)" + vozes locais
// do SO — nunca as duas origens ao mesmo tempo (D8). Reavaliado nos dois
// gatilhos de D17 (`voiceschanged` E a resposta de `atlas:tts:voices`).
// Rótulo de origem visível (Artigo 7). Preserva a opção selecionada quando
// ela ainda existir na lista nova. Quando `retainedVoiceURI` está definido e
// não coincide com nenhuma opção já listada, acrescenta UMA `<option>`
// extra ao final, ANTES de restaurar `previousValue` e ANTES de
// `refreshTestVoiceButton()` (D2) — sobrevive às reexecuções disparadas
// pelos dois gatilhos enquanto o formulário estiver aberto, e não duplica
// se a `voiceURI` voltar a ser oferecida.
function populatePersonaVoiceSelect() {
  const previousValue = personaVoiceSelect.value;
  const { offeredPiper: offered, localVoices } = offeredVoiceSelectionSnapshot();

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
  if (
    retainedVoiceURI !== undefined &&
    ![...personaVoiceSelect.options].some((option) => option.value === retainedVoiceURI)
  ) {
    const retainedOption = document.createElement('option');
    retainedOption.value = retainedVoiceURI;
    retainedOption.textContent = 'Voz salva (indisponível agora)';
    personaVoiceSelect.appendChild(retainedOption);
  }
  if ([...personaVoiceSelect.options].some((option) => option.value === previousValue)) {
    personaVoiceSelect.value = previousValue;
  }

  refreshTestVoiceButton();
}

// Resíduo (1) da SPEC-0043 (Decisão D7): "Testar voz" habilitado SSE o valor
// selecionado é uma das vozes EFETIVAMENTE reproduzíveis agora (Piper
// oferecidas ou locais do SO) — nunca a opção retida, nunca "Nenhuma (voz
// padrão)". Refina o critério 9 da SPEC-0041 (que olhava só o conjunto de
// opções oferecidas, não o valor selecionado): com a opção retida existindo,
// aquele critério deixaria o botão habilitado sobre uma seleção que
// comprovadamente não soa — o "ativo-porém-mudo" que o achado A2 da
// SPEC-0035 proíbe.
function refreshTestVoiceButton() {
  const selected = personaVoiceSelect.value;
  const piperURIs = offeredPiperVoices().map((voice) => voice.voiceURI);
  const localURIs = synth
    .getVoices()
    .filter((voice) => voice.localService === true)
    .map((voice) => voice.voiceURI);
  const playable =
    selected !== '' && (piperURIs.includes(selected) || localURIs.includes(selected));
  personaTestVoiceButton.disabled = !playable;
  personaTestVoiceButton.title = playable ? '' : 'voz indisponível neste sistema';
}

personaVoiceSelect.addEventListener('change', () => {
  refreshTestVoiceButton();
});

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

  // Único `resolvePersistedVoiceSelection` (réplica local, SPEC-0043,
  // critério 8) deriva TANTO a seleção do `<select>` QUANTO o texto do
  // aviso — nenhuma condição de voz duplicada em paralelo. `offeredVoiceURIs`
  // vem do MESMO snapshot que alimenta `<select>` e `currentVoiceBackend`
  // (achado A5) — nunca uma política divergente entre os dois.
  const persistedVoiceURI = detail && detail.voiceURI ? detail.voiceURI : undefined;
  const { offeredPiper, localVoices } = offeredVoiceSelectionSnapshot();
  const offeredVoiceURIs = [
    ...offeredPiper.map((voice) => voice.voiceURI),
    ...localVoices.map((voice) => voice.voiceURI),
  ];
  const outcome = resolvePersistedVoiceSelection({
    persistedVoiceURI,
    offeredVoiceURIs,
    piperAvailable,
    piperVoiceURIs: piperVoices.map((voice) => voice.voiceURI),
  });

  // D2/D12: `retained` preserva a `voiceURI` como opção selecionável e
  // selecionada; `dropped`/`none` caem em "Nenhuma (voz padrão)" — nunca
  // `selectedIndex === -1` (estado ambíguo). Limpo ao abrir a Persona nova
  // (persistedVoiceURI ausente ⇒ outcome.kind === 'none' ⇒ undefined).
  retainedVoiceURI = outcome.kind === 'retained' ? outcome.voiceURI : undefined;
  populatePersonaVoiceSelect();

  if (outcome.kind === 'available' || outcome.kind === 'retained') {
    personaVoiceSelect.value = outcome.voiceURI;
  } else {
    personaVoiceSelect.value = '';
  }

  // Aviso `#persona-voice-legacy` (Artigo 7): dois textos mutuamente
  // exclusivos, nunca ambos ao mesmo tempo. `dropped` mantém, byte a byte, o
  // texto já existente da SPEC-0041 (D6) — nenhuma escrita ocorre só por
  // abrir o formulário; o aviso só explica o que o submit fará.
  if (outcome.kind === 'dropped') {
    personaVoiceLegacyEl.textContent =
      'Esta Persona tem uma voz do sistema salva. A fala já está usando a voz Piper padrão; salvar este formulário substituirá o valor salvo.';
  } else if (outcome.kind === 'retained') {
    personaVoiceLegacyEl.textContent =
      'Esta Persona tem uma voz salva que não está disponível neste momento. Salvar este formulário preserva o valor salvo; escolher outra voz na lista o substitui.';
  } else {
    personaVoiceLegacyEl.textContent = '';
  }

  // Critério 15: `refreshTestVoiceButton()` já rodou dentro de
  // `populatePersonaVoiceSelect()` acima, mas com o valor do `<select>`
  // ainda não ajustado ao desfecho — reavalia agora, com a seleção final.
  refreshTestVoiceButton();

  setPersonaFormDisclosure(true, document.activeElement);
}

document.getElementById('persona-new').addEventListener('click', () => {
  openPersonaForm(null);
});

document.getElementById('persona-form-cancel').addEventListener('click', () => {
  setPersonaFormDisclosure(false);
  // Critério 11: retainedVoiceURI nunca vaza de uma Persona para outra.
  retainedVoiceURI = undefined;
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
      setPersonaFormDisclosure(false);
      // Critério 11: submit com sucesso limpa retainedVoiceURI — nunca vaza
      // de uma Persona para outra.
      retainedVoiceURI = undefined;
      const closedSessions = (result && result.closedSessions) || [];
      if (closedSessions.length > 0) {
        // Sucesso de update na Persona ATIVA (D9): nenhum Core sobrevive à
        // edição sob identidade superada — a sessão corrente já foi
        // encerrada pelo bridge; o renderer limpa o transcript, avisa e
        // reabre a conversa.
        return reopenChatSession(
          'session-reopened-persona',
          'Persona atualizada — nova conversa iniciada',
        );
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
      editButton.setAttribute('aria-controls', 'persona-form');
      editButton.setAttribute('aria-expanded', 'false');
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

function timelineAtEnd(transcript) {
  return transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight <= 48;
}

function refreshNewActivity() {
  const button = document.getElementById('new-activity');
  button.hidden = unseenTimelineEvents === 0;
  button.textContent = `${unseenTimelineEvents} nova${unseenTimelineEvents === 1 ? '' : 's'} atividade`;
}

function selectTimelineEvent(event) {
  if (selectedTimelineEvent !== null) selectedTimelineEvent.dataset.eventSelected = 'false';
  selectedTimelineEvent = event;
  event.dataset.eventSelected = 'true';
  const detail = document.getElementById('timeline-detail');
  detail.textContent = event.dataset.eventDetail;
  detail.hidden = false;
  detail.focus();
}

function appendTimelineEvent(type, kind, detail, summary) {
  const transcript = document.getElementById('chat-transcript');
  const atEnd = timelineAtEnd(transcript);
  const event = document.createElement('div');
  event.tabIndex = 0;
  event.setAttribute('role', 'button');
  event.className = 'timeline-event';
  event.dataset.eventType = type;
  event.dataset.eventKind = kind;
  event.dataset.eventDetail = detail;
  const kindEl = document.createElement('span');
  kindEl.className = 'timeline-event-kind';
  kindEl.textContent = `${type}/${kind}`;
  const summaryEl = document.createElement('span');
  summaryEl.className = 'timeline-event-summary';
  summaryEl.textContent = summary;
  event.append(kindEl, summaryEl);
  event.addEventListener('click', () => selectTimelineEvent(event));
  event.addEventListener('keydown', (keyboardEvent) => {
    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') selectTimelineEvent(event);
  });
  transcript.appendChild(event);
  if (atEnd) {
    transcript.scrollTop = transcript.scrollHeight;
  } else {
    unseenTimelineEvents += 1;
    refreshNewActivity();
  }
  return event;
}

function resetTimeline() {
  document.getElementById('chat-transcript').textContent = '';
  const detail = document.getElementById('timeline-detail');
  detail.textContent = '';
  detail.hidden = true;
  selectedTimelineEvent = null;
  unseenTimelineEvents = 0;
  refreshNewActivity();
  clearCurrentReply();
}

function reopenChatSession(kind, detail) {
  return window.atlas.chat
    .open()
    .then((session) => {
      chatSession = session;
      resetTimeline();
      appendTimelineEvent('system', kind, detail, detail);
      clearGlobalAlert();
    })
    .catch((error) => {
      setGlobalAlert('session-failure', error);
      throw error;
    });
}

function clearCurrentReply() {
  currentReplyEvent = null;
  const reply = document.getElementById('current-reply');
  reply.textContent = '';
  reply.dataset.preview = '';
  document.getElementById('show-complete-reply').hidden = true;
}

function logicalLineCount(text) {
  return text.split(/\r\n|[\n\r]/).length;
}

function renderCurrentReply(text, event) {
  currentReplyEvent = event;
  const reply = document.getElementById('current-reply');
  reply.textContent = text;
  const short = Array.from(text).length <= 480 && logicalLineCount(text) <= 4;
  const long = !short;
  reply.dataset.preview = long ? 'long' : '';
  document.getElementById('show-complete-reply').hidden = !long;
}

// SPEC-0053 (Escopo 5/CA15): abre o drawer, seleciona o painel Sessão e o
// evento `assistant/reply` correspondente — sem chamar `window.atlas`.
function openSessionPanel() {
  drawer.openDrawer();
  for (const control of drawer.controls) {
    const panelId = control.getAttribute('aria-controls');
    const panel = panelId === null ? null : document.getElementById(panelId);
    const isSession = panelId === 'panel-session';
    control.setAttribute('aria-expanded', String(isSession));
    if (panel !== null) {
      panel.hidden = !isSession;
    }
  }
  // SPEC-0054 (Escopo 9): troca programática de painel — se `Sistema`
  // estava aberto, seu timer cessa (mesma disciplina do clique manual).
  stopSystemPanelTimer();
}

document.getElementById('show-complete-reply').addEventListener('click', () => {
  if (currentReplyEvent !== null) {
    openSessionPanel();
    selectTimelineEvent(currentReplyEvent);
  }
});

document.getElementById('new-activity').addEventListener('click', () => {
  const transcript = document.getElementById('chat-transcript');
  transcript.scrollTop = transcript.scrollHeight;
  unseenTimelineEvents = 0;
  refreshNewActivity();
});

document.getElementById('chat-transcript').addEventListener('scroll', () => {
  const transcript = document.getElementById('chat-transcript');
  if (timelineAtEnd(transcript)) {
    unseenTimelineEvents = 0;
    refreshNewActivity();
  }
});

function appendTurn(snapshot) {
  for (const step of snapshot.steps) {
    const marker = step.denialKind !== undefined ? ` [${step.denialKind}]` : '';
    appendTimelineEvent(
      'tool',
      'step',
      `🔧 ${step.tool} → ${step.outcome}${marker}`,
      `🔧 ${step.tool} → ${step.outcome}${marker}`,
    );
  }
  const replyEvent = appendTimelineEvent('assistant', 'reply', snapshot.reply, snapshot.reply);
  const speakButton = document.createElement('button');
  speakButton.type = 'button';
  // SPEC-0053 (Escopo 9/CA11): rótulo de controle sem emoji.
  speakButton.textContent = 'Ouvir';
  speakButton.addEventListener('click', (event) => {
    event.stopPropagation();
    refreshSpeakButton(speakButton);
    if (!speakButton.disabled) {
      clearGlobalAlert();
      // `playbackPending`/`playbackActive` (Escopo 7) são geridos dentro de
      // `speakText`, atados a eventos nativos reais — nenhum sinalizador
      // manual aqui.
      speakText(snapshot.reply);
    }
  });
  refreshSpeakButton(speakButton);
  pendingSpeakButtons.add(speakButton);
  replyEvent.appendChild(speakButton);
  renderCurrentReply(snapshot.reply, replyEvent);
  for (const fact of snapshot.learned) {
    appendTimelineEvent('memory', 'learned', `💡 lembrado: ${fact}`, `💡 lembrado: ${fact}`);
  }
}

window.atlas.chat
  .open()
  .then((session) => {
    chatSession = session;
    appendTimelineEvent(
      'system',
      'session-opened',
      '(sessão de chat aberta)',
      '(sessão de chat aberta)',
    );
    clearGlobalAlert();
  })
  .catch((error) => setGlobalAlert('session-failure', error));

// Entrada por voz (STT, item 2.3-restante / SPEC-0046): push-to-talk por
// alternância — um clique inicia a gravação, outro a encerra (D4). Captura
// no renderer (`getUserMedia` → `AudioContext(16kHz)` →
// `ScriptProcessorNode` → `GainNode(0)` → `destination`, D5), transcrição
// SEMPRE no main process (`stt-engine.ts`, whisper.cpp local). O texto
// nunca é enviado automaticamente (D6) — só anexado ao campo de entrada.
const micButton = document.getElementById('mic-button');
const micCancelButton = document.getElementById('mic-cancel-button');
const micStatusEl = document.getElementById('mic-status');

const STT_RECORD_LIMIT_MS = 30_000;

// 'unavailable' | 'idle' | 'recording' | 'transcribing' — reflete o Escopo
// item 5 da SPEC (cinco estados de UI; 'erro' é um aviso textual sobre
// 'idle', não um estado próprio de `micState`).
let micState = 'unavailable';
let micUnavailableReason = 'entrada por voz indisponível';
let activeRecording = null;

function micBusy() {
  return micState === 'recording' || micState === 'transcribing';
}

// CA34 (segunda direção): enquanto grava ou transcreve, o botão de envio do
// chat e o seletor de Persona ficam desabilitados — a mesma serialização de
// gestos já em vigor para turno de chat/ask (SPEC-0037/0038). Desde a
// SPEC-0048, `#chat-send` soma também `askInFlight`: um `ask` em voo passa a
// bloquear o envio de um turno de chat, fechando o achado registrado pela
// SPEC-0047 (`#chat-input` fica deliberadamente fora — D3 da SPEC-0048).
//
// SPEC-0051 (Frente 5): `#chat-cancel` (gesto de escape) é calculado aqui —
// origem única — visível/habilitado SSE `chatTurnInFlight` (não entra em
// `micBusy()`: o gesto cancela o round-trip cognitivo, não a transcrição
// local — `#mic-cancel-button` segue intacto e separado).
function refreshChatControlsForMic() {
  const disabled = chatTurnInFlight || askInFlight || micBusy();
  const sendButton = document.getElementById('chat-send');
  if (sendButton !== null) {
    sendButton.disabled = disabled;
  }
  if (personaSelect !== undefined && personaSelect !== null) {
    personaSelect.disabled = disabled;
  }
  const cancelButton = document.getElementById('chat-cancel');
  if (cancelButton !== null) {
    cancelButton.hidden = !chatTurnInFlight;
    cancelButton.disabled = !chatTurnInFlight;
  }
}

function setMicStatus(text) {
  micStatusEl.textContent = text;
  refreshPresence();
}

function refreshMicButtons() {
  const externalBusy = chatTurnInFlight || askInFlight;
  if (micState === 'unavailable') {
    micButton.disabled = true;
    // SPEC-0053 (Escopo 9/CA11): rótulo de controle sem emoji.
    micButton.textContent = 'Falar';
    micButton.title = micUnavailableReason;
    micCancelButton.hidden = true;
    return;
  }
  micButton.title = '';
  if (micState === 'idle') {
    micButton.disabled = externalBusy;
    // SPEC-0053 (Escopo 9/CA11): rótulo de controle sem emoji.
    micButton.textContent = 'Falar';
    micCancelButton.hidden = true;
  } else if (micState === 'recording') {
    micButton.disabled = false;
    micButton.textContent = 'Parar gravação';
    micCancelButton.hidden = false;
    micCancelButton.disabled = false;
  } else if (micState === 'transcribing') {
    micButton.disabled = true;
    micButton.textContent = 'Transcrevendo…';
    // R3: "Cancelar" segue visível e habilitado durante a transcrição — a
    // janela de timeout pode chegar a 170s (D14), então o usuário nunca
    // fica sem uma saída visível.
    micCancelButton.hidden = false;
    micCancelButton.disabled = false;
  }
  refreshPresence();
}

const STT_FAILURE_MESSAGES = {
  'invalid-audio': 'Áudio inválido — tente gravar novamente.',
  'audio-too-long': 'Gravação longa demais para transcrever — tente uma fala mais curta.',
  'io-failed': 'Falha ao salvar o áudio temporário para transcrição.',
  'empty-transcript': 'Não foi possível reconhecer fala no áudio gravado.',
  'engine-failed': 'O motor de transcrição falhou.',
  'engine-unavailable': 'Motor de transcrição indisponível.',
  timeout: 'A transcrição demorou demais e foi interrompida.',
  cancelled: 'Transcrição cancelada.',
  busy: 'Já existe uma transcrição em andamento.',
};

// Mapeamento dos dez desfechos pinados (D12) para um aviso textual visível e
// distinguível (CA33) — nunca um estado silencioso.
function describeSttFailure(reason) {
  return STT_FAILURE_MESSAGES[reason] || 'Falha na transcrição por voz.';
}

function reportVoiceFailure(reason, detail) {
  if (['io-failed', 'engine-failed', 'timeout'].includes(reason)) {
    setGlobalAlert('voice-failure', new Error(detail || describeSttFailure(reason)));
  }
}

// Converte os buffers `Float32` acumulados por `onaudioprocess` (faixa
// [-1, 1]) para `Int16` (PCM assinado 16 bits) — formato exigido pela
// fronteira `'atlas:stt:transcribe'` (D18).
function floatChunksToInt16(chunks) {
  let length = 0;
  for (const chunk of chunks) {
    length += chunk.length;
  }
  const output = new Int16Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      const clamped = Math.max(-1, Math.min(1, chunk[i]));
      output[offset] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      offset += 1;
    }
  }
  return output;
}

// Anexa a transcrição ao campo de entrada do chat SEM sobrescrever o que já
// estava lá (D6/CA31) — o envio continua sendo um gesto humano separado.
function appendTranscription(text) {
  const inputEl = document.getElementById('chat-input');
  const current = inputEl.value;
  inputEl.value = current === '' ? text : `${current} ${text}`;
}

function loadSttAvailability() {
  if (window.atlas === undefined || window.atlas.stt === undefined) {
    micState = 'unavailable';
    micUnavailableReason = 'entrada por voz indisponível';
    refreshMicButtons();
    return Promise.resolve();
  }
  return window.atlas.stt
    .available()
    .then((info) => {
      if (info && info.available === true) {
        micState = 'idle';
        micUnavailableReason = '';
      } else {
        micState = 'unavailable';
        micUnavailableReason = describeSttFailure((info && info.reason) || 'engine-unavailable');
      }
      refreshMicButtons();
    })
    .catch(() => {
      micState = 'unavailable';
      micUnavailableReason = 'entrada por voz indisponível';
      refreshMicButtons();
    });
}

function releaseCaptureResources(capture) {
  try {
    capture.processor.disconnect();
  } catch {
    // fail-safe: nunca propaga
  }
  try {
    capture.source.disconnect();
  } catch {
    // fail-safe: nunca propaga
  }
  try {
    capture.gain.disconnect();
  } catch {
    // fail-safe: nunca propaga
  }
  for (const track of capture.stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // fail-safe: nunca propaga
    }
  }
  try {
    capture.audioContext.close();
  } catch {
    // fail-safe: nunca propaga
  }
}

// Encerra a gravação por UM dos três caminhos ('stop' | 'cancel' | 'limit')
// — em TODOS eles: desconecta os nós, para as tracks, fecha o
// `AudioContext`, e chama `'atlas:stt:capture:end'` em `finally` (CA26).
async function finishRecording(reason) {
  const capture = activeRecording;
  if (capture === null || capture.finished) {
    return;
  }
  capture.finished = true;
  clearTimeout(capture.limitTimer);
  releaseCaptureResources(capture);
  try {
    await window.atlas.stt.captureEnd();
  } finally {
    activeRecording = null;
  }

  if (reason === 'cancel') {
    micState = 'idle';
    setMicStatus('Gravação cancelada.');
    refreshMicButtons();
    refreshChatControlsForMic();
    return;
  }

  // 'stop' ou 'limit' — em ambos os casos a gravação SEGUE para a
  // transcrição, nunca descarta o áudio em silêncio (D14).
  micState = 'transcribing';
  clearGlobalAlert();
  setMicStatus(
    reason === 'limit' ? 'Tempo máximo de gravação atingido — transcrevendo…' : 'Transcrevendo…',
  );
  refreshMicButtons();
  refreshChatControlsForMic();

  const pcm = floatChunksToInt16(capture.chunks);
  try {
    const result = await window.atlas.stt.transcribe(pcm.buffer, 16000);
    if (result && result.ok) {
      appendTranscription(result.text);
      setMicStatus('');
    } else {
      setMicStatus(describeSttFailure(result && result.reason));
      reportVoiceFailure(result && result.reason);
    }
  } catch {
    // fail-safe: nunca propaga para o fluxo do chat
    setMicStatus('Falha inesperada na transcrição.');
    setGlobalAlert('voice-failure', new Error('Falha inesperada na transcrição.'));
  } finally {
    micState = 'idle';
    refreshMicButtons();
    refreshChatControlsForMic();
  }
}

async function startRecording() {
  if (micState !== 'idle') {
    return;
  }
  setMicStatus('');
  micState = 'recording';
  refreshMicButtons();
  refreshChatControlsForMic();

  // Janela de captura (D17): `begin` ANTES de `getUserMedia` — o main
  // concede a permissão de mídia só enquanto essa janela está aberta.
  await window.atlas.stt.captureBegin();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    await window.atlas.stt.captureEnd();
    micState = 'idle';
    setMicStatus('Permissão de microfone negada ou indisponível.');
    refreshMicButtons();
    refreshChatControlsForMic();
    return;
  }
  clearGlobalAlert();

  // Rearme (R1): `begin` de novo assim que `getUserMedia` resolve — o
  // watchdog de 35s volta a contar do início REAL da captura, não da
  // abertura do diálogo nativo de permissão do SO.
  await window.atlas.stt.captureBegin();

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextCtor({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const gain = audioContext.createGain();
  gain.gain.value = 0;

  const chunks = [];
  processor.onaudioprocess = (event) => {
    const channelData = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(channelData));
  };
  source.connect(processor);
  // GainNode(0) → destination: mantém o grafo puxando amostras sem eco
  // audível (D5) — nunca reproduz a captura no alto-falante.
  processor.connect(gain);
  gain.connect(audioContext.destination);

  const capture = {
    stream,
    audioContext,
    source,
    processor,
    gain,
    chunks,
    finished: false,
    limitTimer: undefined,
  };
  activeRecording = capture;

  capture.limitTimer = setTimeout(() => {
    void finishRecording('limit');
  }, STT_RECORD_LIMIT_MS);
}

micButton.addEventListener('click', () => {
  if (micState === 'idle') {
    void startRecording();
  } else if (micState === 'recording') {
    void finishRecording('stop');
  }
  // 'transcribing'/'unavailable': o botão está desabilitado, sem-op.
});

micCancelButton.addEventListener('click', () => {
  if (micState === 'recording') {
    void finishRecording('cancel');
  } else if (micState === 'transcribing') {
    // O desfecho 'cancelled' chega pela MESMA promessa de
    // `window.atlas.stt.transcribe(...)` em voo (dentro de
    // `finishRecording`) — nenhum estado duplicado aqui (CA28).
    window.atlas.stt.cancel();
  }
});

loadSttAvailability();

document.getElementById('chat-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (chatSession === null) {
    return;
  }
  // SPEC-0048/D2: guarda explícita, além do atributo `disabled` do botão —
  // um `submit` despachado programaticamente ou por submissão implícita do
  // `<form>` contorna o botão. Serializa contra o próprio turno de chat e
  // contra um `ask` em voo (fecha o achado da SPEC-0047).
  if (chatTurnInFlight || askInFlight) {
    return;
  }
  const inputEl = document.getElementById('chat-input');
  const input = inputEl.value.trim();
  if (input === '') {
    return;
  }
  clearCurrentReply();
  clearGlobalAlert();
  appendTimelineEvent('user', 'message', `> ${input}`, `> ${input}`);
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
  refreshPresence();
  // SPEC-0052/D23: gancho de início confirmado — chamado IMEDIATAMENTE após
  // marcar o turno em voo e ANTES de `window.atlas.chat.send`. `dispatchEvent`
  // é síncrono, então o modo hands-free lê a flag logo depois de despachar o
  // `submit` (nesta mesma função, para o caminho de auto-envio) e sabe, sem
  // tick/timer/promessa, se o manipulador chegou até aqui. No-op fora do
  // modo hands-free.
  notifyHandsFreeTurnStarted();
  refreshPermissionsPanelState();
  window.atlas.chat
    .send(chatSession, input)
    .then((snapshot) => {
      appendTurn(snapshot);
      inputEl.value = '';
      notifyHandsFreeTurnSettled(snapshot);
    })
    .catch((error) => {
      if (cancelNoticePending) {
        const cancelledEvent = appendTimelineEvent(
          'system',
          'cancelled',
          `⚠️ ${error.message ?? error}\n${CANCEL_NOTICE}`,
          `⚠️ ${error.message ?? error}`,
        );
        const notice = document.createElement('span');
        notice.hidden = true;
        notice.textContent = CANCEL_NOTICE;
        cancelledEvent.appendChild(notice);
        cancelNoticePending = false;
      } else {
        setGlobalAlert('chat-failure', error);
      }
      notifyHandsFreeTurnFailed(error);
    })
    .finally(() => {
      inputEl.disabled = false;
      // SPEC-0048/D1: sem atribuição direta a `sendButton.disabled` aqui — o
      // `.finally` deixa de recalcular o estado por conta própria. O valor
      // final vem só de `refreshChatControlsForMic()`, chamada logo abaixo
      // por `refreshPermissionsPanelState()`; senão um turno de chat que
      // assenta durante um `ask` em voo reabriria o botão por outro caminho.
      personaSelect.disabled = false;
      chatTurnInFlight = false;
      refreshPermissionsPanelState();
      refreshPresence();
      inputEl.focus();
    });
});

// Gesto de escape do turno de chat (SPEC-0051): visível/habilitado só
// enquanto `chatTurnInFlight` (`refreshChatControlsForMic`). O clique só
// chama `window.atlas.cancel()` e marca a flag — nunca escreve texto nem
// mexe em `chatTurnInFlight` diretamente, que cai sozinho pelo `.finally`
// acima quando a promessa do turno rejeitar.
document.getElementById('chat-cancel').addEventListener('click', () => {
  window.atlas.cancel().then((outcome) => {
    if (outcome && outcome.cancelled === true) {
      cancelNoticePending = true;
    }
  });
});

// Painel de memória (item 2.4): lista os fatos memorizados e permite
// esquecer um por vez — round-trips stateless (`atlas.memory.list`/`forget`,
// o Core sobe e desliga por chamada). O renderer só pinta `FactSnapshot[]`
// plano, sem conhecer `Fact`/`packages/*`.
function memoryTitle(text) {
  const first = text
    .split(/\r\n|[\n\r]/)
    .map((line) => line.trim())
    .find((line) => line !== '');
  if (first === undefined) return 'Memória sem título';
  const points = Array.from(first);
  return points.length > 72 ? `${points.slice(0, 69).join('')}…` : first;
}

function renderMemoryList(facts) {
  const listEl = document.getElementById('memory-list');
  listEl.textContent = '';
  for (const fact of facts) {
    const item = document.createElement('li');
    const title = document.createElement('button');
    const detail = document.createElement('pre');
    detail.className = 'memory-detail';
    detail.id = `memory-detail-${fact.id}`;
    detail.hidden = true;
    title.type = 'button';
    title.textContent = memoryTitle(fact.text);
    title.setAttribute('aria-controls', detail.id);
    title.setAttribute('aria-expanded', 'false');
    title.addEventListener('click', () => {
      const opening = detail.hidden;
      listEl.querySelectorAll('.memory-detail').forEach((other) => {
        other.hidden = true;
      });
      listEl.querySelectorAll('[aria-controls^="memory-detail-"]').forEach((other) => {
        other.setAttribute('aria-expanded', 'false');
      });
      detail.hidden = !opening;
      title.setAttribute('aria-expanded', String(opening));
    });
    detail.textContent = [
      fact.text,
      '',
      `id: ${fact.id}`,
      `data: ${fact.createdAt}`,
      `origem: ${fact.source}`,
      `categoria: ${fact.category}`,
      ...(fact.subject !== undefined ? [`subject: ${fact.subject}`] : []),
    ].join('\n');
    const forgetButton = document.createElement('button');
    forgetButton.type = 'button';
    forgetButton.textContent = 'Esquecer';
    forgetButton.addEventListener('click', () => {
      forgetButton.disabled = true;
      window.atlas.memory
        .forget(fact.id)
        .then(() => loadMemoryList())
        .catch((error) => {
          document.getElementById('memory-error').textContent = `⚠️ ${error.message ?? error}`;
          return loadMemoryList().finally(() => {
            document.getElementById('memory-error').textContent = `⚠️ ${error.message ?? error}`;
          });
        });
    });
    item.appendChild(title);
    item.appendChild(forgetButton);
    item.appendChild(detail);
    listEl.appendChild(item);
  }
}

function loadMemoryList() {
  const errorEl = document.getElementById('memory-error');
  return window.atlas.memory
    .list()
    .then((facts) => {
      errorEl.textContent = '';
      renderMemoryList(facts);
    })
    .catch((error) => {
      errorEl.textContent = `⚠️ ${error.message ?? error}`;
    });
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

function setupRootsDisclosure(toggleId, detailId) {
  const toggle = document.getElementById(toggleId);
  const detail = document.getElementById(detailId);
  toggle.addEventListener('click', () => {
    const open = detail.hidden;
    detail.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
}

setupRootsDisclosure('read-roots-toggle', 'read-roots-detail');
setupRootsDisclosure('write-roots-toggle', 'write-roots-detail');

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
  document.getElementById('read-roots-toggle').textContent = `Leitura (${pendingReadRoots.length})`;
  document.getElementById('write-roots-toggle').textContent =
    `Escrita (${pendingWriteRoots.length})`;
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
  // SPEC-0059 (D16): marca a aplicação de política em curso — desabilita
  // ADICIONALMENTE #permissions-apply/#network-apply enquanto esta pendente.
  policyApplicationInFlight = true;
  refreshPermissionsPanelState();
  window.atlas.permissions
    .select({ readRoots: [...pendingReadRoots], writeRoots: [...pendingWriteRoots] })
    .then(() => {
      // Sucesso: nenhum Core sobrevive à aplicação sob política superada
      // (D7) — a sessão de chat corrente já foi encerrada pelo bridge;
      // o renderer limpa o transcript, avisa e reabre a conversa.
      return reopenChatSession(
        'session-reopened-permissions',
        'Permissões alteradas — nova conversa iniciada',
      );
    })
    .then(() => loadStatus())
    .catch((error) => {
      // Rejeição (caminho inválido, operação em voo, concessão não
      // confirmada): transcript e conversa corrente ficam intactos; as
      // listas recarregam a partir do status real (nunca divergentes).
      errorEl.textContent = `⚠️ ${error.message ?? error}`;
      return loadStatus();
    })
    .finally(() => {
      policyApplicationInFlight = false;
      refreshPermissionsPanelState();
    });
});

// ============================================================================
// Painel de rede/busca (item 1.4-residual / SPEC-0059), dentro de
// #panel-permissions (D1): autorizar/remover hosts (netRoots) e configurar/
// desativar o endpoint de busca (tools.searchUrl) em runtime, com
// consentimento explícito por host novo.
//
// `pendingNetRoots`/`pendingSearchUrl` são o rascunho local do renderer —
// só viram a política de verdade ao clicar em "Aplicar rede e busca".
// Diferente do bloco de FS acima (SPEC-0038): o rascunho de rede NÃO é
// recarregado do status em toda repintura — só no arranque e depois de um
// `network.select` bem-sucedido (`seedNetworkDraftFromStatus`, D17). Uma
// rejeição (validação, operação em voo, consentimento recusado) preserva o
// rascunho digitado exatamente como está; só `#network-inforce` (a config
// EM VIGOR) recarrega, via `renderNetworkInForce`, chamada por `loadStatus()`.
// ============================================================================

let pendingNetRoots = [];
let pendingSearchUrl = '';

setupRootsDisclosure('net-roots-toggle', 'net-roots-detail');
setupRootsDisclosure('search-toggle', 'search-detail');

function renderNetworkInForce(netRoots, searchUrl) {
  const hosts = netRoots.length > 0 ? netRoots.join(', ') : '(nenhum)';
  const search = searchUrl !== '' ? searchUrl : '(não configurada)';
  document.getElementById('network-inforce').textContent =
    `hosts em vigor: ${hosts} · busca em vigor: ${search}`;
}

function paintNetRootsList() {
  paintRootsList(document.getElementById('net-roots-list'), pendingNetRoots, (index) => {
    pendingNetRoots.splice(index, 1);
    paintNetRootsList();
  });
}

function refreshSearchHostWarning() {
  document.getElementById('search-host-warning').hidden = pendingSearchUrl.trim() === '';
}

/**
 * Semeia o rascunho de rede/busca a partir do status (D17/A1) — chamada
 * SÓ no arranque e depois de um `network.select` bem-sucedido. `loadStatus()`
 * NUNCA chama esta função (só `renderNetworkInForce`, acima).
 */
function seedNetworkDraftFromStatus(netRoots, searchUrl) {
  pendingNetRoots = [...netRoots];
  pendingSearchUrl = searchUrl;
  document.getElementById('net-roots-toggle').textContent = `Rede (${pendingNetRoots.length})`;
  document.getElementById('search-url-input').value = pendingSearchUrl;
  paintNetRootsList();
  refreshSearchHostWarning();
}

document.getElementById('net-root-add').addEventListener('click', () => {
  const input = document.getElementById('net-root-input');
  const value = input.value.trim();
  if (value === '') {
    return;
  }
  pendingNetRoots.push(value);
  input.value = '';
  paintNetRootsList();
});

document.getElementById('search-url-input').addEventListener('input', () => {
  pendingSearchUrl = document.getElementById('search-url-input').value;
  refreshSearchHostWarning();
});

document.getElementById('search-url-clear').addEventListener('click', () => {
  pendingSearchUrl = '';
  document.getElementById('search-url-input').value = '';
  refreshSearchHostWarning();
});

document.getElementById('network-apply').addEventListener('click', () => {
  const errorEl = document.getElementById('network-error');
  errorEl.textContent = '';
  // SPEC-0059 (D16): mesma marcação de política em curso do bloco de FS —
  // desabilita ADICIONALMENTE os dois botões de aplicar enquanto pendente.
  policyApplicationInFlight = true;
  refreshPermissionsPanelState();
  window.atlas.network
    .select({ netRoots: [...pendingNetRoots], searchUrl: pendingSearchUrl })
    .then(() =>
      reopenChatSession(
        'session-reopened-network',
        'Rede e busca alteradas — nova conversa iniciada',
      ),
    )
    .then(() => loadStatus())
    .then((snapshot) => {
      // Sucesso (D17): SÓ aqui (e no arranque) o rascunho é sincronizado com
      // o status recém-recarregado.
      seedNetworkDraftFromStatus(snapshot.netRoots, snapshot.searchUrl);
    })
    .catch((error) => {
      // Rejeição (validação, operação em voo, consentimento recusado):
      // NADA foi aplicado — transcript e conversa intactos, e o rascunho
      // digitado pelo usuário é PRESERVADO (D17); só #network-inforce
      // recarrega do status real, via loadStatus().
      errorEl.textContent = `⚠️ ${error.message ?? error} — nada foi aplicado.`;
      return loadStatus();
    })
    .finally(() => {
      policyApplicationInFlight = false;
      refreshPermissionsPanelState();
    });
});

// ============================================================================
// Modo hands-free (conversa por voz contínua) — SPEC-0052, ADR-0023.
//
// Réplica deliberada de `apps/desktop/src/hands-free.ts` (D10, mesmo padrão
// de duplicação renderer↔módulo das SPECs 0035/0036/0039/0040/0041/0043/0047
// — comentário explícito, teste de referência `tests/hands-free.test.ts`).
// Qualquer mudança de comportamento deve ser espelhada nos dois lugares.
// ============================================================================

const HF_FRAME_SAMPLES = 512;
const HF_FRAME_MS = 32;
const HF_SPEECH_ENTER = 0.5;
const HF_SPEECH_EXIT = 0.35;
const HF_MIN_SPEECH_MS = 320;
const HF_PRE_ROLL_FRAMES = 10;
const HF_SILENCE_CLOSE_MS = 3000;
const HF_MAX_UTTERANCE_MS = 30000;
const HF_CAPTURE_REARM_MS = 15000;
const HF_VAD_QUEUE_LIMIT = 32;
const HF_THINKING_WATCHDOG_MS = 180000;
const HF_SPEAKING_WATCHDOG_BASE_MS = 8000;
const HF_SPEAKING_WATCHDOG_PER_CHAR_MS = 80;
const HF_SPEAKING_WATCHDOG_MAX_MS = 120000;

// Réplica de `TRANSITIONS`/`GLOBAL_TRANSITIONS`/`nextHandsFreeState`
// (`hands-free.ts`) — mesma tabela, mesma regra de fecho.
const HF_TRANSITIONS = {
  off: { enable: 'arming' },
  arming: { armed: 'listening', armFailed: 'off' },
  listening: { speechStart: 'capturing' },
  capturing: { speechEnd: 'transcribing', utteranceCap: 'transcribing' },
  transcribing: {
    transcriptReady: 'sending',
    transcriptEmpty: 'listening',
    transcriptFailed: 'off',
  },
  sending: { turnStarted: 'thinking', turnRefused: 'off' },
  thinking: { turnDone: 'speaking', turnFailed: 'off', thinkingTimeout: 'off' },
  speaking: { speechDone: 'arming' },
  unavailable: {},
};

const HF_GLOBAL_TRANSITIONS = { disable: 'off', vadOverrun: 'off', unavailable: 'unavailable' };

function nextHandsFreeState(state, event) {
  const globalNext = HF_GLOBAL_TRANSITIONS[event];
  if (globalNext !== undefined) {
    return globalNext;
  }
  const forState = HF_TRANSITIONS[state];
  const specific = forState !== undefined ? forState[event] : undefined;
  return specific !== undefined ? specific : state;
}

function handsFreeMicrophoneOpen(state) {
  return state === 'listening' || state === 'capturing';
}

function speakingWatchdogMs(text) {
  const raw = HF_SPEAKING_WATCHDOG_BASE_MS + HF_SPEAKING_WATCHDOG_PER_CHAR_MS * text.length;
  return Math.min(Math.max(raw, HF_SPEAKING_WATCHDOG_BASE_MS), HF_SPEAKING_WATCHDOG_MAX_MS);
}

// Réplica de `createTurnSegmenter` (`hands-free.ts`) — consome só
// probabilidades (D19); pre-roll e fila são propriedades DESTE glue, abaixo.
function createTurnSegmenter(config) {
  const { speechEnter, speechExit, minSpeechMs, silenceCloseMs, maxUtteranceMs, frameMs } = config;
  let inSpeech = false;
  let voiceMs = 0;
  let silenceMs = 0;
  let utteranceMs = 0;

  function reset() {
    inSpeech = false;
    voiceMs = 0;
    silenceMs = 0;
    utteranceMs = 0;
  }

  function push(probability) {
    if (!inSpeech) {
      if (probability >= speechEnter) {
        inSpeech = true;
        voiceMs = frameMs;
        silenceMs = 0;
        utteranceMs = frameMs;
        return { kind: 'speechStart' };
      }
      return { kind: 'none' };
    }

    utteranceMs += frameMs;
    if (probability >= speechExit) {
      voiceMs += frameMs;
      silenceMs = 0;
    } else {
      silenceMs += frameMs;
    }

    if (utteranceMs >= maxUtteranceMs) {
      reset();
      return { kind: 'utteranceCap' };
    }

    if (silenceMs >= silenceCloseMs) {
      const discarded = voiceMs < minSpeechMs;
      const event = { kind: 'speechEnd', speechMs: voiceMs, discarded };
      reset();
      return event;
    }

    return { kind: 'none' };
  }

  return { push, reset };
}

// --- Estado do modo (glue) --------------------------------------------------

const handsFreeToggleEl = document.getElementById('hands-free-toggle');
const handsFreeIndicatorEl = document.getElementById('hands-free-indicator');
const handsFreeStatusEl = document.getElementById('hands-free-status');

let handsFreeState = 'off';
let handsFreeSttAvailable = false;
let handsFreeVadAvailable = false;
let handsFreeSegmenter = null;
let handsFreeDetector = null;
let handsFreeCapture = null;
let handsFreeRearmTimer = null;
let handsFreeThinkingTimer = null;
let handsFreeSpeakingWatchdogTimer = null;
let handsFreeTurnStartConfirmed = false;
let handsFreePreRollRing = [];
let handsFreeUtteranceChunks = [];
let handsFreeFrameQueue = [];
let handsFreeProcessingQueue = false;

// Ponto de criação ÚNICO do detector (CA 23/24, ADR-0023(c)) — a chamada de
// criação da sessão de inferência do runtime só pode aparecer DENTRO desta
// função em todo o arquivo. `handsFreeDetectorFactory` é uma referência
// SUBSTITUÍVEL (nunca `const`): é por ela que o harness de teste injeta um
// dublê sem precisar do runtime real (D21) — `setHandsFreeDetectorFactory`
// existe só para isso.
async function createHandsFreeDetector() {
  const availability = await window.atlas.vad.available();
  if (availability === undefined || availability.available !== true) {
    return null;
  }
  if (window.ort === undefined) {
    return null;
  }
  const resources = await window.atlas.vad.resources();
  if (resources === undefined || resources.ok !== true) {
    return null;
  }
  window.ort.env.wasm.numThreads = 1;
  window.ort.env.wasm.proxy = false;
  window.ort.env.wasm.wasmBinary = new Uint8Array(resources.wasm);
  const session = await window.ort.InferenceSession.create(resources.model);
  let state = new Float32Array(2 * 1 * 128);
  return {
    async probe(frame) {
      const inputTensor = new window.ort.Tensor('float32', frame, [1, HF_FRAME_SAMPLES]);
      const stateTensor = new window.ort.Tensor('float32', state, [2, 1, 128]);
      const srTensor = new window.ort.Tensor('int64', BigInt64Array.from([16000n]));
      const results = await session.run({ input: inputTensor, state: stateTensor, sr: srTensor });
      state = results.stateN.data;
      return results.output.data[0];
    },
    reset() {
      state = new Float32Array(2 * 1 * 128);
    },
  };
}

let handsFreeDetectorFactory;

/**
 * Único ponto de ESCRITA da referência substituível (D21/CA24): usado pela
 * própria produção para a fiação inicial abaixo, e é a MESMA função que o
 * harness de teste chama (via `internals`) para injetar um dublê sem
 * precisar do runtime real.
 */
function setHandsFreeDetectorFactory(factory) {
  handsFreeDetectorFactory = factory;
}

setHandsFreeDetectorFactory(createHandsFreeDetector);

function handsFreeActive() {
  return handsFreeState !== 'off' && handsFreeState !== 'unavailable';
}

function setHandsFreeStatus(text) {
  handsFreeStatusEl.textContent = text;
}

function handsFreeIndicatorText(state) {
  switch (state) {
    case 'off':
      return '';
    case 'unavailable':
      return '';
    // R2 (SPEC-0052): `arming` pode durar minutos no macOS (primeiro
    // `getUserMedia` abre o diálogo nativo de permissão) — o indicador
    // precisa dizer explicitamente que está esperando o SISTEMA, não travado.
    case 'arming':
      return 'Aguardando permissão do sistema…';
    case 'listening':
      return 'Ouvindo…';
    case 'capturing':
      return 'Capturando fala…';
    case 'transcribing':
      return 'Transcrevendo…';
    case 'sending':
      return 'Enviando…';
    case 'thinking':
      return 'Pensando…';
    case 'speaking':
      return 'Falando…';
    default:
      return '';
  }
}

function refreshHandsFreeIndicator() {
  handsFreeIndicatorEl.textContent = handsFreeIndicatorText(handsFreeState);
  // SPEC-0053 (D6/CA13): gancho presentacional puro — o CSS colore o
  // indicador por estado via `[data-state='…']` (CA 22), sem depender do
  // texto pinado.
  handsFreeIndicatorEl.dataset.state = handsFreeState;
  refreshPresence();
}

function handsFreeVoiceOutputAvailable() {
  return currentVoiceBackend().backend !== 'none';
}

function computeHandsFreeUnavailableReason() {
  if (!handsFreeSttAvailable) {
    return 'entrada por voz (STT) indisponível';
  }
  if (!handsFreeVadAvailable) {
    return 'detector de voz (VAD) indisponível';
  }
  if (!handsFreeVoiceOutputAvailable()) {
    return 'nenhuma voz de saída disponível';
  }
  return '';
}

// Origem única de habilitação/desenho do toggle — reavaliada nos gatilhos
// assíncronos (`voiceschanged`, chegada do catálogo/disponibilidade Piper,
// resposta de `atlas:vad:available`), NUNCA resolvida point-in-time no load
// (D9/apps/desktop/CLAUDE.md). Também recalcula a serialização de gestos
// (SPEC-0038 e segs.): o toggle fica desabilitado enquanto houver turno de
// chat/`ask` em voo, para que o modo não nasça num estado que a guarda de
// `sending` recusaria.
function refreshHandsFreeToggle() {
  const reason = computeHandsFreeUnavailableReason();
  if (reason !== '') {
    if (handsFreeActive()) {
      handsFreeForceOff('vadOverrun', reason);
    }
    handsFreeState = 'unavailable';
    handsFreeToggleEl.disabled = true;
    handsFreeToggleEl.title = reason;
    setHandsFreeStatus(reason);
    refreshHandsFreeIndicator();
    return;
  }
  if (handsFreeState === 'unavailable') {
    handsFreeState = 'off';
  }
  const busy = chatTurnInFlight || askInFlight;
  handsFreeToggleEl.disabled = busy && handsFreeState === 'off';
  handsFreeToggleEl.title =
    busy && handsFreeState === 'off' ? 'turno de chat/ask em andamento' : '';
  // SPEC-0053 (Escopo 9/CA11): rótulo de controle sem emoji.
  handsFreeToggleEl.textContent =
    handsFreeState === 'off' ? 'Ligar conversa contínua' : 'Desligar conversa contínua';
  refreshHandsFreeIndicator();
}

// Serialização de gestos (Interação com o resto do desktop, SPEC-0052):
// enquanto o modo está ativo, `#ask-submit` e `#mic-button` ficam
// desabilitados com motivo.
function refreshChatControlsForHandsFree() {
  if (!handsFreeActive()) {
    return;
  }
  const askSubmit = document.getElementById('ask-submit');
  if (askSubmit !== null) {
    askSubmit.disabled = true;
    askSubmit.title = 'modo hands-free ligado';
  }
  micButton.disabled = true;
  micButton.title = 'modo hands-free ligado';
}

function handsFreeDispatch(event) {
  handsFreeState = nextHandsFreeState(handsFreeState, event);
  refreshHandsFreeIndicator();
  refreshHandsFreeToggle();
  refreshAskControls();
  refreshMicButtons();
  refreshChatControlsForHandsFree();
  return handsFreeState;
}

function handsFreeStartRearmTimer() {
  handsFreeStopRearmTimer();
  handsFreeRearmTimer = setInterval(() => {
    // R2: o rearme fica limitado a listening/capturing — nunca corre em
    // `arming` (a SPEC exige que o diálogo nativo de permissão não seja
    // "rearmado" por engano).
    if (handsFreeMicrophoneOpen(handsFreeState)) {
      window.atlas.stt.captureBegin();
    }
  }, HF_CAPTURE_REARM_MS);
}

function handsFreeStopRearmTimer() {
  if (handsFreeRearmTimer !== null) {
    clearInterval(handsFreeRearmTimer);
    handsFreeRearmTimer = null;
  }
}

function handsFreeStartThinkingWatchdog() {
  handsFreeStopThinkingWatchdog();
  handsFreeThinkingTimer = setTimeout(() => {
    handsFreeThinkingTimer = null;
    setGlobalAlert('voice-failure', new Error('O turno demorou demais.'));
    handsFreeDispatch('thinkingTimeout');
    setHandsFreeStatus('O turno demorou demais — modo desligado.');
  }, HF_THINKING_WATCHDOG_MS);
}

function handsFreeStopThinkingWatchdog() {
  if (handsFreeThinkingTimer !== null) {
    clearTimeout(handsFreeThinkingTimer);
    handsFreeThinkingTimer = null;
  }
}

function handsFreeStopSpeakingWatchdog() {
  if (handsFreeSpeakingWatchdogTimer !== null) {
    clearTimeout(handsFreeSpeakingWatchdogTimer);
    handsFreeSpeakingWatchdogTimer = null;
  }
}

function releaseHandsFreeCaptureResources() {
  if (handsFreeCapture === null) {
    return;
  }
  releaseCaptureResources(handsFreeCapture);
  handsFreeCapture = null;
}

/** Freio (D14): fecha o microfone IMEDIATAMENTE, em qualquer um dos 9 estados. */
function handsFreeForceOff(reason, statusText) {
  const wasThinking = handsFreeState === 'thinking';
  handsFreeStopRearmTimer();
  handsFreeStopThinkingWatchdog();
  handsFreeStopSpeakingWatchdog();
  releaseHandsFreeCaptureResources();
  handsFreeFrameQueue = [];
  handsFreePreRollRing = [];
  handsFreeUtteranceChunks = [];
  handsFreeDetector = null;
  handsFreeSegmenter = null;
  void window.atlas.stt.captureEnd();
  if (wasThinking) {
    window.atlas.cancel();
  }
  handsFreeDispatch(reason || 'disable');
  if (statusText !== undefined) {
    setHandsFreeStatus(statusText);
  }
}

function handsFreeHandleOverrun() {
  setGlobalAlert('voice-failure', new Error('O detector de voz não acompanhou o áudio.'));
  handsFreeForceOff('vadOverrun', 'O detector de voz não acompanhou o áudio — modo desligado.');
}

function handsFreeStartCaptureGraph(stream) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextCtor({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const gain = audioContext.createGain();
  gain.gain.value = 0;
  processor.onaudioprocess = (event) => {
    const channelData = event.inputBuffer.getChannelData(0);
    for (let offset = 0; offset < channelData.length; offset += HF_FRAME_SAMPLES) {
      handsFreeEnqueueFrame(channelData.slice(offset, offset + HF_FRAME_SAMPLES));
    }
  };
  source.connect(processor);
  processor.connect(gain);
  gain.connect(audioContext.destination);
  handsFreeCapture = { stream, audioContext, source, processor, gain, chunks: [] };
}

function handsFreeEnqueueFrame(frame) {
  if (handsFreeFrameQueue.length >= HF_VAD_QUEUE_LIMIT) {
    handsFreeHandleOverrun();
    return;
  }
  handsFreeFrameQueue.push(frame);
  void handsFreeDrainQueue();
}

async function handsFreeDrainQueue() {
  if (handsFreeProcessingQueue) {
    return;
  }
  handsFreeProcessingQueue = true;
  try {
    while (handsFreeFrameQueue.length > 0) {
      const frame = handsFreeFrameQueue.shift();
      await handsFreeProcessFrame(frame);
    }
  } finally {
    handsFreeProcessingQueue = false;
  }
}

async function handsFreeProcessFrame(frame) {
  if (handsFreeDetector === null || handsFreeSegmenter === null) {
    return;
  }
  let probability;
  try {
    probability = await handsFreeDetector.probe(frame);
  } catch {
    probability = 0;
  }

  // CA32 (pre-roll, tamanho EXATO do payload): o segmentador é consultado
  // ANTES de qualquer mutação do anel/acumulador do glue — senão o frame que
  // dispara `speechStart` seria contado DUAS vezes (uma no anel, uma no
  // `[...ring, frame]` abaixo), e o anel perderia justamente o frame mais
  // antigo que deveria reter. Corrigido durante a validação da SPEC-0052
  // (CA32 exigia a fórmula exata de bytes, que expôs o off-by-one).
  const segEvent = handsFreeSegmenter.push(probability);

  if (handsFreeState === 'listening') {
    if (segEvent.kind === 'speechStart') {
      handsFreeUtteranceChunks = [...handsFreePreRollRing, frame];
      handsFreePreRollRing = [];
      handsFreeDispatch('speechStart');
      return;
    }
    // Ainda não há fala: retém só o anel de pre-roll (D19) — o frame ATUAL
    // só entra no anel DEPOIS de confirmado que não foi ele quem iniciou a
    // fala.
    handsFreePreRollRing.push(frame);
    if (handsFreePreRollRing.length > HF_PRE_ROLL_FRAMES) {
      handsFreePreRollRing.shift();
    }
    return;
  }

  if (handsFreeState === 'capturing') {
    handsFreeUtteranceChunks.push(frame);
  }

  if (segEvent.kind === 'speechEnd') {
    if (segEvent.discarded) {
      // R1 (SPEC-0052): descarte NUNCA despacha 'speechEnd' ao reducer —
      // ambos os estados envolvidos (capturing/listening) já são de
      // microfone aberto, então nenhuma leitura desta escolha abre/fecha o
      // microfone fora do previsto pela tabela.
      handsFreeUtteranceChunks = [];
      return;
    }
    await handsFreeCloseMicAndTranscribe('speechEnd');
    return;
  }

  if (segEvent.kind === 'utteranceCap') {
    await handsFreeCloseMicAndTranscribe('utteranceCap');
  }
}

async function handsFreeCloseMicAndTranscribe(triggerEvent) {
  const chunks = handsFreeUtteranceChunks;
  handsFreeUtteranceChunks = [];
  handsFreeStopRearmTimer();
  releaseHandsFreeCaptureResources();
  try {
    await window.atlas.stt.captureEnd();
  } catch {
    // fail-safe: nunca propaga
  }
  handsFreeDispatch(triggerEvent); // capturing → transcribing (mic já fechado acima)
  setHandsFreeStatus('Transcrevendo…');

  const pcm = floatChunksToInt16(chunks);
  try {
    const result = await window.atlas.stt.transcribe(pcm.buffer, 16000);
    if (result && result.ok && result.text.trim() !== '') {
      handsFreeDispatch('transcriptReady');
      await handsFreeSendTurn(result.text);
      return;
    }
    if (result && result.ok) {
      handsFreeDispatch('transcriptEmpty');
      setHandsFreeStatus('Não entendi — pode repetir?');
      await handsFreeReopenMic();
      return;
    }
    handsFreeDispatch('transcriptFailed');
    setHandsFreeStatus(describeSttFailure(result && result.reason));
    reportVoiceFailure(result && result.reason);
  } catch {
    handsFreeDispatch('transcriptFailed');
    setHandsFreeStatus('Falha inesperada na transcrição.');
    setGlobalAlert('voice-failure', new Error('Falha inesperada na transcrição.'));
  }
}

// Pré-condições de envio (D23) — espelham as três recusas silenciosas do
// `#chat-form`, com mensagem própria por motivo. Falsa ⇒ `turnRefused`, SEM
// despachar `submit`.
async function handsFreeSendTurn(text) {
  if (chatSession === null) {
    handsFreeDispatch('turnRefused');
    setHandsFreeStatus('Conversa não está aberta — modo desligado.');
    return;
  }
  if (chatTurnInFlight || askInFlight) {
    handsFreeDispatch('turnRefused');
    setHandsFreeStatus('Já existe um turno em andamento — modo desligado.');
    return;
  }
  // R5 (SPEC-0052, nota de resolução do gate de validação): esta guarda é
  // hoje INALCANÇÁVEL no fluxo real — `handsFreeCloseMicAndTranscribe` só
  // chama `handsFreeSendTurn` quando `result.text.trim() !== ''` (senão o
  // desfecho já foi `transcriptEmpty`, que reabre o microfone). Mantida
  // como espelho estrutural fiel das três recusas do `#chat-form` — se um
  // chamador futuro passar a invocar `handsFreeSendTurn` com texto vazio,
  // ela continua correta.
  const trimmed = text.trim();
  if (trimmed === '') {
    handsFreeDispatch('turnRefused');
    setHandsFreeStatus('Transcrição vazia — modo desligado.');
    return;
  }

  appendTranscription(text);
  handsFreeTurnStartConfirmed = false;
  const form = document.getElementById('chat-form');
  form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

  // `dispatchEvent` é síncrono: a esta altura, o manipulador de `#chat-form`
  // já rodou por inteiro (inclusive suas três recusas silenciosas) — sem
  // tick/timer/promessa envolvidos (D23).
  if (!handsFreeTurnStartConfirmed) {
    handsFreeDispatch('turnRefused');
    setHandsFreeStatus('O envio foi recusado — modo desligado.');
    return;
  }
  handsFreeDispatch('turnStarted');
  handsFreeStartThinkingWatchdog();
}

// Gancho de início confirmado (D23) — chamado pelo manipulador de
// `#chat-form`, imediatamente após `chatTurnInFlight = true`.
function notifyHandsFreeTurnStarted() {
  handsFreeTurnStartConfirmed = true;
}

function notifyHandsFreeTurnSettled(snapshot) {
  if (handsFreeState !== 'thinking') {
    return;
  }
  handsFreeStopThinkingWatchdog();
  handsFreeDispatch('turnDone');
  void handsFreeSpeakReply(snapshot.reply);
}

function notifyHandsFreeTurnFailed(error) {
  if (handsFreeState !== 'thinking') {
    return;
  }
  handsFreeStopThinkingWatchdog();
  handsFreeDispatch('turnFailed');
  setHandsFreeStatus(`Turno falhou: ${(error && error.message) || error}`);
}

async function handsFreeSpeakReply(text) {
  // O watchdog de fala vive DENTRO de `speakText` (clamp já aplicado lá) —
  // aqui só reagimos ao `onDone`, que chega por evento OU pelo watchdog.
  let done = false;
  const finish = () => {
    if (done) {
      return;
    }
    done = true;
    handsFreeDispatch('speechDone');
    void handsFreeReopenMic();
  };
  speakText(text, finish);
}

async function handsFreeReopenMic() {
  // speaking→arming ou transcriptEmpty→listening já mudaram o estado; aqui
  // só reabrimos o hardware quando ainda fazemos sentido no laço (o freio
  // pode ter desligado o modo enquanto isto estava pendente).
  if (handsFreeState !== 'arming' && handsFreeState !== 'listening') {
    return;
  }
  const enteringFromArming = handsFreeState === 'arming';
  await window.atlas.stt.captureBegin();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    await window.atlas.stt.captureEnd();
    handsFreeDispatch('armFailed');
    setHandsFreeStatus('Permissão de microfone negada ou indisponível.');
    return;
  }
  if (handsFreeState !== 'arming' && handsFreeState !== 'listening') {
    // Desligado enquanto o diálogo de permissão estava aberto (R2/freio).
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return;
  }
  await window.atlas.stt.captureBegin(); // rearme (molde SPEC-0046/R1)
  if (enteringFromArming) {
    handsFreeDispatch('armed');
  }
  handsFreeSegmenter = createTurnSegmenter({
    speechEnter: HF_SPEECH_ENTER,
    speechExit: HF_SPEECH_EXIT,
    minSpeechMs: HF_MIN_SPEECH_MS,
    silenceCloseMs: HF_SILENCE_CLOSE_MS,
    maxUtteranceMs: HF_MAX_UTTERANCE_MS,
    frameMs: HF_FRAME_MS,
  });
  if (handsFreeDetector !== null) {
    handsFreeDetector.reset();
  }
  handsFreePreRollRing = [];
  handsFreeUtteranceChunks = [];
  handsFreeStartCaptureGraph(stream);
  handsFreeStartRearmTimer();
  setHandsFreeStatus('');
}

async function handsFreeEnable() {
  handsFreeDispatch('enable'); // off → arming
  setHandsFreeStatus('Aguardando permissão do sistema…');
  await window.atlas.stt.captureBegin();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    await window.atlas.stt.captureEnd();
    handsFreeDispatch('armFailed');
    setHandsFreeStatus('Permissão de microfone negada ou indisponível.');
    return;
  }
  if (handsFreeState !== 'arming') {
    // Freio acionado enquanto o diálogo nativo de permissão estava aberto.
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return;
  }
  await window.atlas.stt.captureBegin(); // rearme (molde SPEC-0046/R1)

  let detector;
  try {
    detector = await handsFreeDetectorFactory();
  } catch {
    detector = null;
  }
  if (detector === null || detector === undefined) {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    await window.atlas.stt.captureEnd();
    handsFreeDispatch('armFailed');
    setHandsFreeStatus('Detector de voz indisponível.');
    return;
  }

  handsFreeDetector = detector;
  handsFreeDetector.reset();
  handsFreeSegmenter = createTurnSegmenter({
    speechEnter: HF_SPEECH_ENTER,
    speechExit: HF_SPEECH_EXIT,
    minSpeechMs: HF_MIN_SPEECH_MS,
    silenceCloseMs: HF_SILENCE_CLOSE_MS,
    maxUtteranceMs: HF_MAX_UTTERANCE_MS,
    frameMs: HF_FRAME_MS,
  });
  handsFreePreRollRing = [];
  handsFreeUtteranceChunks = [];
  handsFreeStartCaptureGraph(stream);
  handsFreeDispatch('armed'); // arming → listening
  clearGlobalAlert();
  handsFreeStartRearmTimer();
  setHandsFreeStatus('');
}

handsFreeToggleEl.addEventListener('click', () => {
  if (handsFreeState === 'off') {
    void handsFreeEnable();
    return;
  }
  if (handsFreeState === 'unavailable') {
    return;
  }
  // Freio (D14): fecha o microfone na hora, em qualquer um dos 9 estados;
  // com turno em voo (`thinking`), aciona o cancelamento da SPEC-0051.
  handsFreeForceOff('disable');
  setHandsFreeStatus('');
});

// Reavaliação nos gatilhos assíncronos (achado A6/D9): disponibilidade do
// VAD por IPC, além dos dois gatilhos de voz já existentes (voiceschanged,
// catálogo/disponibilidade Piper) — nenhum deles resolve point-in-time.
function loadHandsFreeAvailability() {
  if (window.atlas === undefined || window.atlas.stt === undefined) {
    handsFreeSttAvailable = false;
    refreshHandsFreeToggle();
    return Promise.resolve();
  }
  return Promise.all([
    window.atlas.stt
      .available()
      .then((info) => {
        handsFreeSttAvailable = Boolean(info && info.available === true);
      })
      .catch(() => {
        handsFreeSttAvailable = false;
      }),
    window.atlas === undefined || window.atlas.vad === undefined
      ? Promise.resolve()
      : window.atlas.vad
          .available()
          .then((info) => {
            handsFreeVadAvailable = Boolean(info && info.available === true);
          })
          .catch(() => {
            handsFreeVadAvailable = false;
          }),
  ]).finally(() => {
    refreshHandsFreeToggle();
  });
}

refreshHandsFreeToggle();
loadHandsFreeAvailability();

// ---------------------------------------------------------------------------
// SPEC-0054 — painel `Sistema`: métricas de host (CPU/RAM/GPU/rede), consumo
// de tokens da sessão corrente e relógio (data/dia da semana/horário).
// Formatação inteiramente pinada (Escopo 10 da SPEC), sem `Intl`/
// `toLocaleString` — determinística e independente do locale do SO. Lógica
// exclusiva do renderer, sem gêmeo em TypeScript (limite (i) do gate de
// paridade, `renderer.speech-parity.test.ts`): os módulos que ALIMENTAM este
// painel por IPC (`system-metrics.ts`/`token-usage.ts`) entram na lista
// vigiada só como tripwire — não há função de formatação para replicar.
//
// Nunca entra na serialização de gestos (Escopo 9): não marca operação em
// voo, não é bloqueada por turno de chat/`ask`, não desabilita nada.

const SYSTEM_WEEKDAY_NAMES = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

const SYSTEM_METRIC_UNAVAILABLE_TEXT = {
  unsupported: 'Indisponível nesta plataforma',
  'read-failed': 'Indisponível: falha de leitura',
  timeout: 'Indisponível: leitura expirou',
};

function systemPad2(value) {
  return String(value).padStart(2, '0');
}

function systemGroupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formata `value` no padrão pt-BR pinado (vírgula decimal, ponto de milhar), sem `Intl`. */
function formatSystemFixed(value, decimals) {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  const sign = rounded < 0 ? '-' : '';
  const [intPart, fracPart = ''] = Math.abs(rounded).toFixed(decimals).split('.');
  const grouped = systemGroupThousands(intPart);
  return decimals > 0 ? `${sign}${grouped},${fracPart}` : `${sign}${grouped}`;
}

/** Base 1000 — unidades B/kB/MB/GB/TB; zero casas decimais em B, uma casa nas demais (Escopo 10). */
function formatSystemBytes(bytes) {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  const decimals = unitIndex === 0 ? 0 : 1;
  return `${formatSystemFixed(value, decimals)} ${units[unitIndex]}`;
}

function formatSystemBytesPerSecond(bytes) {
  return `${formatSystemBytes(bytes)}/s`;
}

function formatSystemClockDate(date) {
  const weekday = SYSTEM_WEEKDAY_NAMES[date.getDay()];
  return `${weekday}, ${systemPad2(date.getDate())}/${systemPad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatSystemClockTime(date) {
  return `${systemPad2(date.getHours())}:${systemPad2(date.getMinutes())}:${systemPad2(date.getSeconds())}`;
}

function formatSystemCpuLine(sample) {
  if (!sample.available) return `CPU: ${SYSTEM_METRIC_UNAVAILABLE_TEXT[sample.reason]}`;
  return `CPU: ${formatSystemFixed(sample.value.loadPercent, 1)} %`;
}

function formatSystemMemoryLine(sample) {
  if (!sample.available) return `Memória: ${SYSTEM_METRIC_UNAVAILABLE_TEXT[sample.reason]}`;
  const { usedBytes, totalBytes, usedPercent } = sample.value;
  return `Memória: ${formatSystemBytes(usedBytes)} de ${formatSystemBytes(totalBytes)} (${formatSystemFixed(usedPercent, 1)} %)`;
}

function formatSystemGpuLine(sample) {
  if (!sample.available) return `GPU: ${SYSTEM_METRIC_UNAVAILABLE_TEXT[sample.reason]}`;
  return `GPU: ${formatSystemFixed(sample.value.loadPercent, 1)} %`;
}

function formatSystemNetworkLine(sample) {
  if (!sample.available) return `Rede: ${SYSTEM_METRIC_UNAVAILABLE_TEXT[sample.reason]}`;
  const { rxBytesPerSecond, txBytesPerSecond } = sample.value;
  return `Rede: recebendo ${formatSystemBytesPerSecond(rxBytesPerSecond)} · enviando ${formatSystemBytesPerSecond(txBytesPerSecond)}`;
}

/** Quatro desfechos exaustivos sobre `TokenUsageSnapshot` (Escopo 10). */
function formatSystemTokensLine(snapshot) {
  const { promptTokens, completionTokens, totalTokens, reportedTurns, unreportedTurns } = snapshot;
  if (reportedTurns === 0 && unreportedTurns === 0) {
    return 'Tokens desta sessão: 0';
  }
  if (reportedTurns === 0 && unreportedTurns > 0) {
    return 'Tokens desta sessão: indisponível (o provedor não reporta consumo)';
  }
  const base =
    `Tokens desta sessão: ${formatSystemFixed(totalTokens, 0)} ` +
    `(entrada ${formatSystemFixed(promptTokens, 0)} · saída ${formatSystemFixed(completionTokens, 0)})`;
  return unreportedTurns === 0 ? base : `${base} · ${unreportedTurns} turno(s) sem relato`;
}

function renderSystemMetrics(snapshot) {
  document.getElementById('system-cpu').textContent = formatSystemCpuLine(snapshot.cpu);
  document.getElementById('system-memory').textContent = formatSystemMemoryLine(snapshot.memory);
  document.getElementById('system-gpu').textContent = formatSystemGpuLine(snapshot.gpu);
  document.getElementById('system-network').textContent = formatSystemNetworkLine(snapshot.network);
}

/** Rejeição de qualquer um dos dois `invoke` (CA27): as quatro células de host mostram o mesmo texto de falha de leitura. */
function renderSystemMetricsUnavailable() {
  const text = SYSTEM_METRIC_UNAVAILABLE_TEXT['read-failed'];
  document.getElementById('system-cpu').textContent = `CPU: ${text}`;
  document.getElementById('system-memory').textContent = `Memória: ${text}`;
  document.getElementById('system-gpu').textContent = `GPU: ${text}`;
  document.getElementById('system-network').textContent = `Rede: ${text}`;
}

function renderSystemTokens(snapshot) {
  document.getElementById('system-tokens').textContent = formatSystemTokensLine(snapshot);
}

function renderSystemTokensUnavailable() {
  document.getElementById('system-tokens').textContent =
    `Tokens desta sessão: ${SYSTEM_METRIC_UNAVAILABLE_TEXT['read-failed']}`;
}

function updateSystemClock() {
  const now = new Date(Date.now());
  document.getElementById('system-clock-date').textContent = formatSystemClockDate(now);
  document.getElementById('system-clock-time').textContent = formatSystemClockTime(now);
}

function setSystemStatus(text) {
  document.getElementById('system-status').textContent = text;
}

let systemPanelTimerId = null;
let systemPanelTickCount = 0;
let systemPanelReadInFlight = false;
let systemPanelEpoch = 0;

/**
 * Dispara `metrics.read()`/`tokens.read()` em paralelo (Escopo 9), guardado
 * por `systemPanelReadInFlight` (sem reentrância — nenhuma chamada
 * concorrente ao mesmo canal, CA25) e por `epoch` (descarte pós-fechamento,
 * CA26 — mais forte que checar só "painel visível", cobre também um
 * fechar+reabrir rápido).
 */
function readSystemPanelData(epoch) {
  if (systemPanelReadInFlight) return;
  systemPanelReadInFlight = true;
  Promise.all([window.atlas.metrics.read(), window.atlas.tokens.read()])
    .then(([metrics, tokens]) => {
      systemPanelReadInFlight = false;
      if (epoch !== systemPanelEpoch) return;
      renderSystemMetrics(metrics);
      renderSystemTokens(tokens);
      setSystemStatus(`Atualizado às ${formatSystemClockTime(new Date(Date.now()))}`);
    })
    .catch(() => {
      systemPanelReadInFlight = false;
      if (epoch !== systemPanelEpoch) return;
      renderSystemMetricsUnavailable();
      renderSystemTokensUnavailable();
      setSystemStatus('Falha ao ler as métricas do sistema.');
    });
}

/**
 * Cancela o timer do painel `Sistema`, se houver (idempotente) — chamado nos
 * cinco gatilhos de fechamento (Escopo 9/CA24): fechar o painel, trocar de
 * painel, fechar o drawer por botão/Escape/backdrop, e o teardown da página.
 */
function stopSystemPanelTimer() {
  if (systemPanelTimerId !== null) {
    window.clearInterval(systemPanelTimerId);
    systemPanelTimerId = null;
  }
  systemPanelEpoch += 1;
}

/**
 * Abre o ciclo de atualização do painel `Sistema` (Escopo 9): leitura IPC
 * imediata + atualização imediata do relógio, antes do primeiro tick; um
 * único `setInterval(1000)`; a cada dois ticks (2000ms) dispara uma leitura.
 */
function startSystemPanelTimer() {
  stopSystemPanelTimer();
  const epoch = systemPanelEpoch;
  systemPanelTickCount = 0;
  updateSystemClock();
  setSystemStatus('Lendo…');
  readSystemPanelData(epoch);
  systemPanelTimerId = window.setInterval(() => {
    updateSystemClock();
    systemPanelTickCount += 1;
    if (systemPanelTickCount % 2 === 0) {
      readSystemPanelData(epoch);
    }
  }, 1000);
}

// Teardown da página (5º gatilho de CA24): nenhum timer desta fatia sobrevive
// ao fechamento/recarregamento da janela.
window.addEventListener('beforeunload', () => {
  stopSystemPanelTimer();
});
