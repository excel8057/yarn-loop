import { paint, upscale, outline, pad, heart, HAND } from './art.js';
import { generateLevel } from './generator.js';

export { PALETTE } from './art.js';

/**
 * @typedef {object} LevelDef
 * @property {string} name
 * @property {string[]} art     픽셀 아트 (행마다 같은 길이)
 * @property {number} bobbins   목표 보빈 개수 (보빈당 스티치 수는 여기서 계산된다)
 * @property {number} queues    보빈 대기열 줄 수
 * @property {number} slots     보관함 칸 수
 * @property {number} belt      벨트에 동시에 올라갈 수 있는 보빈 수
 * @property {number} [mix]     0~1, 클수록 보빈 순서가 뒤섞여 어려워진다
 */

// ── 그림 ───────────────────────────────────────────────

const ART = {
  heart: () => paint(18, 16, (u, v) => {
    const x = u * 1.22, y = -v * 1.2 + 0.12;
    if (!heart(x, y)) return;
    if (!heart(x / 0.78, (y - 0.04) / 0.78)) return 'R';
    if ((u + 0.4) ** 2 + (v + 0.32) ** 2 < 0.035) return 'W';
    return 'P';
  }),

  target: () => paint(22, 22, (u, v) => {
    const d = Math.max(Math.abs(u), Math.abs(v), (Math.abs(u) + Math.abs(v)) / 1.38);
    if (d > 1) return;
    if (d < 0.14) return 'Y';
    return Math.floor(d * 7.5) % 2 ? 'W' : 'V';
  }),

  flower: () => outline(pad(paint(22, 22, (u, v) => {
    const r = Math.hypot(u, v), a = Math.atan2(v, u);
    if (r < 0.2) return 'O';
    if (r < 0.3) return 'Y';
    const petal = 0.48 + 0.48 * ((1 + Math.cos(5 * a + Math.PI / 2)) / 2) ** 0.7;
    if (r < petal - 0.16) return 'P';
    if (r < petal) return 'M';
  }))),

  watermelon: () => outline(pad(paint(26, 13, (u, v, x, y) => {
    const r = Math.hypot(u, (y + 0.5) / 13);
    if (r > 1) return;
    if (r > 0.88) return 'G';
    if (r > 0.8) return 'L';
    if (r > 0.74) return 'W';
    if (y >= 2 && r < 0.62 && (x * 7 + y * 5) % 9 === 0) return 'K';
    return 'R';
  }))),

  mandala: () => outline(pad(paint(26, 26, (u, v) => {
    const r = Math.hypot(u, v), a = Math.atan2(v, u);
    if (r < 0.12) return 'K';
    if (r < 0.26 + 0.12 * (1 + Math.cos(8 * a)) / 2) return 'Y';
    if (r < 0.42) return 'T';
    if (r < 0.5) return 'O';
    const petal = 0.78 + 0.2 * (1 + Math.cos(8 * a + Math.PI)) / 2;
    if (r < petal - 0.16) return 'V';
    if (r < petal) return 'E';
  }))),

  planet: () => outline(pad(paint(30, 22, (u, v) => {
    const px = (u * 30) / 22, py = v;
    const c = Math.cos(-0.25), sn = Math.sin(-0.25);
    const rx = px * c - py * sn, ry = px * sn + py * c;
    const d = Math.hypot(rx / 1.3, ry / 0.4);
    const inPlanet = Math.hypot(px, py) < 0.62;
    if (d > 0.7 && d < 1 && (ry > 0 || !inPlanet)) return d > 0.85 ? 'C' : 'B';
    if (inPlanet) return ['Y', 'O', 'N', 'O', 'Y', 'O', 'N'][Math.floor((ry + 0.62) * 5)] ?? 'O';
  }))),
};

/** @type {LevelDef[]} */
export const LEVELS = [
  { name: '하트', art: ART.heart(), bobbins: 8, queues: 3, slots: 5, belt: 5 },
  { name: '버섯', art: upscale(HAND.mushroom), bobbins: 10, queues: 4, slots: 5, belt: 5 },
  { name: '과녁', art: ART.target(), bobbins: 12, queues: 4, slots: 5, belt: 5, mix: 0.1 },
  { name: '꽃', art: ART.flower(), bobbins: 14, queues: 5, slots: 5, belt: 5, mix: 0.15 },
  { name: '고양이', art: upscale(HAND.cat), bobbins: 16, queues: 5, slots: 5, belt: 5, mix: 0.2 },
  { name: '수박', art: ART.watermelon(), bobbins: 14, queues: 5, slots: 5, belt: 5, mix: 0.25 },
  { name: '아이스크림', art: upscale(HAND.icecream), bobbins: 16, queues: 5, slots: 5, belt: 5, mix: 0.3 },
  { name: '만다라', art: ART.mandala(), bobbins: 20, queues: 5, slots: 5, belt: 5, mix: 0.35 },
  { name: '무지개', art: upscale(HAND.rainbow), bobbins: 18, queues: 5, slots: 5, belt: 5, mix: 0.4 },
  { name: '행성', art: ART.planet(), bobbins: 20, queues: 5, slots: 5, belt: 5, mix: 0.4 },
  { name: '고래', art: upscale(HAND.whale), bobbins: 16, queues: 5, slots: 5, belt: 5, mix: 0.45 },
];

/** 전체 스테이지 수. 손으로 만든 레벨 뒤로는 생성기가 채운다 */
export const TOTAL_LEVELS = 400;

/** @returns {LevelDef} */
export function getLevel(i) {
  return i < LEVELS.length ? LEVELS[i] : generateLevel(i);
}
