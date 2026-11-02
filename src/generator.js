// 시드 기반 스테이지 생성기. 같은 번호는 항상 같은 그림과 같은 보빈 배치가 나온다.
// 그림 종류: 모양 틀 × 무늬 조합, 손그림(색 바꾸기), 만다라, 꽃, 픽셀 친구.
import { PALETTE, paint, upscale, outline, pad, recolor, heart, HAND } from './art.js';
import { mulberry32, shuffle } from './rng.js';

// 어울리는 색끼리 묶은 팔레트 그룹 (art.js 의 PALETTE 문자)
const GROUPS = [
  ['R', 'O', 'Y', 'S', 'N', 'Q'], // 따뜻한
  ['D', 'B', 'C', 'T', 'U', 'W'], // 바다
  ['P', 'E', 'U', 'Q', 'L', 'W'], // 파스텔
  ['F', 'G', 'L', 'N', 'Y', 'Q'], // 숲
  ['M', 'P', 'C', 'Y', 'E', 'W'], // 사탕
  ['H', 'M', 'R', 'O', 'Y', 'S'], // 노을
  ['K', 'D', 'V', 'E', 'Y', 'W'], // 밤
  ['N', 'O', 'Q', 'F', 'X', 'W'], // 흙
  ['R', 'O', 'Y', 'G', 'B', 'V'], // 무지개
  ['M', 'P', 'S', 'R', 'W', 'H'], // 장미
  ['D', 'B', 'C', 'U', 'W', 'T'], // 겨울
  ['V', 'E', 'M', 'P', 'D', 'W'], // 보랏빛
];

const HAND_NAMES = {
  mushroom: '버섯', cat: '고양이', icecream: '아이스크림', rainbow: '무지개', whale: '고래',
  apple: '사과', ghost: '유령', duck: '오리', bear: '곰', frog: '개구리', house: '집', sun: '해님',
  cupcake: '컵케이크', rocket: '로켓', butterfly: '나비', fish: '물고기', crown: '왕관',
  cherry: '체리', penguin: '펭귄', cactus: '선인장',
};

// ── 모양 틀 ────────────────────────────────────────────

const MASKS = {
  circle: { name: '동그라미', fn: () => (u, v) => u * u + v * v < 1 },
  square: { name: '네모', fn: () => (u, v) => u ** 4 + v ** 4 < 0.95 },
  diamond: { name: '마름모', fn: () => (u, v) => Math.abs(u) + Math.abs(v) < 1.05 },
  hexagon: {
    name: '육각형',
    fn: () => (u, v) => Math.abs(v) < 0.88 && Math.abs(u) * 0.866 + Math.abs(v) * 0.5 < 0.88,
  },
  octagon: {
    name: '팔각형',
    fn: () => (u, v) => Math.max(Math.abs(u), Math.abs(v), (Math.abs(u) + Math.abs(v)) / 1.38) < 1,
  },
  heart: { name: '하트', fn: () => (u, v) => heart(u * 1.22, -v * 1.2 + 0.12) },
  star: {
    name: '별',
    fn: (rng) => {
      const k = 5 + Math.floor(rng() * 2);
      return (u, v) => {
        const t = ((((Math.atan2(v, u) + Math.PI / 2) * k) / (2 * Math.PI)) % 1 + 1) % 1;
        const tri = Math.abs(t - 0.5) * 2;
        return Math.hypot(u, v) < 0.45 + 0.55 * tri ** 1.6;
      };
    },
  },
  ring: { name: '도넛', fn: () => (u, v) => { const r = Math.hypot(u, v); return r < 1 && r > 0.38; } },
  blob: {
    name: '구름',
    fn: (rng) => {
      const blobs = Array.from({ length: 4 + Math.floor(rng() * 3) }, () => ({
        x: rng() * 0.6, y: rng() * 1.2 - 0.6, r: 0.3 + rng() * 0.35,
      }));
      return (u, v) => blobs.some((b) => Math.hypot(Math.abs(u) - b.x, v - b.y) < b.r);
    },
  },
};

// ── 무늬: (u, v, x, y) → 색 번호 ───────────────────────

const FILLS = {
  stripes: {
    name: '줄무늬',
    fn: (rng, n) => {
      const th = [0, Math.PI / 4, Math.PI / 2, -Math.PI / 4][Math.floor(rng() * 4)];
      const freq = 2.5 + rng() * 3;
      return (u, v) => Math.floor((u * Math.cos(th) + v * Math.sin(th) + 3) * freq) % n;
    },
  },
  waves: {
    name: '물결',
    fn: (rng, n) => {
      const freq = 2.5 + rng() * 2.5, amp = 0.1 + rng() * 0.15, f2 = 4 + rng() * 5, ph = rng() * 6;
      return (u, v) => Math.floor((v + amp * Math.sin(u * f2 + ph) + 3) * freq) % n;
    },
  },
  checker: {
    name: '체크',
    fn: (rng, n) => {
      const s = 2 + Math.floor(rng() * 3);
      return (u, v, x, y) => (Math.floor(x / s) + Math.floor(y / s)) % Math.min(n, 3);
    },
  },
  polka: {
    name: '땡땡이',
    fn: (rng, n) => {
      const sp = 4 + Math.floor(rng() * 2);
      return (u, v, x, y) => {
        const row = Math.floor(y / sp);
        const ox = (x + (row % 2) * Math.floor(sp / 2)) % sp, oy = y % sp;
        const dot = Math.abs(ox - sp / 2 + 0.5) + Math.abs(oy - sp / 2 + 0.5) <= sp / 4;
        return dot ? 1 + (row % (n - 1)) : 0;
      };
    },
  },
  rings: {
    name: '동심원',
    fn: (rng, n) => {
      const freq = 3 + rng() * 3;
      const metric = Math.floor(rng() * 3);
      return (u, v) => {
        const d = [Math.hypot(u, v), Math.abs(u) + Math.abs(v), Math.max(Math.abs(u), Math.abs(v))][metric];
        return Math.floor(d * freq) % n;
      };
    },
  },
  sectors: {
    name: '바람개비',
    fn: (rng, n) => {
      const k = n * (1 + Math.floor(rng() * 2)), twist = rng() < 0.5 ? 0 : 0.6 + rng() * 0.8;
      return (u, v) => {
        const a = Math.atan2(v, u) / (2 * Math.PI) + 0.5;
        return ((Math.floor((a + Math.hypot(u, v) * twist / k * 2) * k) % n) + n) % n;
      };
    },
  },
  fairisle: {
    name: '노르딕',
    fn: (rng, n) => {
      const bh = 3 + Math.floor(rng() * 2);
      const kinds = ['solid', 'zigzag', 'dots', 'diamond'];
      return (u, v, x, y) => {
        const band = Math.floor(y / bh), yy = y % bh;
        const base = band % n, accent = (band + 1 + Math.floor(n / 2)) % n;
        const kind = kinds[(band * 7 + 3) % kinds.length];
        const px = x % (bh * 2);
        if (kind === 'zigzag' && Math.abs(px - bh) === yy) return accent;
        if (kind === 'dots' && x % 3 === 1 && yy === Math.floor(bh / 2)) return accent;
        if (kind === 'diamond' && Math.abs(px - bh + 0.5) + Math.abs(yy - (bh - 1) / 2) <= (bh - 1) / 2 + 0.5) return accent;
        return base;
      };
    },
  },
  argyle: {
    name: '아가일',
    fn: (rng, n) => {
      const s = 3 + Math.floor(rng() * 3);
      return (u, v, x, y) => (Math.floor((x + y) / s) + Math.floor((x - y + 999) / s)) % Math.min(n, 3);
    },
  },
  gradient: {
    name: '노을',
    fn: (rng, n) => {
      const wob = rng() * 0.15;
      return (u, v, x, y) => Math.min(n - 1, Math.max(0, Math.floor(((v + 1) / 2 + Math.sin(x * 1.3 + y) * wob) * n)));
    },
  },
};

// ── 그림 종류 ──────────────────────────────────────────

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/**
 * 밝은 천 위에서는 테두리 없이도 잘 보이므로 검은 외곽선은 일부 그림에만 두른다.
 * 가늘고 성긴 그림은 테두리가 그림을 덮어 버리니 검정이 22%를 넘으면 두르지 않는다.
 */
function maybeOutline(art, rng, p) {
  if (rng() >= p) return art;
  const out = outline(pad(art));
  const cells = out.join('').replace(/\./g, '');
  const black = cells.length - cells.replace(/K/g, '').length;
  return black / cells.length > 0.22 ? art : out;
}

/** sRGB hex → CIE Lab */
function lab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const [r, g, b] = [lin(n >> 16), lin((n >> 8) & 255), lin(n & 255)];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.9505);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.089);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const LAB = Object.fromEntries(Object.entries(PALETTE).map(([ch, hex]) => [ch, lab(hex)]));
const MIN_DIST = 30; // 한 그림 안의 색끼리 최소 이만큼은 달라야 한눈에 구분된다
const dist = (a, b) => Math.hypot(...LAB[a].map((v, i) => v - LAB[b][i]));

/**
 * 팔레트 그룹에서 서로 충분히 다른 색 n 개를 고른다.
 * 그룹에서 모자라면 전체 팔레트에서 채운다. avoid 의 색(외곽선 검정 등)과도 겹치지 않게 한다.
 */
function colorsFor(rng, n, avoid = ['K']) {
  const candidates = [
    ...shuffle(pick(GROUPS, rng), rng),
    ...shuffle(Object.keys(PALETTE), rng),
  ];
  const chosen = [];
  for (const ch of candidates) {
    if (chosen.length >= n) break;
    if (chosen.includes(ch) || avoid.includes(ch)) continue;
    if ([...chosen, ...avoid].every((o) => dist(ch, o) >= MIN_DIST)) chosen.push(ch);
  }
  return chosen;
}

function shapeArt(rng, size, n) {
  const maskKey = pick(Object.keys(MASKS), rng);
  const fillKey = pick(Object.keys(FILLS), rng);
  const mask = MASKS[maskKey].fn(rng);
  const nc = fillKey === 'checker' || fillKey === 'argyle' ? Math.min(n, 3) : Math.max(2, n);
  const colors = colorsFor(rng, nc + 1);
  const border = colors.pop();
  const fill = FILLS[fillKey].fn(rng, colors.length);
  const wide = maskKey === 'heart' || maskKey === 'blob' ? 1.1 : 1;
  const w = Math.round(size * wide), h = size;
  const withBorder = rng() < 0.5;
  let art = paint(w, h, (u, v, x, y) => {
    if (!mask(u, v)) return null;
    if (withBorder && !mask(u * 1.12, v * 1.12)) return border;
    return colors[fill(u, v, x, y)];
  });
  art = maybeOutline(art, rng, 0.35);
  return { art, name: `${FILLS[fillKey].name} ${MASKS[maskKey].name}` };
}

function mandalaArt(rng, size, n) {
  const sym = pick([4, 5, 6, 8], rng);
  const keys = colorsFor(rng, Math.max(3, n));
  const bandCount = 4 + Math.floor(rng() * 3);
  const bands = Array.from({ length: bandCount }, (_, i) => ({
    r: 0.15 + ((i + 1) / bandCount) * 0.75,
    amp: rng() < 0.6 ? 0.06 + rng() * 0.16 : 0,
    phase: rng() * Math.PI,
    color: keys[i % keys.length],
    alt: rng() < 0.3 ? keys[(i + 2) % keys.length] : null,
  }));
  const art = maybeOutline(paint(size, size, (u, v) => {
    const r = Math.hypot(u, v), a = Math.atan2(v, u);
    for (const b of bands) {
      const lobe = (1 + Math.cos(sym * a + b.phase)) / 2;
      if (r < b.r + b.amp * lobe) return b.alt && Math.cos(sym * a + b.phase) > 0.3 ? b.alt : b.color;
    }
    return null;
  }), rng, 0.5);
  return { art, name: '만다라' };
}

function flowerArt(rng, size, n) {
  const petals = pick([4, 5, 6, 8], rng);
  const c = colorsFor(rng, Math.max(3, Math.min(n + 1, 5)));
  const sharp = 0.5 + rng() * 0.8;
  const art = maybeOutline(paint(size, size, (u, v) => {
    const r = Math.hypot(u, v), a = Math.atan2(v, u) - Math.PI / 2;
    const lobe = ((1 + Math.cos(petals * a)) / 2) ** sharp;
    if (r < 0.18) return c[0];
    if (r < 0.3) return c[1];
    const outer = 0.45 + 0.52 * lobe;
    if (r > outer) return null;
    if (c.length > 3 && r < 0.3 + (outer - 0.3) * 0.45) return c[3];
    return r > outer - 0.13 ? c[c.length > 4 ? 4 : 1] : c[2];
  }), rng, 0.5);
  return { art, name: '꽃' };
}

/** 좌우 대칭으로 찍는 작은 픽셀 캐릭터를 두 배로 키운다 */
function invaderArt(rng, size, n) {
  const hw = 5 + Math.floor(rng() * 3), h = 8 + Math.floor(rng() * 4);
  const eye = rng() < 0.5 ? 'K' : 'W';
  const c = colorsFor(rng, Math.max(2, Math.min(n, 4)), ['K', eye]);
  const half = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < hw; x++) {
      const edge = x === hw - 1 ? 0.4 : 0.7;
      row.push(rng() < edge ? c[Math.floor(y / h * c.length * 0.999) % c.length] : '.');
    }
    half.push(row);
  }
  const ey = 2 + Math.floor(rng() * 2), ex = 1 + Math.floor(rng() * (hw - 2));
  half[ey][ex] = eye;
  half[ey][0] = c[0];
  const art = half.map((row) => {
    const left = [...row].reverse();
    return left.concat(row.slice(1)).join('');
  });
  return { art: maybeOutline(upscale(art, 2), rng, 0.25), name: '픽셀 친구' };
}

function handArt(rng) {
  const key = pick(Object.keys(HAND), rng);
  let art = HAND[key];
  let name = HAND_NAMES[key];
  if (rng() < 0.65) {
    const used = [...new Set(art.join('').replace(/[.KW]/g, ''))];
    const pool = colorsFor(rng, used.length, ['K', 'W']);
    const map = Object.fromEntries(used.map((ch, i) => [ch, pool[i % pool.length]]));
    art = recolor(art, map);
    name = `알록달록 ${name}`;
  }
  if (rng() < 0.5) art = art.map((r) => [...r].reverse().join(''));
  return { art: maybeOutline(upscale(art, 2), rng, 0.4), name };
}

const FAMILIES = [
  { key: 'shape', weight: 45, make: shapeArt },
  { key: 'invader', weight: 14, make: invaderArt },
  { key: 'hand', weight: 18, make: handArt },
  { key: 'mandala', weight: 12, make: mandalaArt },
  { key: 'flower', weight: 11, make: flowerArt },
];

function familyOf(rng, pool = FAMILIES) {
  let r = rng() * pool.reduce((s, f) => s + f.weight, 0);
  for (const f of pool) {
    if ((r -= f.weight) < 0) return f;
  }
  return pool[0];
}

// ── 스테이지 ───────────────────────────────────────────

const stitchCount = (art) => art.join('').replace(/\./g, '').length;

/** 31번째 이후 10단계마다 어려운 스테이지 (0부터 센 번호) */
export const isHardLevel = (n) => n > 30 && n % 10 === 9;

/** n 번째(0부터) 스테이지 정의를 만든다 */
export function generateLevel(n) {
  const rng = mulberry32(n * 7919 + 13);
  const f = Math.min(1, Math.max(0, (n - 11) / 280)); // 난이도 진행도 0→1
  const hard = isHardLevel(n);

  // 바로 앞 스테이지와 같은 종류가 연달아 나오지 않게 한다
  const prev = familyOf(mulberry32((n - 1) * 7919 + 13));
  let family = familyOf(rng);
  if (family === prev) family = familyOf(rng, FAMILIES.filter((f) => f !== prev));

  const colors = Math.min(6, 2 + Math.round(f * 4) + (rng() < 0.3 ? 1 : 0));
  let result;
  for (let attempt = 0; attempt < 8; attempt++) {
    const size = Math.min(28, 16 + Math.round(f * 10) + Math.floor(rng() * 3));
    result = family.make(rng, size, colors);
    if (stitchCount(result.art) >= 110) break;
  }

  return {
    name: hard ? `★ ${result.name}` : result.name,
    art: result.art,
    bobbins: Math.round(9 + f * 19 + rng() * 3) + (hard ? 4 : 0),
    queues: 5,
    slots: hard && n > 100 ? 4 : 5,
    belt: 5,
    mix: Math.min(1, 0.15 + f * 0.8 + (hard ? 0.25 : 0)),
  };
}
