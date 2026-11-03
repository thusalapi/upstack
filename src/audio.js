// Tiny WebAudio sound kit: UI blips, thuds, chimes and Simlish-style babble.
let ctx = null;
let master = null;
let musicGain = null;
let muted = false;
let musicTimer = null;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.12;
  musicGain.connect(master);
  startMusic();
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, dest = null } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest || master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol = 0.3, delay = 0, lp = 800) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
}

export const sfx = {
  click: () => tone(880, 0.08, { type: 'triangle', vol: 0.15 }),
  open: () => { tone(660, 0.07, { type: 'triangle', vol: 0.12 }); tone(990, 0.09, { type: 'triangle', vol: 0.12, delay: 0.05 }); },
  whoosh: () => noise(0.35, 0.08, 0, 2400),
  thud: () => { noise(0.25, 0.5, 0, 400); tone(90, 0.25, { type: 'sine', vol: 0.4, slide: -40 }); },
  hit: () => { tone(420, 0.35, { type: 'square', vol: 0.12, slide: -260 }); noise(0.15, 0.3, 0, 900); },
  chime: () => [523, 659, 784].forEach((f, i) => tone(f, 0.5, { type: 'sine', vol: 0.18, delay: i * 0.08 })),
  stone: () => { tone(200, 0.15, { type: 'triangle', vol: 0.3, slide: -80 }); noise(0.12, 0.25, 0.02, 1200); },
  fanfare: () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.16, delay: i * 0.11 })),
  sad: () => [392, 349, 311].forEach((f, i) => tone(f, 0.45, { type: 'sine', vol: 0.15, delay: i * 0.18 })),
  snore: () => noise(0.8, 0.06, 0, 300),
};

// Simlish-ish babble: quick formant-like blips with random pitch contour.
export function babble(syllables = 4, pitch = 1) {
  if (!ctx) return;
  let base = (180 + Math.random() * 40) * pitch;
  for (let i = 0; i < syllables; i++) {
    const f = base * (0.85 + Math.random() * 0.5);
    const d = 0.07 + Math.random() * 0.06;
    tone(f, d, { type: 'sawtooth', vol: 0.05, slide: (Math.random() - 0.5) * 120, delay: i * 0.11 });
    tone(f * 2.01, d, { type: 'sine', vol: 0.05, delay: i * 0.11 });
  }
}

// Gentle generative lo-fi loop.
function startMusic() {
  const chords = [
    [261.6, 329.6, 392.0, 493.9],
    [220.0, 261.6, 329.6, 392.0],
    [174.6, 220.0, 261.6, 329.6],
    [196.0, 246.9, 293.7, 349.2],
  ];
  let step = 0;
  const beat = 0.55;
  const play = () => {
    if (!ctx) return;
    const c = chords[Math.floor(step / 8) % chords.length];
    if (step % 8 === 0) c.forEach((f) => tone(f / 2, beat * 8, { type: 'sine', vol: 0.08, dest: musicGain }));
    if (Math.random() < 0.7) {
      const n = c[Math.floor(Math.random() * c.length)] * (Math.random() < 0.5 ? 1 : 2);
      tone(n, beat * 1.4, { type: 'triangle', vol: 0.07, dest: musicGain });
    }
    if (step % 2 === 0) noise(0.04, 0.03, 0, 6000);
    step++;
  };
  musicTimer = setInterval(play, beat * 1000);
}
