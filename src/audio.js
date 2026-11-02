// 효과음은 파일 없이 WebAudio로 합성한다
let ac = null;
let muted = false;

export function unlock() {
  if (ac) return;
  try {
    ac = new AudioContext();
  } catch {
    ac = null;
  }
}

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function tone(freq, dur, { type = 'sine', vol = 0.12, delay = 0, slide = 0 } = {}) {
  if (!ac || muted) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  hit: () => tone(520 + Math.random() * 260, 0.07, { type: 'triangle', vol: 0.06 }),
  launch: () => tone(330, 0.09, { type: 'sine', vol: 0.08, slide: 1.5 }),
  done: () => [660, 880, 1100].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.07, delay: i * 0.05 })),
  park: () => tone(260, 0.14, { type: 'sine', vol: 0.09, slide: 0.7 }),
  full: () => tone(150, 0.16, { type: 'square', vol: 0.05 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.09, delay: i * 0.1 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.1, delay: i * 0.14 })),
};
