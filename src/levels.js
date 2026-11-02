import { mulberry32, shuffle } from './rng.js';

// 스티치 색 팔레트. 레벨 아트의 문자 하나가 색 하나에 대응한다 ('.' 은 빈 칸)
export const PALETTE = {
  R: '#e0393e', // 빨강
  P: '#f58fb4', // 분홍
  M: '#d23f9a', // 자홍
  O: '#f5862a', // 주황
  Y: '#f8c637', // 노랑
  G: '#3fa65a', // 초록
  L: '#9fd85e', // 연두
  T: '#25b5a8', // 청록
  C: '#6cc4f2', // 하늘
  B: '#2f6fd8', // 파랑
  D: '#283b8c', // 남색
  V: '#8a4fd8', // 보라
  E: '#c9b0f2', // 라벤더
  W: '#f3ede2', // 크림
  N: '#9b5f36', // 갈색
  K: '#2c2727', // 검정
};

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

// ── 픽셀 아트 도구 ─────────────────────────────────────

/** fn(u, v, x, y): u,v 는 -1~1 정규화 좌표. 색 문자 또는 빈 값을 돌려준다 */
function paint(w, h, fn) {
  const art = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      row += fn(((x + 0.5) / w) * 2 - 1, ((y + 0.5) / h) * 2 - 1, x, y) || '.';
    }
    art.push(row);
  }
  return art;
}

/** 칸마다 f×f 로 키운다 */
function upscale(art, f = 2) {
  return art.flatMap((r) => Array(f).fill([...r].map((c) => c.repeat(f)).join('')));
}

/** 그림 바깥 테두리에 외곽선 색을 한 겹 두른다 (십자수 느낌) */
function outline(art, ch = 'K') {
  const h = art.length, w = art[0].length;
  const at = (x, y) => (x >= 0 && x < w && y >= 0 && y < h ? art[y][x] : '.');
  return art.map((row, y) => [...row].map((c, x) => {
    if (c !== '.') return c;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (at(x + dx, y + dy) !== '.' && at(x + dx, y + dy) !== ch) return ch;
    }
    return '.';
  }).join(''));
}

/** 가로세로 한 칸씩 여백을 붙인다 (외곽선이 들어갈 자리) */
function pad(art) {
  const blank = '.'.repeat(art[0].length + 2);
  return [blank, ...art.map((r) => `.${r}.`), blank];
}

const heart = (x, y) => (x * x + y * y - 1) ** 3 - x * x * y * y * y <= 0;

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
    if (d < 0.14) return 'D';
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

const HAND = {
  mushroom: [
    '...RRRR...',
    '..RRWWRR..',
    '.RWWRRRRR.',
    'RRWRRRWWRR',
    'RRRRRRWWRR',
    'RWWRRRRRRR',
    '.RRRRRRRR.',
    '...WWWW...',
    '...WWKW...',
    '...WWWW...',
  ],
  cat: [
    '.K........K.',
    '.KK......KK.',
    '.KOK....KOK.',
    '.KOOKKKKOOK.',
    '.KOOOOOOOOK.',
    'KOOGOOOOGOOK',
    'KOOGOOOOGOOK',
    'KOOOOPPOOOOK',
    'KWWOOOOOOWWK',
    '.KWWOKKOWWK.',
    '..KKKKKKKK..',
  ],
  icecream: [
    '...PPPP...',
    '..PPPWPP..',
    '.PPWPPPPP.',
    '.PPPPPPWP.',
    '.CCCCCCCC.',
    'CCWCCCCCCC',
    'CCCCCCWCCC',
    '.NNNNNNNN.',
    '..NYNNYN..',
    '..NNYNNN..',
    '...NYNN...',
    '....NN....',
    '....N.....',
  ],
  rainbow: [
    '....RRRRRR....',
    '..RROOOOOORR..',
    '.ROOYYYYYYOOR.',
    'ROYYGGGGGGYYOR',
    'ROYGBBBBBBGYOR',
    'ROYGB....BGYOR',
    'ROYGB....BGYOR',
    'WWWWW....WWWWW',
    'WWWWW....WWWWW',
  ],
  whale: [
    '.........B..B.',
    '..........BB..',
    '...BBBBBB.B...',
    '..BBBBBBBBB...',
    '.BBKBBBBBBBB..',
    '.BBBBBBBBBBBBB',
    '.CCCCCCBBBBBB.',
    '..CCCCCCCBBB..',
    '....CCCCC.....',
  ],
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

/** 준비된 레벨을 다 깨면 시드 기반 만다라를 끝없이 만든다 */
export function proceduralLevel(n) {
  const rng = mulberry32(n * 9973 + 17);
  const k = n - LEVELS.length;
  const size = 22 + Math.floor(rng() * 7);
  const sym = [4, 5, 6, 8][Math.floor(rng() * 4)];
  const keys = shuffle(Object.keys(PALETTE).filter((c) => c !== 'K'), rng).slice(0, 4 + Math.min(3, Math.floor(k / 3)));
  const bandCount = 4 + Math.floor(rng() * 3);
  const bands = Array.from({ length: bandCount }, (_, i) => ({
    r: 0.15 + ((i + 1) / bandCount) * 0.75,
    amp: rng() < 0.6 ? 0.06 + rng() * 0.16 : 0,
    phase: rng() * Math.PI,
    color: keys[i % keys.length],
    alt: rng() < 0.3 ? keys[(i + 2) % keys.length] : null,
  }));
  const art = outline(pad(paint(size, size, (u, v) => {
    const r = Math.hypot(u, v), a = Math.atan2(v, u);
    for (const b of bands) {
      const lobe = (1 + Math.cos(sym * a + b.phase)) / 2;
      if (r < b.r + b.amp * lobe) return b.alt && Math.cos(sym * a + b.phase) > 0.3 ? b.alt : b.color;
    }
  })));
  return {
    name: `만다라 #${k + 1}`,
    art,
    bobbins: 18 + Math.min(10, k),
    queues: 5,
    slots: k >= 6 ? 4 : 5,
    belt: 5,
    mix: Math.min(1, 0.45 + k * 0.05),
  };
}

/** @returns {LevelDef} */
export function getLevel(i) {
  return i < LEVELS.length ? LEVELS[i] : proceduralLevel(i);
}
