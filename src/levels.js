import { mulberry32, shuffle } from './rng.js';

// 스티치 색 팔레트. 레벨 아트의 문자 하나가 색 하나에 대응한다 ('.' 은 빈 칸)
export const PALETTE = {
  R: '#e5484d', // 빨강
  P: '#f497b6', // 분홍
  O: '#f5913e', // 주황
  Y: '#f7c948', // 노랑
  G: '#4caf6a', // 초록
  L: '#a3d977', // 연두
  B: '#3e7bd6', // 파랑
  C: '#7cc7f0', // 하늘
  V: '#9b6fd6', // 보라
  W: '#f4ecdc', // 크림
  K: '#4a3a3a', // 진갈색
  N: '#a0693f', // 갈색
};

/**
 * @typedef {object} LevelDef
 * @property {string} name
 * @property {string[]} art     픽셀 아트 (행마다 같은 길이)
 * @property {number} cap       보빈 하나가 감는 기본 스티치 수
 * @property {number} queues    보빈 대기열 줄 수
 * @property {number} slots     보관함 칸 수
 * @property {number} belt      벨트에 동시에 올라갈 수 있는 보빈 수
 * @property {number} [mix]     0~1, 클수록 보빈 순서가 뒤섞여 어려워진다
 */

/** @type {LevelDef[]} */
export const LEVELS = [
  {
    name: '하트',
    cap: 4, queues: 2, slots: 5, belt: 5,
    art: [
      '.RR...RR.',
      'RPPR.RPPR',
      'RPPPRPPPR',
      'RPPPPPPPR',
      '.RPPPPPR.',
      '..RPPPR..',
      '...RPR...',
      '....R....',
    ],
  },
  {
    name: '버섯',
    cap: 5, queues: 3, slots: 5, belt: 5,
    art: [
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
  },
  {
    name: '꽃',
    cap: 5, queues: 3, slots: 5, belt: 5,
    art: [
      '...PP.PP...',
      '..PPPPPPP..',
      '..PPYYYPP..',
      '.PPPYYYPPP.',
      '..PPYYYPP..',
      '..PPPPPPP..',
      '...PP.PP...',
      '.....G.....',
      '..LL.G.LL..',
      '...LLGLL...',
      '.....G.....',
    ],
  },
  {
    name: '고양이',
    cap: 6, queues: 3, slots: 5, belt: 5, mix: 0.2,
    art: [
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
  },
  {
    name: '아이스크림',
    cap: 6, queues: 3, slots: 5, belt: 5, mix: 0.2,
    art: [
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
  },
  {
    name: '나무',
    cap: 6, queues: 4, slots: 5, belt: 5, mix: 0.35,
    art: [
      '....GGG....',
      '...GGLGG...',
      '..GLGGGLG..',
      '..GGGRGGG..',
      '.GGLGGGGLG.',
      '.GRGGGLGGG.',
      'GGGGLGGGRGG',
      'GLGGGGGLGGG',
      '.GGGRGGGGG.',
      '....NNN....',
      '....NNN....',
      '...NNNNN...',
    ],
  },
  {
    name: '무지개',
    cap: 7, queues: 4, slots: 5, belt: 5, mix: 0.35,
    art: [
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
  },
  {
    name: '고래',
    cap: 7, queues: 4, slots: 5, belt: 5, mix: 0.4,
    art: [
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
  },
];

/** 준비된 레벨을 다 깨면 시드 기반으로 대칭 패턴을 만들어 끝없이 이어간다 */
export function proceduralLevel(n) {
  const rng = mulberry32(n * 9973 + 17);
  const k = n - LEVELS.length;
  const colorCount = 3 + Math.min(3, Math.floor(k / 4));
  for (;;) {
    const w = 10 + Math.floor(rng() * 5);
    const h = 9 + Math.floor(rng() * 5);
    const keys = shuffle(Object.keys(PALETTE), rng).slice(0, colorCount);
    const half = Math.ceil(w / 2);
    const circles = [];
    const count = 5 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      circles.push({
        x: rng() * half,
        y: rng() * h,
        r: 1.5 + rng() * (i === 0 ? 4 : 2.5),
        ch: keys[i % keys.length],
      });
    }
    let filled = 0;
    const art = [];
    for (let y = 0; y < h; y++) {
      const left = [];
      for (let x = 0; x < half; x++) {
        let ch = '.';
        for (const c of circles) {
          if (Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= c.r) ch = c.ch;
        }
        if (ch !== '.') filled++;
        left.push(ch);
      }
      art.push(left.concat(left.slice(0, w - half).reverse()).join(''));
    }
    if (filled * 2 >= 30) {
      return {
        name: `패턴 #${n + 1}`,
        art,
        cap: 6 + Math.min(4, Math.floor(k / 5)),
        queues: 4,
        slots: k >= 8 ? 4 : 5,
        belt: 5,
        mix: Math.min(1, 0.4 + k * 0.05),
      };
    }
  }
}

/** @returns {LevelDef} */
export function getLevel(i) {
  return i < LEVELS.length ? LEVELS[i] : proceduralLevel(i);
}
