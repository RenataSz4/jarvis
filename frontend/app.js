import { JarvisEars } from './stt.js';
import { JarvisVoice } from './tts.js';

const micBtn = document.getElementById('mic');
const input  = document.getElementById('input');
const badge  = document.getElementById('badge');
const line   = document.getElementById('line');
const state  = document.getElementById('state');

let busy = false; // true while speaking
let conversing = false;

function setState(label, message, listening = false) {
  badge.textContent = label;
  if (message != null) line.textContent = message;
  state.classList.toggle('listening', listening);
}

const PROMPT = 'Press the mic and talk to Jarvis.';

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

const voice = new JarvisVoice();

// play sound-effect cues from /sfx.
function playSfx(cues) {
  if (!cues || !cues.length) return;
  let offset = 0;
  for (const cue of cues) {
    if (!cue || !cue.name) continue;
    offset += cue.delay || 0; 
    const fx = new Audio(`/sfx/${cue.name}.mp3`);
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
    line.textContent = `${reply}\n\n(voice unavailable)`;
  }
  listenAgain();
}

const ears = new JarvisEars({
  onStart:  () => setState('LISTENING', 'Listening...', true),
  onResult: (text) => handleQuery(text),
  onError:  (code, message) => {
    if (code === 'no-speech' && conversing) { listenAgain(); return; }
    conversing = false;
    setState('ERROR', message, false);
    setTimeout(() => idle(PROMPT), 2500);
  },
  onEnd: () => {
    if (!busy) state.classList.remove('listening');
  },
});

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
  if (e.key === 'Enter') handleQuery(input.value);
});

idle(PROMPT);
