const TRANSCRIBE_URL = '/transcribe';

const MIC_ERRORS = {
  NotAllowedError: 'Microphone access was denied, sir.',
  SecurityError: 'Microphone access was denied, sir.',
  NotFoundError: 'No microphone is available, sir.',
  DevicesNotFoundError: 'No microphone is available, sir.',
  NotReadableError: 'The microphone is in use by something else, sir.',
  TrackStartError: 'The microphone is in use by something else, sir.',
};

// VAD filter
const SILENCE_RMS = 0.015;
const SILENCE_MS = 1100; 
const MAX_WAIT_MS = 6000;
const MAX_RECORD_MS = 15000;

export class JarvisEars {
  constructor(opts = {}) {
    this.onStart = opts.onStart || (() => {});
    this.onResult = opts.onResult || (() => {});
    this.onError = opts.onError || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.onProcessing = opts.onProcessing || (() => {});

    this.supported = !!(navigator.mediaDevices && window.MediaRecorder);
    this.recording = false;
    this.aborted = false;
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.ac = null;
    this.raf = null;
  }

  async start() {
    if (!this.supported) {
      this.onError('unsupported', 'This browser cannot record audio, sir.');
      return;
    }
    if (this.recording) return;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      this.onError(e.name, MIC_ERRORS[e.name] || 'The microphone could not be accessed, sir.');
      return;
    }

    this.stream = stream;
    this.chunks = [];
    this.aborted = false;
    this.recorder = new MediaRecorder(stream);
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.onstop = () => this.finish();
    this.recorder.start();
    this.recording = true;
    this.onStart();
    this.watchSilence(stream);
  }

  // stop the recording once we go quiet
  watchSilence(stream) {
    this.ac = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.ac.createMediaStreamSource(stream);
    const analyser = this.ac.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    const data = new Float32Array(analyser.fftSize);
    const began = performance.now();
    let heardSpeech = false;
    let silenceSince = 0;

    const tick = () => {
      if (!this.recording) return;
      analyser.getFloatTimeDomainData(data);

      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      const now = performance.now();

      if (rms > SILENCE_RMS) {
        heardSpeech = true;
        silenceSince = 0;
      } else if (heardSpeech) {
        if (!silenceSince) silenceSince = now;
        else if (now - silenceSince > SILENCE_MS) return this.autoStop();
      }

      if (!heardSpeech && now - began > MAX_WAIT_MS) return this.autoStop();
      if (now - began > MAX_RECORD_MS) return this.autoStop();

      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  // stop to transcribe
  autoStop() {
    if (!this.recording) return;
    this.recording = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.recorder.stop();
  }

  // manual stop
  stop() {
    if (!this.recording) return;
    this.aborted = true;
    this.recording = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.recorder.stop();
  }

  async finish() {
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.ac) { this.ac.close(); this.ac = null; }
    this.stream.getTracks().forEach((t) => t.stop());
    this.onEnd();
    if (this.aborted) return; // cancelled

    const blob = new Blob(this.chunks, { type: this.recorder.mimeType || 'audio/webm' });
    if (!blob.size) {
      this.onError('no-speech', "I didn't hear anything, sir.");
      return;
    }

    this.onProcessing();

    try {
      const form = new FormData();
      form.append('file', blob, 'speech.webm');
      const res = await fetch(TRANSCRIBE_URL, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`transcribe ${res.status}`);

      const text = (await res.json()).text;
      if (text && text.trim()) this.onResult(text.trim());
      else this.onError('no-speech', "I didn't hear anything, sir."); // silence or noise
    } catch {
      this.onError('network', 'I could not make out that audio, sir.');
    }
  }
}
