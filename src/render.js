// Canvas 렌더러. 월드 좌표(스티치 한 칸 = 1)를 view.s 배율로 화면에 그린다.
// 아트 방향: 장인의 공방. 호두나무 액자, 리넨 천, 황동 레일, 원목 실패, 금색 포인트.

const THEME = {
  shadow: 'rgba(5, 10, 15, 0.45)',
  softShadow: 'rgba(40, 25, 15, 0.28)',
  woodLight: '#9a6a43',
  woodDark: '#5e3b22',
  woodEdge: '#3f2615',
  gold: '#d8b46a',
  goldLight: '#f3dca0',
  goldDark: '#9c7631',
  linen: '#f2ebdf',
  linenWeave: 'rgba(150, 120, 85, 0.09)',
  groove: '#2b211b',
  grooveMid: '#3a2d24',
  maple: '#c99560',
  mapleDark: '#7d5130',
  slot: 'rgba(8, 14, 20, 0.45)',
  slotEdge: 'rgba(216, 180, 106, 0.45)',
  ink: '#e9dcc3',
  alert: '#e5604f',
};

/** 색(#rrggbb 또는 rgb())을 밝게(+) 또는 어둡게(-) */
function shade(color, amt) {
  let r, g, b;
  if (color[0] === '#') {
    const n = parseInt(color.slice(1), 16);
    [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  } else {
    [r, g, b] = color.match(/\d+/g).map(Number);
  }
  const mix = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/** 월드 영역 전체가 화면에 들어오도록 배율과 오프셋을 정한다 */
export function computeView(game, w, h, top, dpr) {
  const b = game.bounds();
  const ww = b.maxX - b.minX, wh = b.maxY - b.minY;
  const availW = w - 24, availH = h - top - 8;
  const s = Math.min(availW / ww, availH / wh);
  return {
    s,
    dpr,
    ox: (w - ww * s) / 2 - b.minX * s,
    oy: top + (availH - wh * s) / 2 - b.minY * s,
  };
}

// ── 재질 ───────────────────────────────────────────────

let woodPattern = null;

/** 나뭇결 무늬를 한 번 만들어 두고 패턴으로 쓴다 */
function woodTexture(ctx) {
  if (woodPattern) return woodPattern;
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, THEME.woodDark);
  grad.addColorStop(0.5, THEME.woodLight);
  grad.addColorStop(1, THEME.woodDark);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const y0 = Math.random() * 256, amp = 2 + Math.random() * 5, f = 0.01 + Math.random() * 0.03;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(40,22,10,0.22)' : 'rgba(255,220,170,0.08)';
    g.lineWidth = 0.6 + Math.random() * 1.6;
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y0 + Math.sin(x * f + i) * amp);
    g.stroke();
  }
  woodPattern = ctx.createPattern(c, 'repeat');
  return woodPattern;
}

function goldGradient(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, THEME.goldLight);
  g.addColorStop(0.45, THEME.gold);
  g.addColorStop(1, THEME.goldDark);
  return g;
}

// ── 스티치 ─────────────────────────────────────────────

// 스티치는 칸보다 크게 그려 위아래 이웃과 겹치게 한다 (아랫줄 고리가 윗줄을 덮는 니트 구조)
const SPRITE_SCALE = 1.5;
const VARIANTS = 3;
const spriteCache = new Map();

/**
 * 니트 스티치 한 칸: 두 가닥이 꼬인 실 고리 두 개가 V자로 맞물린 모양.
 * 왼쪽 위 조명 기준의 원통 음영, 꼬임 결, 보풀, 아래로 떨어지는 그림자를 스프라이트에 굽는다.
 * px 는 한 칸의 픽셀 크기. variant 마다 꼬임 위치와 색조가 조금씩 달라 손뜨개처럼 보인다.
 */
function stitchSprite(color, px, variant = 0) {
  const key = `${color}@${px}#${variant}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const size = Math.ceil(px * SPRITE_SCALE);
  c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const g = c.getContext('2d');
  const s = px;
  let seed = variant * 7919 + 17;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tint = shade(color, [0, 0.05, -0.05][variant % 3]);
  g.translate(size / 2, size / 2);

  for (const side of [-1, 1]) {
    g.save();
    g.translate(side * s * 0.215, s * 0.02);
    g.rotate(side * 0.42);
    const rx = s * 0.25, ry = s * 0.6;
    const arm = () => {
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    };

    // 아래로 떨어지는 그림자: 고리가 천에서 떠 있는 깊이
    g.save();
    g.shadowColor = 'rgba(20, 10, 5, 0.55)';
    g.shadowBlur = s * 0.18;
    g.shadowOffsetX = s * 0.03;
    g.shadowOffsetY = s * 0.09;
    arm();
    g.fillStyle = shade(tint, -0.35);
    g.fill();
    g.restore();

    // 원통 음영: 폭 방향으로 왼쪽은 밝고 오른쪽은 어둡게
    const cyl = g.createLinearGradient(-rx, 0, rx, 0);
    cyl.addColorStop(0, shade(tint, -0.22));
    cyl.addColorStop(0.28, shade(tint, 0.24));
    cyl.addColorStop(0.55, tint);
    cyl.addColorStop(1, shade(tint, -0.42));
    arm();
    g.fillStyle = cyl;
    g.fill();

    g.save();
    arm();
    g.clip();
    // 길이 방향: 아래 끝은 다음 고리 밑으로 파고들며 어두워진다
    const len = g.createLinearGradient(0, -ry, 0, ry);
    len.addColorStop(0, 'rgba(255,245,230,0.12)');
    len.addColorStop(0.55, 'rgba(0,0,0,0)');
    len.addColorStop(1, 'rgba(20,10,5,0.38)');
    g.fillStyle = len;
    g.fillRect(-rx, -ry, rx * 2, ry * 2);
    // 꼬임 결: 비스듬한 가닥 사이 홈(어둡게)과 가닥 등(밝게)
    const step = ry * 0.4;
    const phase = rnd() * step;
    for (let yy = -ry - step + phase; yy < ry + step; yy += step) {
      g.beginPath();
      g.moveTo(-rx * 1.1, yy + rx * 0.75);
      g.quadraticCurveTo(0, yy + rx * 0.1, rx * 1.1, yy - rx * 0.75);
      g.strokeStyle = shade(tint, -0.5);
      g.globalAlpha = 0.5;
      g.lineWidth = Math.max(0.6, s * 0.035);
      g.stroke();
      g.beginPath();
      g.moveTo(-rx * 1.1, yy + rx * 0.75 + step * 0.4);
      g.quadraticCurveTo(0, yy + rx * 0.1 + step * 0.4, rx * 1.1, yy - rx * 0.75 + step * 0.4);
      g.strokeStyle = shade(tint, 0.5);
      g.globalAlpha = 0.28;
      g.lineWidth = Math.max(0.6, s * 0.05);
      g.stroke();
    }
    // 보풀
    g.globalAlpha = 0.2;
    g.fillStyle = '#fffaf0';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.arc((rnd() - 0.5) * rx * 1.6, (rnd() - 0.5) * ry * 1.6, Math.max(0.4, s * 0.016), 0, Math.PI * 2);
      g.fill();
    }
    g.restore();

    // 광택
    g.beginPath();
    g.ellipse(-rx * 0.38, -ry * 0.22, rx * 0.16, ry * 0.36, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,250,240,0.2)';
    g.fill();
    g.restore();
  }
  spriteCache.set(key, c);
  return c;
}

/** 보드 전체를 오프스크린에 그려 두고 스티치가 빠질 때만 다시 그린다 */
const board = { game: null, key: '', version: -1, canvas: null, tmp: null, pad: 0 };

function boardImage(game, s, dpr) {
  const cs = s * dpr;
  const key = `${cs.toFixed(3)}`;
  if (board.game !== game || board.key !== key) {
    board.game = game;
    board.key = key;
    board.version = -1;
    board.pad = Math.ceil(cs * 2);
    const w = Math.ceil(game.cols * cs) + board.pad * 2;
    const h = Math.ceil(game.rows * cs) + board.pad * 2;
    board.canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    board.tmp = Object.assign(document.createElement('canvas'), { width: w, height: h });
  }
  if (board.version !== game.version) {
    board.version = game.version;
    const t = board.tmp.getContext('2d');
    const { pad } = board;
    t.clearRect(0, 0, board.tmp.width, board.tmp.height);
    const px = Math.max(3, Math.round(cs));
    const sp = Math.ceil(px * SPRITE_SCALE) * (cs / px);
    // 고리 사이로 보이는 깊은 틈. 이웃이 없는 면은 안쪽으로 줄여 윤곽이 각지지 않게 한다
    const filled = (x, y) => x >= 0 && x < game.cols && y >= 0 && y < game.rows && game.grid[y * game.cols + x] >= 0;
    for (let y = 0; y < game.rows; y++) {
      for (let x = 0; x < game.cols; x++) {
        const c = game.grid[y * game.cols + x];
        if (c < 0) continue;
        const l = filled(x - 1, y) ? -0.5 : cs * 0.14;
        const r = filled(x + 1, y) ? -0.5 : cs * 0.14;
        const u = filled(x, y - 1) ? -0.5 : cs * 0.2;
        const d = filled(x, y + 1) ? -0.5 : cs * 0.12;
        t.fillStyle = shade(game.colors[c], -0.62);
        t.fillRect(pad + x * cs + l, pad + y * cs + u, cs - l - r, cs - u - d);
      }
    }
    // 윗줄부터 그려서 아랫줄 고리가 윗줄 끝을 덮게 한다
    for (let y = 0; y < game.rows; y++) {
      for (let x = 0; x < game.cols; x++) {
        const c = game.grid[y * game.cols + x];
        if (c < 0) continue;
        const v = (((x * 73856093) ^ (y * 19349663)) >>> 0) % VARIANTS;
        t.drawImage(stitchSprite(game.colors[c], px, v), pad + (x + 0.5) * cs - sp / 2, pad + (y + 0.5) * cs - sp / 2, sp, sp);
      }
    }
    // 작품 전체에 왼쪽 위 조명
    t.save();
    t.globalCompositeOperation = 'source-atop';
    const lightGrad = t.createLinearGradient(pad, pad, pad + game.cols * cs, pad + game.rows * cs);
    lightGrad.addColorStop(0, 'rgba(255,240,215,0.12)');
    lightGrad.addColorStop(0.5, 'rgba(255,240,215,0)');
    lightGrad.addColorStop(1, 'rgba(10,5,0,0.16)');
    t.fillStyle = lightGrad;
    t.fillRect(0, 0, board.tmp.width, board.tmp.height);
    t.restore();

    // 천 위에 떠 있는 느낌: 넓고 부드러운 그림자 + 가까운 접지 그림자
    const g = board.canvas.getContext('2d');
    g.clearRect(0, 0, board.canvas.width, board.canvas.height);
    g.save();
    g.shadowColor = 'rgba(40, 24, 10, 0.4)';
    g.shadowBlur = cs * 0.9;
    g.shadowOffsetX = cs * 0.15;
    g.shadowOffsetY = cs * 0.4;
    g.drawImage(board.tmp, 0, 0);
    g.shadowColor = 'rgba(30, 18, 8, 0.45)';
    g.shadowBlur = cs * 0.2;
    g.shadowOffsetX = cs * 0.04;
    g.shadowOffsetY = cs * 0.1;
    g.drawImage(board.tmp, 0, 0);
    g.restore();
  }
  return board;
}

// ── 실패(보빈) ─────────────────────────────────────────

// 실패는 디테일이 많아 매 프레임 그리기엔 무겁다. 색·크기·숫자별로 한 번 그려 두고 재사용한다.
const spoolCache = new Map();
let spoolDpr = 1;

function cachedSprite(id, w, h, paint) {
  const key = `${id}@${spoolDpr}`;
  let c = spoolCache.get(key);
  if (c) return c;
  if (spoolCache.size > 400) spoolCache.clear();
  c = Object.assign(document.createElement('canvas'), {
    width: Math.ceil(w * spoolDpr),
    height: Math.ceil(h * spoolDpr),
  });
  const g = c.getContext('2d');
  g.scale(spoolDpr, spoolDpr);
  paint(g);
  spoolCache.set(key, c);
  return c;
}

/** 선반으로 깎은 원목 원판: 둥근 옆면, 나이테 윗면, 테두리 반사광 */
function woodDisc(g, x, y, R, ry, th) {
  // 옆면 (원통)
  const side = g.createLinearGradient(x - R, 0, x + R, 0);
  side.addColorStop(0, shade(THEME.mapleDark, -0.35));
  side.addColorStop(0.25, THEME.maple);
  side.addColorStop(0.45, shade(THEME.maple, 0.12));
  side.addColorStop(1, shade(THEME.mapleDark, -0.45));
  g.beginPath();
  g.ellipse(x, y + th, R, ry, 0, 0, Math.PI);
  g.lineTo(x - R, y);
  g.ellipse(x, y, R, ry, 0, Math.PI, 0, true);
  g.closePath();
  g.fillStyle = side;
  g.fill();
  // 옆면 가운데 둥근 모서리 반사
  g.strokeStyle = 'rgba(255,240,215,0.25)';
  g.lineWidth = Math.max(0.6, th * 0.18);
  g.beginPath();
  g.ellipse(x, y + th * 0.45, R * 0.995, ry, 0, Math.PI * 0.15, Math.PI * 0.85);
  g.stroke();

  // 윗면: 나이테
  const face = g.createRadialGradient(x - R * 0.3, y - ry * 0.4, R * 0.1, x, y, R);
  face.addColorStop(0, shade(THEME.maple, 0.25));
  face.addColorStop(0.7, THEME.maple);
  face.addColorStop(1, shade(THEME.mapleDark, -0.05));
  g.beginPath();
  g.ellipse(x, y, R, ry, 0, 0, Math.PI * 2);
  g.fillStyle = face;
  g.fill();
  g.strokeStyle = 'rgba(120,80,40,0.16)';
  g.lineWidth = Math.max(0.5, R * 0.02);
  for (const f of [0.92, 0.82, 0.74]) {
    g.beginPath();
    g.ellipse(x, y, R * f, ry * f, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // 테두리 반사광 (왼쪽 위)과 아래쪽 경계
  g.strokeStyle = 'rgba(255,248,230,0.7)';
  g.lineWidth = Math.max(0.8, R * 0.045);
  g.lineCap = 'round';
  g.beginPath();
  g.ellipse(x, y, R * 0.975, ry * 0.96, 0, Math.PI * 1.05, Math.PI * 1.6);
  g.stroke();
  g.strokeStyle = shade(THEME.mapleDark, -0.4);
  g.lineWidth = Math.max(0.5, R * 0.025);
  g.beginPath();
  g.ellipse(x, y, R, ry, 0, Math.PI * 0.05, Math.PI * 0.95);
  g.stroke();
}

/** 가운데가 살짝 불룩하게 감긴 실 몸통 (세운 실패) */
function threadBody(g, x, top, bottom, w0, w1, ry, color) {
  const mid = (top + bottom) / 2;
  const path = () => {
    g.beginPath();
    g.moveTo(x - w0, top);
    g.quadraticCurveTo(x - w1 * 1.04, mid, x - w0, bottom);
    g.ellipse(x, bottom, w0, ry * (w0 / w1), 0, Math.PI, 0, true);
    g.quadraticCurveTo(x + w1 * 1.04, mid, x + w0, top);
    g.closePath();
  };
  const body = g.createLinearGradient(x - w1, 0, x + w1, 0);
  body.addColorStop(0, shade(color, -0.55));
  body.addColorStop(0.16, shade(color, -0.12));
  body.addColorStop(0.3, shade(color, 0.32));
  body.addColorStop(0.38, shade(color, 0.12));
  body.addColorStop(0.6, color);
  body.addColorStop(0.85, shade(color, -0.3));
  body.addColorStop(1, shade(color, -0.6));
  path();
  g.fillStyle = body;
  g.fill();

  g.save();
  path();
  g.clip();
  // 감긴 실 결
  const step = Math.max(1.2, (bottom - top) / 16);
  g.lineWidth = Math.max(0.5, step * 0.35);
  let i = 0;
  for (let yy = top + step * 0.5; yy < bottom + ry; yy += step, i++) {
    g.strokeStyle = i % 2 ? shade(color, -0.35) : shade(color, 0.35);
    g.globalAlpha = i % 2 ? 0.3 : 0.1;
    g.beginPath();
    g.ellipse(x, yy, w1 * 1.05, ry * 0.75, 0, 0.1, Math.PI - 0.1);
    g.stroke();
  }
  g.globalAlpha = 1;
  // 비단 광택띠
  const sheen = g.createLinearGradient(x - w1, 0, x + w1, 0);
  sheen.addColorStop(0.22, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.3, 'rgba(255,255,255,0.28)');
  sheen.addColorStop(0.36, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(x - w1 * 1.1, top - ry, w1 * 2.2, bottom - top + ry * 3);
  // 플랜지 밑 그늘
  const ao = g.createLinearGradient(0, top, 0, bottom);
  ao.addColorStop(0, 'rgba(15,8,2,0.45)');
  ao.addColorStop(0.12, 'rgba(15,8,2,0)');
  ao.addColorStop(0.85, 'rgba(15,8,2,0)');
  ao.addColorStop(1, 'rgba(15,8,2,0.35)');
  g.fillStyle = ao;
  g.fillRect(x - w1 * 1.1, top - ry, w1 * 2.2, bottom - top + ry * 3);
  g.restore();
}

/** 위 원판의 금박 테 컬러 라벨과 양각 숫자 */
function spoolLabelDisc(g, x, y, R, ry, color, text) {
  const lr = R * 0.7, lry = ry * 0.7;
  g.beginPath();
  g.ellipse(x, y, lr + R * 0.06, lry + R * 0.04, 0, 0, Math.PI * 2);
  g.fillStyle = goldGradient(g, x - lr, y - lry, x + lr, y + lry);
  g.fill();
  const paper = g.createRadialGradient(x - lr * 0.35, y - lry * 0.5, lr * 0.05, x, y, lr * 1.05);
  paper.addColorStop(0, shade(color, 0.28));
  paper.addColorStop(0.55, color);
  paper.addColorStop(1, shade(color, -0.25));
  g.beginPath();
  g.ellipse(x, y, lr, lry, 0, 0, Math.PI * 2);
  g.fillStyle = paper;
  g.fill();
  g.strokeStyle = 'rgba(255,240,200,0.35)';
  g.lineWidth = Math.max(0.5, R * 0.02);
  g.beginPath();
  g.ellipse(x, y, lr * 0.86, lry * 0.84, 0, 0, Math.PI * 2);
  g.stroke();
  // 라벨 윤기
  g.beginPath();
  g.ellipse(x - lr * 0.3, y - lry * 0.45, lr * 0.42, lry * 0.22, -0.2, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.fill();

  if (text === undefined) return;
  const size = R * (text.length >= 3 ? 0.52 : 0.66);
  g.font = `600 ${size}px "Outfit", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const ty = y + R * 0.03;
  g.fillStyle = 'rgba(10,5,0,0.45)';
  g.fillText(text, x, ty + size * 0.08);
  g.lineWidth = size * 0.2;
  g.strokeStyle = shade(color, -0.6);
  g.strokeText(text, x, ty);
  const ink = g.createLinearGradient(0, ty - size / 2, 0, ty + size / 2);
  ink.addColorStop(0, '#ffffff');
  ink.addColorStop(1, '#efe2c4');
  g.fillStyle = ink;
  g.fillText(text, x, ty);
}

/** 대기열·보관함의 세운 실패: 원목 원판 두 장 사이에 실, 위에 금박 라벨 */
function drawSpool(ctx, x, y, R, color, label, dim = 0) {
  const r = Math.max(4, Math.round(R));
  const text = label === undefined ? undefined : String(label);
  const W = r * 2.5, H = r * 3;
  const sprite = cachedSprite(`s|${color}|${r}|${text}|${dim}`, W, H, (g) => {
    const cx = W / 2, cy = H * 0.45;
    const ry = r * 0.5, th = r * 0.19;
    const ty = cy - r * 0.74, by = cy + r * 0.5;

    // 바닥 그림자: 넓고 흐린 것 + 가까운 접지 그림자
    const sx = cx + r * 0.1, sy = by + th + r * 0.15;
    const soft = g.createRadialGradient(sx, sy, r * 0.2, sx, sy, r * 1.25);
    soft.addColorStop(0, 'rgba(0,0,0,0.5)');
    soft.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = soft;
    g.beginPath();
    g.ellipse(sx, sy, r * 1.25, ry * 1.2, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(cx, by + th + r * 0.04, r * 0.95, ry * 0.85, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fill();

    woodDisc(g, cx, by, r, ry, th);
    threadBody(g, cx, ty + th, by, r * 0.68, r * 0.76, ry * 0.76, color);
    woodDisc(g, cx, ty, r, ry, th);
    spoolLabelDisc(g, cx, ty, r, ry, color, text);

    if (dim) {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(8,12,18,${dim * 2.2})`;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
  });
  const scale = R / r;
  ctx.drawImage(sprite, x - (W / 2) * scale, y - H * 0.45 * scale, W * scale, H * scale);
}

/** 벨트 위에 누운 실패. fill(0~1)만큼 실이 두툼해진다. 숫자는 금테 명판에 */
function drawBeltSpool(ctx, x, y, h, color, fill, label, alpha = 1) {
  const hp = Math.max(6, Math.round(h));
  const bucket = Math.round(fill * 10);
  const W = hp * 1.6, H = hp * 1.5;
  const sprite = cachedSprite(`b|${color}|${hp}|${bucket}`, W, H, (g) => {
    const cx = W / 2, cy = H * 0.45;
    const fw = hp * 0.2, bodyW = hp * 0.62;
    const bodyH = hp * (0.44 + 0.38 * (bucket / 10));

    const sx = cx + hp * 0.05, sy = cy + hp * 0.52;
    const soft = g.createRadialGradient(sx, sy, hp * 0.1, sx, sy, hp * 0.7);
    soft.addColorStop(0, 'rgba(0,0,0,0.5)');
    soft.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = soft;
    g.beginPath();
    g.ellipse(sx, sy, hp * 0.7, hp * 0.16, 0, 0, Math.PI * 2);
    g.fill();

    // 실 원통 (가로로 누움)
    const top = cy - bodyH / 2, bot = cy + bodyH / 2;
    const body = g.createLinearGradient(0, top, 0, bot);
    body.addColorStop(0, shade(color, -0.35));
    body.addColorStop(0.18, shade(color, 0.3));
    body.addColorStop(0.3, shade(color, 0.12));
    body.addColorStop(0.6, color);
    body.addColorStop(1, shade(color, -0.6));
    g.beginPath();
    g.moveTo(cx - bodyW / 2, top + bodyH * 0.06);
    g.quadraticCurveTo(cx, top - bodyH * 0.06, cx + bodyW / 2, top + bodyH * 0.06);
    g.lineTo(cx + bodyW / 2, bot - bodyH * 0.06);
    g.quadraticCurveTo(cx, bot + bodyH * 0.06, cx - bodyW / 2, bot - bodyH * 0.06);
    g.closePath();
    g.fillStyle = body;
    g.fill();
    g.save();
    g.clip();
    const step = Math.max(1.2, bodyW / 14);
    g.lineWidth = Math.max(0.5, step * 0.35);
    let i = 0;
    for (let xx = cx - bodyW / 2; xx < cx + bodyW / 2 + step; xx += step, i++) {
      g.strokeStyle = i % 2 ? shade(color, -0.35) : shade(color, 0.35);
      g.globalAlpha = i % 2 ? 0.35 : 0.18;
      g.beginPath();
      g.moveTo(xx - step * 0.4, top - 2);
      g.quadraticCurveTo(xx + step * 0.3, cy, xx - step * 0.4, bot + 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    const ao = g.createLinearGradient(cx - bodyW / 2, 0, cx + bodyW / 2, 0);
    ao.addColorStop(0, 'rgba(15,8,2,0.45)');
    ao.addColorStop(0.15, 'rgba(15,8,2,0)');
    ao.addColorStop(0.85, 'rgba(15,8,2,0)');
    ao.addColorStop(1, 'rgba(15,8,2,0.45)');
    g.fillStyle = ao;
    g.fillRect(cx - bodyW / 2, top - 4, bodyW, bodyH + 8);
    g.restore();

    // 원목 플랜지 (옆에서 본 원판)
    for (const side of [-1, 1]) {
      const px = cx + side * (bodyW / 2 + fw / 2);
      const wood = g.createLinearGradient(0, cy - hp / 2, 0, cy + hp / 2);
      wood.addColorStop(0, shade(THEME.maple, 0.2));
      wood.addColorStop(0.35, THEME.maple);
      wood.addColorStop(1, shade(THEME.mapleDark, -0.4));
      g.beginPath();
      g.roundRect(px - fw / 2, cy - hp / 2, fw, hp, fw * 0.5);
      g.fillStyle = wood;
      g.fill();
      // 바깥쪽 원판 면
      g.beginPath();
      g.ellipse(px + side * fw * 0.18, cy, fw * 0.32, hp * 0.47, 0, 0, Math.PI * 2);
      g.fillStyle = shade(THEME.maple, side < 0 ? 0.1 : -0.15);
      g.globalAlpha = 0.6;
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,248,230,0.6)';
      g.lineWidth = Math.max(0.6, fw * 0.12);
      g.beginPath();
      g.moveTo(px - fw * 0.15, cy - hp * 0.4);
      g.lineTo(px - fw * 0.15, cy - hp * 0.1);
      g.stroke();
      g.strokeStyle = shade(THEME.mapleDark, -0.45);
      g.lineWidth = Math.max(0.5, fw * 0.06);
      g.beginPath();
      g.roundRect(px - fw / 2, cy - hp / 2, fw, hp, fw * 0.5);
      g.stroke();
    }
  });
  const scale = h / hp;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - (W / 2) * scale, y - H * 0.45 * scale, W * scale, H * scale);
  if (label !== undefined) beltPlate(ctx, String(label), x, y - h * 0.8, h * 0.42);
  ctx.restore();
}

/** 벨트 위 실패의 남은 수: 금테 두른 작은 명판 */
function beltPlate(ctx, text, x, y, size) {
  ctx.font = `600 ${size}px "Outfit", system-ui, sans-serif`;
  const w = Math.max(size * 1.5, ctx.measureText(text).width + size * 0.8), h = size * 1.25;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = 'rgba(13,21,27,0.88)';
  ctx.fill();
  ctx.strokeStyle = THEME.gold;
  ctx.lineWidth = Math.max(1, size * 0.08);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.goldLight;
  ctx.fillText(text, x, y + size * 0.04);
}

// ── 판 ─────────────────────────────────────────────────

/** 호두나무 액자, 금빛 안쪽 선, 리넨 천 */
function drawBoardCard(ctx, game, X, Y, s) {
  const { G, trackW, cols: C, rows: R, k } = game;
  const out = G + trackW * 0.5 + 0.32 * k;
  const r = (1.1 * k + trackW * 0.5 + 0.32 * k) * s;
  const fx = X(-out), fy = Y(-out), fw = (C + out * 2) * s, fh = (R + out * 2) * s;

  ctx.save();
  ctx.shadowColor = THEME.shadow;
  ctx.shadowBlur = 1.2 * k * s;
  ctx.shadowOffsetY = 0.4 * k * s;
  ctx.beginPath();
  ctx.roundRect(fx, fy, fw, fh, r);
  ctx.fillStyle = THEME.woodDark;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(fx, fy, fw, fh, r);
  ctx.fillStyle = woodTexture(ctx);
  ctx.fill();
  // 위쪽 빛 반사와 아래쪽 그늘
  const light = ctx.createLinearGradient(0, fy, 0, fy + fh);
  light.addColorStop(0, 'rgba(255,230,190,0.18)');
  light.addColorStop(0.5, 'rgba(255,230,190,0)');
  light.addColorStop(1, 'rgba(20,10,5,0.25)');
  ctx.fillStyle = light;
  ctx.fill();
  ctx.strokeStyle = THEME.woodEdge;
  ctx.lineWidth = Math.max(1, 0.06 * k * s);
  ctx.stroke();
  ctx.restore();

  // 리넨 천
  const inset = G - trackW * 0.4;
  const x0 = X(-inset), y0 = Y(-inset), x1 = X(C + inset), y1 = Y(R + inset);
  const ri = Math.max(2, (1.1 * k - trackW * 0.4) * s);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, y0, x1 - x0, y1 - y0, ri);
  ctx.fillStyle = THEME.linen;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = THEME.linenWeave;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = Math.max(2, s * 0.5);
  for (let x = x0; x <= x1; x += step) { ctx.moveTo(Math.round(x) + 0.5, y0); ctx.lineTo(Math.round(x) + 0.5, y1); }
  for (let y = y0; y <= y1; y += step) { ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); }
  ctx.stroke();
  // 가장자리 안쪽 그늘
  const vg = ctx.createRadialGradient((x0 + x1) / 2, (y0 + y1) / 2, Math.min(x1 - x0, y1 - y0) * 0.35,
    (x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) * 0.75);
  vg.addColorStop(0, 'rgba(90,60,30,0)');
  vg.addColorStop(1, 'rgba(90,60,30,0.18)');
  ctx.fillStyle = vg;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.restore();

  // 금빛 안쪽 선
  ctx.beginPath();
  ctx.roundRect(x0, y0, x1 - x0, y1 - y0, ri);
  ctx.strokeStyle = goldGradient(ctx, x0, y0, x1, y1);
  ctx.lineWidth = Math.max(1.5, 0.09 * k * s);
  ctx.stroke();
}

// ── 벨트 ───────────────────────────────────────────────

function trackPath(ctx, game, X, Y, s) {
  const { G, gap, cols: C, rows: R, k } = game;
  const L = X(-G), T = Y(-G), Rr = X(C + G), B = Y(R + G);
  const cr = 1.1 * k * s, g = gap * s;
  ctx.beginPath();
  ctx.moveTo(L, B - g);
  ctx.arcTo(L, T, Rr, T, cr);
  ctx.arcTo(Rr, T, Rr, B, cr);
  ctx.arcTo(Rr, B, L, B, cr);
  ctx.lineTo(L + g, B);
}

function drawTrack(ctx, game, X, Y, s) {
  const tw = game.trackW * s;
  const { G, cols: C, rows: R } = game;
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';

  // 황동 레일
  trackPath(ctx, game, X, Y, s);
  ctx.strokeStyle = THEME.goldDark;
  ctx.lineWidth = tw;
  ctx.stroke();
  trackPath(ctx, game, X, Y, s);
  ctx.strokeStyle = goldGradient(ctx, X(-G), Y(-G), X(C + G), Y(R + G));
  ctx.lineWidth = tw * 0.9;
  ctx.stroke();
  // 홈
  trackPath(ctx, game, X, Y, s);
  ctx.strokeStyle = THEME.groove;
  ctx.lineWidth = tw * 0.64;
  ctx.stroke();
  trackPath(ctx, game, X, Y, s);
  ctx.strokeStyle = THEME.grooveMid;
  ctx.lineWidth = tw * 0.4;
  ctx.stroke();
  trackPath(ctx, game, X, Y, s);
  ctx.setLineDash([Math.max(1, tw * 0.04), tw * 0.7]);
  ctx.strokeStyle = 'rgba(216,180,106,0.25)';
  ctx.lineWidth = tw * 0.64;
  ctx.stroke();
  ctx.setLineDash([]);

  // 입구 양 끝 황동 마개
  const L = X(-G), B = Y(R + G), g = game.gap * s;
  const cap = (cx, cy, w, h) => {
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, Math.min(w, h) * 0.5);
    ctx.fillStyle = goldGradient(ctx, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
    ctx.fill();
    ctx.strokeStyle = shade(THEME.goldDark, -0.3);
    ctx.lineWidth = Math.max(1, tw * 0.05);
    ctx.stroke();
  };
  cap(L, B - g, tw * 1.08, tw * 0.36);
  cap(L + g, B, tw * 0.36, tw * 1.08);
  ctx.restore();
}

/** 입구 옆의 벨트 카운터: 황동 명판 */
function drawBadge(ctx, game, X, Y, s) {
  const { k } = game;
  const cx = X(-game.G - 0.35 * k), cy = Y(game.rows + game.G + 0.85 * k);
  const w = 1.6 * k * s, h = 0.9 * k * s;
  const full = game.beltCount >= game.beltCap;

  ctx.save();
  ctx.shadowColor = THEME.shadow;
  ctx.shadowBlur = h * 0.5;
  ctx.shadowOffsetY = h * 0.15;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h * 0.3);
  ctx.fillStyle = goldGradient(ctx, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
  ctx.fill();
  ctx.restore();
  const p = h * 0.1;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2 + p, cy - h / 2 + p, w - p * 2, h - p * 2, h * 0.22);
  ctx.fillStyle = full ? '#5a1d1d' : '#1d2a33';
  ctx.fill();

  ctx.font = `600 ${h * 0.46}px "Outfit", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = full ? '#ffb4a8' : THEME.goldLight;
  ctx.fillText(`${game.beltCount}/${game.beltCap}`, cx, cy + h * 0.03);
}

// ── 파티클 ─────────────────────────────────────────────

const particles = [];
const SPARKLE = ['#f3dca0', '#d8b46a', '#fffaf0'];

export const fx = {
  /** 스티치가 뽑힐 때 실 보푸라기 */
  fluff(x, y, color) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, life: 0, max: 0.35, color, r: 0.18, kind: 'dot' });
    }
  },
  /** 실패를 다 채웠을 때 금빛 반짝이 */
  burst(x, y, color, k) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 4) * k;
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2 * k, g: 9 * k, life: 0, max: 0.6 + Math.random() * 0.3,
        color: i % 3 ? SPARKLE[i % SPARKLE.length] : color, r: (0.1 + Math.random() * 0.12) * k, kind: i % 2 ? 'star' : 'dot',
      });
    }
  },
  /** 완성 축하: 그림 색과 금색 꽃가루 */
  confetti(game, colors) {
    const { k } = game;
    const all = [...colors, ...SPARKLE];
    for (let i = 0; i < 140; i++) {
      particles.push({
        x: Math.random() * game.cols, y: -game.G - Math.random() * 6 * k,
        vx: (Math.random() - 0.5) * 4 * k, vy: Math.random() * 3 * k, g: 6 * k,
        life: 0, max: 2.2 + Math.random(), color: all[i % all.length],
        r: (0.16 + Math.random() * 0.14) * k, kind: 'paper', spin: Math.random() * 10, rot: Math.random() * 6,
      });
    }
  },
  clear() { particles.length = 0; },
};

function drawParticles(ctx, dt, X, Y, s) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.max) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const t = p.life / p.max;
    ctx.globalAlpha = 1 - t * t;
    ctx.fillStyle = p.color;
    const r = p.r * s;
    if (p.kind === 'paper') {
      p.rot += p.spin * dt;
      ctx.save();
      ctx.translate(X(p.x), Y(p.y));
      ctx.rotate(p.rot);
      ctx.fillRect(-r, -r * 0.5 * Math.abs(Math.cos(p.rot * 1.7)), r * 2, r * Math.abs(Math.cos(p.rot * 1.7)));
      ctx.restore();
    } else if (p.kind === 'star') {
      ctx.save();
      ctx.translate(X(p.x), Y(p.y));
      ctx.rotate(t * 3);
      ctx.beginPath();
      for (let j = 0; j < 8; j++) {
        const rr = j % 2 ? r * 0.4 : r * 1.2;
        ctx.lineTo(Math.cos((j * Math.PI) / 4) * rr, Math.sin((j * Math.PI) / 4) * rr);
      }
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), r * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ── 전체 장면 ──────────────────────────────────────────

/** 시작 화면의 미리보기: 액자·레일·뜨개 그림만 canvas 크기에 맞춰 그린다 */
export function drawPreview(canvas, game, dpr) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const { G, trackW, cols: C, rows: R, k } = game;
  const out = G + trackW * 0.5 + 0.32 * k;
  const pad = 14;
  const s = Math.min((w - pad * 2) / (C + out * 2), (h - pad * 2) / (R + out * 2));
  const ox = w / 2 - (C / 2) * s, oy = h / 2 - (R / 2) * s;
  const X = (wx) => ox + wx * s;
  const Y = (wy) => oy + wy * s;
  spoolDpr = dpr;
  drawBoardCard(ctx, game, X, Y, s);
  drawTrack(ctx, game, X, Y, s);
  const img = boardImage(game, s, dpr);
  ctx.drawImage(img.canvas, X(0) - img.pad / dpr, Y(0) - img.pad / dpr, img.canvas.width / dpr, img.canvas.height / dpr);
}

export function draw(ctx, game, view, time, dt) {
  const { s, ox, oy, dpr } = view;
  spoolDpr = dpr;
  const X = (wx) => ox + wx * s;
  const Y = (wy) => oy + wy * s;
  const { k } = game;

  drawBoardCard(ctx, game, X, Y, s);
  drawTrack(ctx, game, X, Y, s);

  const img = boardImage(game, s, dpr);
  ctx.drawImage(img.canvas, X(0) - img.pad / dpr, Y(0) - img.pad / dpr, img.canvas.width / dpr, img.canvas.height / dpr);

  // 날아가는 스티치와 실
  const flyPx = Math.max(2, Math.ceil(s * dpr));
  for (const f of game.flies) {
    const t = f.t;
    const tx = f.target.x, ty = f.target.y;
    const mx = (f.sx + tx) / 2 + (f.sy - ty) * 0.15, my = (f.sy + ty) / 2 - (tx - f.sx) * 0.15;
    const px = (1 - t) ** 2 * f.sx + 2 * (1 - t) * t * mx + t * t * tx;
    const py = (1 - t) ** 2 * f.sy + 2 * (1 - t) * t * my + t * t * ty;
    ctx.beginPath();
    ctx.moveTo(X(tx), Y(ty));
    ctx.quadraticCurveTo(X(mx), Y(my), X(px), Y(py));
    ctx.strokeStyle = game.colors[f.color];
    ctx.lineWidth = Math.max(1.2, s * 0.14);
    ctx.lineCap = 'round';
    ctx.stroke();
    const size = s * (1.15 - t * 0.6) * SPRITE_SCALE;
    ctx.drawImage(stitchSprite(game.colors[f.color], flyPx), X(px) - size / 2, Y(py) - size / 2, size, size);
  }

  drawBadge(ctx, game, X, Y, s);

  // 보관함: 벨벳 홈에 금빛 테두리
  const sw = game.slotW * s;
  game.slots.forEach((_, i) => {
    const p = game.slotPos(i);
    const x0 = X(p.x) - sw / 2, y0 = Y(p.y) - sw * 0.5;
    ctx.beginPath();
    ctx.roundRect(x0, y0, sw, sw, sw * 0.2);
    const well = ctx.createLinearGradient(0, y0, 0, y0 + sw);
    well.addColorStop(0, 'rgba(0,0,0,0.55)');
    well.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = well;
    ctx.fill();
    ctx.strokeStyle = THEME.slotEdge;
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.stroke();
  });

  const wobble = (b) => (b.shake > 0 ? Math.sin(b.shake * 60) * 0.12 * k * (b.shake / 0.35) : 0);
  const park = game.parkR * s;

  for (const b of game.slots) {
    if (b) drawSpool(ctx, X(b.x + wobble(b)), Y(b.y), park * 0.85, game.colors[b.color], b.remaining);
  }

  // 대기열: 위에서부터 그려야 아랫줄이 윗줄 위로 겹친다
  game.queues.forEach((q, qi) => {
    for (let row = 0; row < Math.min(q.length, 3); row++) {
      const b = q[row];
      drawSpool(ctx, X(b.x + wobble(b)), Y(b.y), park, game.colors[b.color], b.remaining, row * 0.06);
    }
    if (q.length > 3) {
      const p = game.supplyPos(qi, 2);
      ctx.font = `500 ${Math.round(park * 0.55)}px "Outfit", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.gold;
      ctx.globalAlpha = 0.75;
      ctx.fillText(`+${q.length - 3}`, X(p.x), Y(p.y) + park * 1.85);
      ctx.globalAlpha = 1;
    }
  });

  // 벨트 위 실패 (대기열에서 벨트로 옮겨 가는 동안은 세운 실패 모양 유지)
  const bh = game.trackW * 1.22 * s;
  for (const b of game.launchQueue) {
    drawSpool(ctx, X(b.x), Y(b.y), park * (1 - b.tween * 0.35), game.colors[b.color], b.remaining);
  }
  for (const b of game.belt) {
    const fill = 1 - b.remaining / b.total;
    if (b.tween < 0.5) {
      drawSpool(ctx, X(b.x), Y(b.y), park * 0.65, game.colors[b.color], b.remaining);
    } else {
      drawBeltSpool(ctx, X(b.x), Y(b.y), bh, game.colors[b.color], fill, b.remaining || undefined);
    }
  }
  for (const b of game.popping) {
    const t = b.pop;
    drawBeltSpool(ctx, X(b.x), Y(b.y - t * 1.2 * k), bh * (1 + t * 0.5), game.colors[b.color], 1, undefined, 1 - t);
  }

  if (game.status === 'lost' && game.stranded) {
    const b = game.stranded;
    ctx.beginPath();
    ctx.arc(X(b.x), Y(b.y), (0.75 + Math.sin(time * 8) * 0.08) * k * s, 0, Math.PI * 2);
    ctx.strokeStyle = THEME.alert;
    ctx.lineWidth = Math.max(2, 0.1 * k * s);
    ctx.stroke();
  }

  drawParticles(ctx, dt, X, Y, s);
}
