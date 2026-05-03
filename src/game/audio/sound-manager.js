// =========================
// Sound Manager (basic)
// =========================

let ctx = null;

// Engine sound
let engineSource = null;
let engineGain = null;

// State
let initialized = false;

// =========================
// Init (must be called from user interaction)
// =========================
export async function initAudio() {
  if (initialized) return;

  ctx = new (window.AudioContext || window.webkitAudioContext)();

  // Load engine loop
  const engineBuffer = await loadSound('/sounds/engine_loop.wav');

  engineSource = ctx.createBufferSource();
  engineSource.buffer = engineBuffer;
  engineSource.loop = true;

  engineGain = ctx.createGain();
  engineGain.gain.value = 0.3;

  engineSource.connect(engineGain).connect(ctx.destination);
  engineSource.start(0);

  initialized = true;

  console.log('[Audio] Initialized');
}

// =========================
// Load helper
// =========================
async function loadSound(url) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
}

// =========================
// Update engine sound
// =========================
export function updateEngineSound(t) {
  if (!initialized || !engineSource) return;

  // t = 0 → idle, 1 → full throttle
  engineSource.playbackRate.value = 0.7 + t * 1.3;
  engineGain.gain.value = 0.25 + t * 0.75;
}