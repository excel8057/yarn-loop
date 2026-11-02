// Canvas 렌더러. 월드 좌표(스티치 한 칸 = 1)를 view.s 배율로 화면에 그린다.

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

// ── 스티치 ─────────────────────────────────────────────

const spriteCache = new Map();

/** 니트 스티치 한 칸(V자 두 고리)을 색·크기별로 미리 그려 둔다 */
function stitchSprite(color, px) {
  const key = `${color}@${px}`;
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const s = px;
  for (const side of [-1, 1]) {
    g.save();
    g.translate(s * (0.5 + side * 0.23), s * 0.5);
    g.rotate(side * 0.36);
    const grad = g.createLinearGradient(-s * 0.25, -s * 0.5, s * 0.25, s * 0.5);
    grad.addColorStop(0, shade(color, 0.22));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, shade(color, -0.22));
    g.beginPath();
    g.ellipse(0, 0, s * 0.26, s * 0.54, 0, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = Math.max(0.5, s * 0.045);
    g.strokeStyle = shade(color, -0.4);
    g.globalAlpha = 0.55;
    g.stroke();
    // 실 꼬임 결
    g.globalAlpha = 0.35;
    g.strokeStyle = shade(color, 0.5);
    g.lineWidth = Math.max(0.5, s * 0.06);
    g.beginPath();
    g.moveTo(-s * 0.08, -s * 0.34);
    g.quadraticCurveTo(s * 0.02, -s * 0.05, -s * 0.04, s * 0.3);
    g.stroke();
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
    board.pad = Math.ceil(cs * 1.5);
    const w = Math.ceil(game.cols * cs) + board.pad * 2;
    const h = Math.ceil(game.rows * cs) + board.pad * 2;
    board.canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    board.tmp = Object.assign(document.createElement('canvas'), { width: w, height: h });
  }
  if (board.version !== game.version) {
    board.version = game.version;
    const t = board.tmp.getContext('2d');
    t.clearRect(0, 0, board.tmp.width, board.tmp.height);
    const px = Math.max(2, Math.ceil(cs * 1.06));
    const off = (px - cs) / 2;
    // 고리 사이로 보이는 같은 색의 어두운 바탕 (천 느낌)
    for (let y = 0; y < game.rows; y++) {
      for (let x = 0; x < game.cols; x++) {
        const c = game.grid[y * game.cols + x];
        if (c < 0) continue;
        t.fillStyle = shade(game.colors[c], -0.55);
        t.fillRect(board.pad + x * cs - 0.5, board.pad + y * cs - 0.5, cs + 1, cs + 1);
      }
    }
    for (let y = 0; y < game.rows; y++) {
      for (let x = 0; x < game.cols; x++) {
        const c = game.grid[y * game.cols + x];
        if (c < 0) continue;
        t.drawImage(stitchSprite(game.colors[c], px), board.pad + x * cs - off, board.pad + y * cs - off);
      }
    }
    const g = board.canvas.getContext('2d');
    g.clearRect(0, 0, board.canvas.width, board.canvas.height);
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = cs * 0.9;
    g.shadowOffsetY = cs * 0.35;
    g.drawImage(board.tmp, 0, 0);
    g.restore();
  }
  return board;
}

// ── 실패(보빈) ─────────────────────────────────────────

/** 대기열·보관함의 3D 실패: 위 원판에 숫자, 가운데 실 감긴 허리, 아래 원판 */
function drawSpool(ctx, x, y, R, color, label, dim = 0) {
  const base = dim ? shade(color, -dim) : color;
  const c = (amt) => shade(base, amt);
  const ry = R * 0.6, th = R * 0.24;
  const ty = y - R * 0.5, by = y + R * 0.55;

  ctx.beginPath();
  ctx.ellipse(x, by + th + R * 0.14, R * 1.08, ry * 0.85, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fill();

  // 아래 원판
  ctx.fillStyle = c(-0.42);
  ctx.beginPath();
  ctx.ellipse(x, by + th, R, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - R, by, R * 2, th);
  ctx.fillStyle = c(-0.18);
  ctx.beginPath();
  ctx.ellipse(x, by, R, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // 허리 (실)
  const w = R * 0.64;
  const grad = ctx.createLinearGradient(x - w, 0, x + w, 0);
  grad.addColorStop(0, c(-0.45));
  grad.addColorStop(0.3, c(0.12));
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, c(-0.5));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.rect(x - w, ty, w * 2, by - ty);
  ctx.ellipse(x, by, w, ry * 0.64, 0, 0, Math.PI);
  ctx.fill();
  ctx.strokeStyle = c(-0.38);
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(1, R * 0.05);
  for (let i = 1; i <= 3; i++) {
    const yy = ty + ((by - ty) * i) / 4;
    ctx.beginPath();
    ctx.ellipse(x, yy, w, ry * 0.5, 0, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 위 원판
  ctx.fillStyle = c(-0.4);
  ctx.beginPath();
  ctx.ellipse(x, ty + th, R, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - R, ty, R * 2, th);
  const top = ctx.createRadialGradient(x - R * 0.35, ty - ry * 0.45, R * 0.1, x, ty, R * 1.1);
  top.addColorStop(0, c(0.38));
  top.addColorStop(0.55, base);
  top.addColorStop(1, c(-0.22));
  ctx.fillStyle = top;
  ctx.beginPath();
  ctx.ellipse(x, ty, R, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = Math.max(1, R * 0.05);
  ctx.beginPath();
  ctx.ellipse(x, ty, R * 0.94, ry * 0.92, 0, Math.PI * 1.05, Math.PI * 1.75);
  ctx.stroke();

  if (label !== undefined) {
    const text = String(label);
    const size = R * (text.length >= 3 ? 0.62 : 0.78);
    ctx.font = `900 ${size}px "Fredoka", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = R * 0.2;
    ctx.strokeStyle = 'rgba(30,20,20,0.7)';
    ctx.strokeText(text, x, ty + R * 0.03);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, ty + R * 0.03);
  }
}

/** 벨트 위에 누운 실패. fill(0~1)만큼 실이 두툼해진다 */
function drawBeltSpool(ctx, x, y, h, color, fill, label, alpha = 1) {
  const fw = h * 0.2, bodyW = h * 0.66;
  const bodyH = h * (0.4 + 0.42 * fill);
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.ellipse(x, y + h * 0.52, h * 0.6, h * 0.14, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  const yarn = ctx.createLinearGradient(0, y - bodyH / 2, 0, y + bodyH / 2);
  yarn.addColorStop(0, shade(color, 0.3));
  yarn.addColorStop(0.45, color);
  yarn.addColorStop(1, shade(color, -0.4));
  ctx.beginPath();
  ctx.roundRect(x - bodyW / 2, y - bodyH / 2, bodyW, bodyH, bodyH * 0.35);
  ctx.fillStyle = yarn;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = shade(color, -0.35);
  ctx.lineWidth = Math.max(1, h * 0.05);
  ctx.globalAlpha = alpha * 0.55;
  for (let i = -4; i <= 4; i++) {
    const xx = x + i * h * 0.12;
    ctx.beginPath();
    ctx.moveTo(xx - h * 0.12, y - bodyH / 2);
    ctx.lineTo(xx + h * 0.12, y + bodyH / 2);
    ctx.stroke();
  }
  ctx.restore();

  for (const side of [-1, 1]) {
    const fx = x + side * (bodyW / 2 + fw / 2);
    const g = ctx.createLinearGradient(fx - fw / 2, 0, fx + fw / 2, 0);
    g.addColorStop(0, shade(color, -0.45));
    g.addColorStop(0.4, shade(color, 0.1));
    g.addColorStop(1, shade(color, -0.5));
    ctx.beginPath();
    ctx.roundRect(fx - fw / 2, y - h / 2, fw, h, fw * 0.45);
    ctx.fillStyle = g;
    ctx.fill();
  }

  if (label !== undefined) {
    ctx.font = `900 ${h * 0.5}px "Fredoka", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = h * 0.13;
    ctx.strokeStyle = 'rgba(30,20,20,0.75)';
    ctx.strokeText(String(label), x, y - h * 0.68);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(label), x, y - h * 0.68);
  }
  ctx.restore();
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
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = tw * 0.6;
  ctx.shadowOffsetY = tw * 0.25;
  trackPath(ctx, game, X, Y, s);
  ctx.strokeStyle = '#cbbda8';
  ctx.lineWidth = tw;
  ctx.stroke();
  ctx.restore();

  const layers = [
    ['#efe6d6', 0.9],
    ['#3f3833', 0.64],
    ['#4a423c', 0.5],
  ];
  for (const [color, wf] of layers) {
    trackPath(ctx, game, X, Y, s);
    ctx.strokeStyle = color;
    ctx.lineWidth = tw * wf;
    ctx.stroke();
  }
  trackPath(ctx, game, X, Y, s);
  ctx.setLineDash([Math.max(1, tw * 0.06), tw * 0.85]);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = tw * 0.64;
  ctx.stroke();
  ctx.setLineDash([]);

  // 입구 양 끝의 노란 마개
  const L = X(-game.G), B = Y(game.rows + game.G), g = game.gap * s;
  const cap = (cx, cy, w, h) => {
    const grad = ctx.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
    grad.addColorStop(0, '#ffd45a');
    grad.addColorStop(1, '#e09a1c');
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, Math.min(w, h) * 0.35);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#a8700f';
    ctx.lineWidth = Math.max(1, tw * 0.05);
    ctx.stroke();
  };
  cap(L, B - g, tw * 1.12, tw * 0.4);
  cap(L + g, B, tw * 0.4, tw * 1.12);
  ctx.restore();
}

/** 입구 옆의 벨트 카운터 (손목시계 모양) */
function drawBadge(ctx, game, X, Y, s) {
  const { k } = game;
  const cx = X(-game.G - 0.45 * k), cy = Y(game.rows + game.G + 0.75 * k);
  const w = 1.3 * k * s, h = 0.9 * k * s;
  const full = game.beltCount >= game.beltCap;

  ctx.fillStyle = '#e3a524';
  ctx.beginPath();
  ctx.roundRect(cx - w * 0.28, cy - h * 0.85, w * 0.56, h * 1.7, w * 0.08);
  ctx.fill();

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = h * 0.3;
  ctx.shadowOffsetY = h * 0.12;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h * 0.28);
  ctx.fillStyle = '#1e2a52';
  ctx.fill();
  ctx.restore();

  const scr = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  scr.addColorStop(0, full ? '#ff6b6b' : '#4f8ff0');
  scr.addColorStop(1, full ? '#d33a3a' : '#2b62cf');
  ctx.beginPath();
  ctx.roundRect(cx - w / 2 + h * 0.1, cy - h / 2 + h * 0.1, w - h * 0.2, h * 0.8, h * 0.2);
  ctx.fillStyle = scr;
  ctx.fill();

  ctx.font = `900 ${h * 0.5}px "Fredoka", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(`${game.beltCount}/${game.beltCap}`, cx, cy + h * 0.03);
}

// ── 파티클 ─────────────────────────────────────────────

const particles = [];

export const fx = {
  /** 스티치가 뽑힐 때 실 보푸라기 */
  fluff(x, y, color) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 2;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0, life: 0, max: 0.35, color, r: 0.18, kind: 'dot' });
    }
  },
  /** 실패를 다 채웠을 때 반짝이 */
  burst(x, y, color, k) {
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, v = (2 + Math.random() * 4) * k;
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2 * k, g: 9 * k, life: 0, max: 0.6 + Math.random() * 0.3,
        color: i % 3 ? color : '#ffffff', r: (0.1 + Math.random() * 0.12) * k, kind: i % 2 ? 'star' : 'dot',
      });
    }
  },
  /** 완성 축하 꽃가루 */
  confetti(game, colors) {
    const { k } = game;
    for (let i = 0; i < 140; i++) {
      particles.push({
        x: Math.random() * game.cols, y: -game.G - Math.random() * 6 * k,
        vx: (Math.random() - 0.5) * 4 * k, vy: Math.random() * 3 * k, g: 6 * k,
        life: 0, max: 2.2 + Math.random(), color: colors[i % colors.length],
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
    ctx.strokeStyle = shade(game.colors[f.color], -0.15);
    ctx.lineWidth = Math.max(1.2, s * 0.16);
    ctx.lineCap = 'round';
    ctx.stroke();
    const size = s * (1.1 - t * 0.6);
    ctx.drawImage(stitchSprite(game.colors[f.color], flyPx), X(px) - size / 2, Y(py) - size / 2, size, size);
  }

  drawBadge(ctx, game, X, Y, s);

  // 보관함
  const sw = game.slotW * s;
  game.slots.forEach((_, i) => {
    const p = game.slotPos(i);
    ctx.beginPath();
    ctx.roundRect(X(p.x) - sw / 2, Y(p.y) - sw * 0.5, sw, sw, sw * 0.16);
    ctx.fillStyle = 'rgba(20,16,14,0.45)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
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
      drawSpool(ctx, X(b.x + wobble(b)), Y(b.y), park, game.colors[b.color], b.remaining, row * 0.05);
    }
    if (q.length > 3) {
      const p = game.supplyPos(qi, 2);
      ctx.font = `700 ${Math.round(park * 0.6)}px "Fredoka", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(`+${q.length - 3}`, X(p.x), Y(p.y) + park * 1.85);
    }
  });

  // 벨트 위 실패 (대기열에서 벨트로 옮겨 가는 동안은 3D 실패 모양 유지)
  const bh = game.trackW * 1.1 * s;
  for (const b of game.launchQueue) {
    drawSpool(ctx, X(b.x), Y(b.y), park * (1 - b.tween * 0.35), game.colors[b.color], b.remaining);
  }
  for (const b of game.belt) {
    const fill = 1 - b.remaining / b.total;
    if (b.tween < 0.5) {
      drawSpool(ctx, X(b.x), Y(b.y), park * 0.65, game.colors[b.color], b.remaining);
    } else {
      drawBeltSpool(ctx, X(b.x), Y(b.y), bh, game.colors[b.color], fill, b.remaining);
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
    ctx.strokeStyle = '#ff5a5a';
    ctx.lineWidth = Math.max(2, 0.1 * k * s);
    ctx.stroke();
  }

  drawParticles(ctx, dt, X, Y, s);
}
