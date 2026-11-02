// 팔레트와 픽셀 아트 도구. 레벨 정의와 레벨 생성기가 함께 쓴다.

// 스티치 색 팔레트. 레벨 아트의 문자 하나가 색 하나에 대응한다 ('.' 은 빈 칸)
// 원색 대신 채도를 살짝 눌러 깊이 있는 보석 톤으로 맞췄다.
export const PALETTE = {
  R: '#c8303f', // 크림슨
  S: '#e2856a', // 코랄
  P: '#e8a2b4', // 로즈
  M: '#a8336f', // 베리
  H: '#6a2c63', // 자두
  O: '#d8742a', // 번트 오렌지
  Y: '#e2b13a', // 머스터드
  Q: '#efc3a0', // 복숭아
  G: '#2e8b57', // 에메랄드
  F: '#1d5a43', // 숲
  L: '#a3c066', // 세이지
  T: '#1e9690', // 틸
  C: '#73b2d8', // 하늘
  U: '#c6e0ea', // 얼음
  B: '#2d5aa8', // 사파이어
  D: '#22346a', // 남색
  V: '#74509f', // 자수정
  E: '#aeb1e8', // 라벤더
  W: '#f5efe4', // 아이보리
  X: '#8e8e94', // 회색
  N: '#86562f', // 호두
  K: '#2a2525', // 차콜
};

/** fn(u, v, x, y): u,v 는 -1~1 정규화 좌표. 색 문자 또는 빈 값을 돌려준다 */
export function paint(w, h, fn) {
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
export function upscale(art, f = 2) {
  return art.flatMap((r) => Array(f).fill([...r].map((c) => c.repeat(f)).join('')));
}

/**
 * 그림 바깥 테두리에 외곽선 색을 한 겹 두른다 (십자수 느낌).
 * 안쪽 구멍까지 두르면 검정이 너무 많아지므로 바깥과 이어진 빈칸에만 두른다.
 */
export function outline(art, ch = 'K') {
  const h = art.length, w = art[0].length;
  const at = (x, y) => (x >= 0 && x < w && y >= 0 && y < h ? art[y][x] : '.');
  const outside = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) stack.push([0, y], [w - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || x >= w || y < 0 || y >= h || outside[y * w + x] || art[y][x] !== '.') continue;
    outside[y * w + x] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return art.map((row, y) => [...row].map((c, x) => {
    if (c !== '.' || !outside[y * w + x]) return c;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (at(x + dx, y + dy) !== '.' && at(x + dx, y + dy) !== ch) return ch;
    }
    return '.';
  }).join(''));
}

/** 가로세로 한 칸씩 여백을 붙인다 (외곽선이 들어갈 자리) */
export function pad(art) {
  const blank = '.'.repeat(art[0].length + 2);
  return [blank, ...art.map((r) => `.${r}.`), blank];
}

/** 그림 속 색 문자를 다른 문자로 바꾼다 */
export function recolor(art, map) {
  return art.map((r) => [...r].map((c) => map[c] ?? c).join(''));
}

export const heart = (x, y) => (x * x + y * y - 1) ** 3 - x * x * y * y * y <= 0;

/** 손으로 찍은 작은 픽셀 아트 (보통 upscale 해서 쓴다) */
export const HAND = {
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
  apple: [
    '.....N.....',
    '.....NGG...',
    '..RRRNRRR..',
    '.RRWRRRRRR.',
    'RRWRRRRRRRR',
    'RRRRRRRRRRR',
    'RRRRRRRRRRR',
    'RRRRRRRRRRR',
    '.RRRRRRRRR.',
    '..RRRRRRR..',
    '...RR.RR...',
  ],
  ghost: [
    '...WWWWW...',
    '..WWWWWWW..',
    '.WWWWWWWWW.',
    '.WWKKWKKWW.',
    '.WWKKWKKWW.',
    'WWWWWWWWWWW',
    'WWWWWPWWWWW',
    'WWWWWWWWWWW',
    'WWWWWWWWWWW',
    'WWWWWWWWWWW',
    'WW.WWW.WWWW',
    'W...W...W.W',
  ],
  duck: [
    '...YYYY.....',
    '..YYYYYY....',
    '..YYKYYYOO..',
    '..YYYYYYOOO.',
    '...YYYY.....',
    '.YYYYYYYYY..',
    'YYYYYYYYYYY.',
    'YYYQQQQYYYY.',
    '.YYYYYYYYY..',
    '..YYYYYYY...',
  ],
  bear: [
    '.NN......NN.',
    'NNNN....NNNN',
    'NNNNNNNNNNNN',
    '.NNNNNNNNNN.',
    'NNKNNNNNNKNN',
    'NNNNNNNNNNNN',
    'NNNNQQQQNNNN',
    'NNNQQKKQQNNN',
    '.NNQQQQQQNN.',
    '..NNNNNNNN..',
    '....NNNN....',
  ],
  frog: [
    '.GGG....GGG.',
    'GWWKG..GWWKG',
    'GWWKGGGGWWKG',
    '.GGGGGGGGGG.',
    'GGGGGGGGGGGG',
    'GGRRRRRRRRGG',
    'GGGRRRRRRGGG',
    'LGGGGGGGGGGL',
    'LLGGGGGGGGLL',
    '.LLL....LLL.',
  ],
  house: [
    '.....RR.....',
    '....RRRR....',
    '...RRRRRR...',
    '..RRRRRRRR..',
    '.RRRRRRRRRR.',
    'RRRRRRRRRRRR',
    '.WWWWWWWWWW.',
    '.WCCWWWWCCW.',
    '.WCCWWWWCCW.',
    '.WWWWNNWWWW.',
    '.WWWWNNWWWW.',
    'GGGGGNNGGGGG',
  ],
  sun: [
    '......Y......',
    '..Y...Y...Y..',
    '...Y.....Y...',
    '.....OOO.....',
    '....OYYYO....',
    'YY.OYYYYYO.YY',
    '...OYYYYYO...',
    '...OYYYYYO...',
    '....OYYYO....',
    '.....OOO.....',
    '...Y.....Y...',
    '..Y...Y...Y..',
    '......Y......',
  ],
  cupcake: [
    '.....R......',
    '....PPPP....',
    '..PPPPPPPP..',
    '.PPWPPPPWPP.',
    'PPPPPPPWPPPP',
    'PPPPPPPPPPPP',
    '.NQNQNQNQNQ.',
    '.NQNQNQNQNQ.',
    '..NQNQNQNQ..',
    '..NQNQNQNQ..',
    '...NNNNNN...',
  ],
  rocket: [
    '.....R.....',
    '....RRR....',
    '...WWWWW...',
    '...WWWWW...',
    '...WCCCW...',
    '...WCBCW...',
    '...WCCCW...',
    '...WWWWW...',
    '..RWWWWWR..',
    '.RRWWWWWRR.',
    '.RR.WWW.RR.',
    '....OYO....',
    '....OYO....',
    '.....O.....',
  ],
  butterfly: [
    '.VV.......VV.',
    'VEEV..K..VEEV',
    'VEEEV.K.VEEEV',
    'VEYEEVKVEEYEV',
    'VEEEEVKVEEEEV',
    '.VEEEVKVEEEV.',
    '..VVVVKVVVV..',
    '.VPPPVKVPPPV.',
    'VPPYPVKVPYPPV',
    '.VPPV.K.VPPV.',
    '..VV..K..VV..',
  ],
  fish: [
    '....BBBB.....',
    '..BBBBBBB..B.',
    '.BWKBBBBBB.BB',
    'BBBBBBBBBBBBB',
    'BBBBCCCBBBBBB',
    '.BBCCCCCBB.BB',
    '..BBBBBBB..B.',
    '....BBBB.....',
  ],
  crown: [
    'Y.....Y.....Y',
    'YY...YYY...YY',
    'YYY.YYYYY.YYY',
    'YYYYYYYYYYYYY',
    'YYRYYYBYYYRYY',
    'YYYYYYYYYYYYY',
    'QQQQQQQQQQQQQ',
    'YYYYYYYYYYYYY',
  ],
  cherry: [
    '.......GG...',
    '......GG....',
    '.....N.N....',
    '....N...N...',
    '...N.....N..',
    '..N......N..',
    '.RRR....RRR.',
    'RRWRR..RRWRR',
    'RRRRR..RRRRR',
    'RRRRR..RRRRR',
    '.RRR....RRR.',
  ],
  penguin: [
    '...KKKKK...',
    '..KKKKKKK..',
    '.KWWWWWWWK.',
    '.KWKWWWKWK.',
    '.KWWWOWWWK.',
    'KKWWWWWWWKK',
    'KKWWWWWWWKK',
    'KKWWWWWWWKK',
    'KKWWWWWWWKK',
    '.KWWWWWWWK.',
    '..KWWWWWK..',
    '..OO...OO..',
  ],
  cactus: [
    '.....G.....',
    '....GGG....',
    '.G..GGG....',
    'GG..GGG..G.',
    'GG..GGG.GG.',
    'GGGGGGG.GG.',
    '.GGGGGGGGG.',
    '....GGG....',
    '....GGG....',
    '..RRRRRRR..',
    '..RRRRRRR..',
    '...RRRRR...',
    '...RRRRR...',
  ],
};
