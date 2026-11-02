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
  maple: '#e6c79a',
  mapleDark: '#b98f5c',
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

function spoolLabel(ctx, text, x, y, size, color) {
  ctx.font = `600 ${size}px "Outfit", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = shade(color, -0.6);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = '#fffaf0';
  ctx.fillText(text, x, y);
}

/** 원판 하나 (옆면 + 윗면). face 는 윗면 칠 */
function disc(ctx, x, y, R, ry, th, side, face) {
  ctx.fillStyle = side;
  ctx.beginPath();
  ctx.ellipse(x, y + th, R, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - R, y, R * 2, th);
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.ellipse(x, y, R, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** 대기열·보관함의 실패: 원목 플랜지, 실크 실, 금테 두른 색 캡에 숫자 */
function drawSpool(ctx, x, y, R, color, label, dim = 0) {
  const base = dim ? shade(color, -dim) : color;
  const c = (amt) => shade(base, amt);
  const ry = R * 0.6, th = R * 0.2;
  const ty = y - R * 0.5, by = y + R * 0.55;

  ctx.beginPath();
  ctx.ellipse(x, by + th + R * 0.14, R * 1.05, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = THEME.shadow;
  ctx.fill();

  // 아래 원목 플랜지
  const woodFace = ctx.createLinearGradient(x - R, 0, x + R, 0);
  woodFace.addColorStop(0, THEME.mapleDark);
  woodFace.addColorStop(0.4, THEME.maple);
  woodFace.addColorStop(1, THEME.mapleDark);
  disc(ctx, x, by, R, ry, th, shade(THEME.mapleDark, -0.3), woodFace);

  // 실크 실
  const w = R * 0.7;
  const grad = ctx.createLinearGradient(x - w, 0, x + w, 0);
  grad.addColorStop(0, c(-0.4));
  grad.addColorStop(0.28, c(0.25));
  grad.addColorStop(0.42, c(0.05));
  grad.addColorStop(1, c(-0.45));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.rect(x - w, ty, w * 2, by - ty);
  ctx.ellipse(x, by, w, ry * 0.7, 0, 0, Math.PI);
  ctx.fill();
  ctx.lineWidth = Math.max(0.6, R * 0.025);
  ctx.strokeStyle = c(-0.3);
  ctx.globalAlpha = 0.35;
  for (let i = 1; i < 9; i++) {
    const yy = ty + ((by - ty) * i) / 9;
    ctx.beginPath();
    ctx.ellipse(x, yy, w, ry * 0.55, 0, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 위 원목 플랜지 + 금테 색 캡
  disc(ctx, x, ty, R, ry, th, shade(THEME.mapleDark, -0.25), woodFace);
  ctx.beginPath();
  ctx.ellipse(x, ty, R * 0.8, ry * 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = goldGradient(ctx, x - R, ty - ry, x + R, ty + ry);
  ctx.fill();
  const cap = ctx.createRadialGradient(x - R * 0.25, ty - ry * 0.35, R * 0.05, x, ty, R * 0.75);
  cap.addColorStop(0, c(0.3));
  cap.addColorStop(0.6, base);
  cap.addColorStop(1, c(-0.2));
  ctx.beginPath();
  ctx.ellipse(x, ty, R * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
  ctx.fillStyle = cap;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, R * 0.04);
  ctx.beginPath();
  ctx.ellipse(x, ty, R * 0.62, ry * 0.6, 0, Math.PI * 1.1, Math.PI * 1.5);
  ctx.stroke();

  if (label !== undefined) {
    const text = String(label);
    spoolLabel(ctx, text, x, ty + R * 0.03, R * (text.length >= 3 ? 0.56 : 0.7), base);
  }
}

/** 벨트 위에 누운 실패. fill(0~1)만큼 실이 두툼해진다 */
function drawBeltSpool(ctx, x, y, h, color, fill, label, alpha = 1) {
  const fw = h * 0.2, bodyW = h * 0.64;
  const bodyH = h * (0.42 + 0.4 * fill);
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.52, h * 0.58, h * 0.13, 0, 0, Math.PI * 2);
  ctx.fillStyle = THEME.shadow;
  ctx.fill();

  const yarn = ctx.createLinearGradient(0, y - bodyH / 2, 0, y + bodyH / 2);
  yarn.addColorStop(0, shade(color, -0.2));
  yarn.addColorStop(0.3, shade(color, 0.3));
  yarn.addColorStop(0.55, color);
  yarn.addColorStop(1, shade(color, -0.45));
  ctx.beginPath();
  ctx.roundRect(x - bodyW / 2, y - bodyH / 2, bodyW, bodyH, bodyH * 0.3);
  ctx.fillStyle = yarn;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.lineWidth = Math.max(0.6, h * 0.025);
  ctx.strokeStyle = shade(color, -0.3);
  ctx.globalAlpha = alpha * 0.35;
  for (let i = -8; i <= 8; i++) {
    const xx = x + i * h * 0.05;
    ctx.beginPath();
    ctx.moveTo(xx - h * 0.04, y - bodyH / 2);
    ctx.lineTo(xx + h * 0.04, y + bodyH / 2);
    ctx.stroke();
  }
  ctx.restore();

  for (const side of [-1, 1]) {
    const fx = x + side * (bodyW / 2 + fw / 2);
    const g = ctx.createLinearGradient(fx - fw / 2, 0, fx + fw / 2, 0);
    g.addColorStop(0, THEME.mapleDark);
    g.addColorStop(0.45, THEME.maple);
    g.addColorStop(1, shade(THEME.mapleDark, -0.25));
    ctx.beginPath();
    ctx.roundRect(fx - fw / 2, y - h / 2, fw, h, fw * 0.45);
    ctx.fillStyle = g;
    ctx.fill();
  }

  if (label !== undefined) spoolLabel(ctx, String(label), x, y - h * 0.72, h * 0.48, color);
  ctx.restore();
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

export function draw(ctx, game, view, time, dt) {
  const { s, ox, oy, dpr } = view;
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
  const bh = game.trackW * 1.1 * s;
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
