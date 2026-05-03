// =========================
// Sound Manager (basic)
// =========================

let ctx = null;

// Engine sound
let engineSource = null;
let engineGain = null;

// Collect
let collectBuffer = null;

// State
let initialized = false;

// =========================
// Init (must be called from user interaction)
// =========================
export async function initAudio() {
  if (initialized) return;

  ctx = new (window.AudioContext || window.webkitAudioContext)();

  // Load engine loop
  const engineBuffer = await loadSound('/sounds/engine_loop2.wav');
  collectBuffer = await loadSound('/sounds/collect.wav'); //declared but never read

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
  engineSource.playbackRate.value = 0.6 + t * 1.1;
  engineGain.gain.value = 0.25 + t * 0.75;

}

// =========================
// Play SFX
// =========================
export function playCollectSound() {
  if (!initialized || !collectBuffer) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const src = ctx.createBufferSource();
  src.buffer = collectBuffer;

  src.playbackRate.value = 0.95 + Math.random() * 0.3;

  src.connect(ctx.destination);
  src.start(0);
}
