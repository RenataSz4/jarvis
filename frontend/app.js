// Orchestrator: wires the microphone (ears) -> Claude (/ask) -> voice (tts).
// This is the "conductor" that ties the two empty files together.

import { JarvisEars } from './stt.js';
import { JarvisVoice } from './tts.js';

const micBtn = document.getElementById('mic');
const input  = document.getElementById('input');
const badge  = document.getElementById('badge');
const line   = document.getElementById('line');
const state  = document.getElementById('state');

let busy = false; // true while thinking/speaking, so we ignore new input
let conversing = false;

// --- UI helpers -----------------------------------------------------------
function setState(label, message, listening = false) {
  badge.textContent = label;
  if (message != null) line.textContent = message;
  state.classList.toggle('listening', listening); // turns the visualizer orange
}

const PROMPT = 'Press the mic and talk to Jarvis.';

// Return to standby. By default we KEEP the last message on screen (so Jarvis'
// reply stays visible); pass a message to overwrite the line (e.g. the prompt).
function idle(message) {
  busy = false;
  micBtn.disabled = false;
  badge.textContent = 'STANDBY';
  state.classList.remove('listening');
  if (message != null) line.textContent = message;
}

function listenAgain() {
  busy = false;
  micBtn.disabled = false;
  if (conversing) setTimeout(() => ears.start(), 400);
}

// --- The brain + voice ----------------------------------------------------
const voice = new JarvisVoice();

// Play sound-effect cues from /sfx. Each cue is {name, delay}, where delay is
// milliseconds to wait after the PREVIOUS cue — so the model controls spacing
// (0 = layered, larger = a beat between sounds). Clips are independent.
function playSfx(cues) {
  if (!cues || !cues.length) return;
  let offset = 0;
  for (const cue of cues) {
    if (!cue || !cue.name) continue;
    offset += cue.delay || 0;                      // cumulative timeline
    const fx = new Audio(`/sfx/${cue.name}.mp3`);   // create now to preload
    setTimeout(() => fx.play().catch(() => {}), offset);
  }
}

// Send clean text to the Claude wrapper, then speak the reply (requirements #3).
async function handleQuery(text) {
  if (busy || !text.trim()) return;
  busy = true;
  micBtn.disabled = true;
  input.value = '';

  setState('THINKING', `You: ${text}`, false);

  let reply;
  try {
    const res = await fetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`backend ${res.status}`);
    const data = await res.json();
    reply = data.response;
    playSfx(data.sfx);
  } catch (err) {
    setState('ERROR', 'I could not reach my brain, sir. Is the backend running?');
    setTimeout(() => idle(PROMPT), 2500);
    return;
  }

  setState('SPEAKING', reply, false);
  try {
    await voice.speak(reply); // resolves when the audio finishes playing
  } catch {
    // TTS failed (e.g. voice tier / no key) — keep the reply visible, just note it.
    line.textContent = `${reply}\n\n(voice unavailable)`;
  }
  listenAgain();
}

// --- The ears -------------------------------------------------------------
const ears = new JarvisEars({
  onStart:  () => setState('LISTENING', 'Listening...', true),
  onResult: (text) => handleQuery(text),
  onError:  (code, message) => {
    if (code === 'no-speech' && conversing) { listenAgain(); return; }
    conversing = false;
    setState('ERROR', message, false);
    setTimeout(() => idle(PROMPT), 2500); // option (a): show the message, then return to standby
  },
  onEnd: () => {
    // If recognition ended without a result (and we are not processing), reset.
    if (!busy) state.classList.remove('listening');
  },
});

// --- Inputs ---------------------------------------------------------------
micBtn.addEventListener('click', () => {
  if (conversing) {
    conversing = false;
    ears.stop();
    idle(PROMPT);
    return;
  }
  if (busy) return;
  conversing = true;
  ears.start();
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleQuery(input.value); // typed fallback, great for testing
});

idle(PROMPT);
