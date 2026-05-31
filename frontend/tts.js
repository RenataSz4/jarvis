const endpoint = '/api/tts';

export class JarvisVoice {
  constructor(opts = {}) {
    this.onStart = opts.onStart || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.onLevel = opts.onLevel || (level => {
      document.documentElement.style.setProperty('--intensity', level.toFixed(3));
    });

    this.player = new Audio();
    this.player.crossOrigin = 'anonymous';
    this.ac = null;
    this.analyser = null;
    this.ready = false;
    this.frame = null;
  }

  setupAudio() {
    if (this.ready) return;
    this.ac = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.ac.createMediaElementSource(this.player);
    this.analyser = this.ac.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);
    this.analyser.connect(this.ac.destination);
    this.ready = true;
  }

  startMeter() {
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const loop = () => {
      this.analyser.getByteFrequencyData(data);
      let total = 0;
      for (let i = 0; i < data.length; i++) total += data[i];
      const level = Math.min(1, (total / data.length) / 140); // normalize to 0..1
      this.onLevel(level);
      this.frame = requestAnimationFrame(loop);
    };
    loop();
  }

  stopMeter() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.onLevel(0);
  }

  async speak(text) {
    if (!text || !text.trim()) return;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`TTS backend ${res.status}`);

    const blob = await res.blob(); 
    const src = URL.createObjectURL(blob);

    this.setupAudio();
    if (this.ac.state === 'suspended') await this.ac.resume();

    return new Promise((resolve, reject) => {
      this.player.src = src;
      this.player.onplaying = () => { this.onStart(); this.startMeter(); };
      const done = () => {
        this.stopMeter();
        URL.revokeObjectURL(src);
        this.onEnd();
        resolve();
      };
      this.player.onended = done;
      this.player.onerror = () => { this.stopMeter(); this.onEnd(); reject(new Error('audio failed')); };
      this.player.play().catch(reject);
    });
  }

  stop() {
    this.player.pause();
    this.player.currentTime = 0;
    this.stopMeter();
    this.onEnd();
  }
}