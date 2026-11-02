import { G, BELT_R, PARK_R, SLOT_W } from './game.js';

const WOOD = '#c8925a';
const WOOD_DARK = '#8a5a33';

/** 색을 밝게(+) 또는 어둡게(-) */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

/** 월드 영역 전체가 화면에 들어오도록 배율과 오프셋을 정한다 */
export function computeView(game, w, h, top) {
  const b = game.bounds();
  const ww = b.maxX - b.minX, wh = b.maxY - b.minY;
  const availW = w - 24, availH = h - top - 12;
  const s = Math.min(availW / ww, availH / wh, 56);
  return {
    s,
    ox: (w - ww * s) / 2 - b.minX * s,
    oy: top + (availH - wh * s) / 2 - b.minY * s,
  };
}

/** 니트 스티치 한 칸: V자 모양의 두 고리 */
function drawStitch(ctx, x, y, s, color) {
  const dark = shade(color, -0.28);
  const light = shade(color, 0.35);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(x + s * (0.5 + side * 0.19), y + s * 0.5);
    ctx.rotate(side * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.18, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.strokeStyle = dark;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-s * 0.04, -s * 0.1, s * 0.05, s * 0.2, 0, 0, Math.PI * 2);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = light;
    ctx.fill();
    ctx.restore();
  }
}

/** 실이 감긴 나무 실패(보빈) */
function drawBobbin(ctx, cx, cy, r, color, n, alpha = 1) {
  const capW = r * 1.6, capH = r * 0.34;
  const bodyW = r * 1.2, bodyH = r * 1.4;
  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.beginPath();
  ctx.ellipse(cx, cy + bodyH / 2 + capH * 0.9, capW * 0.5, r * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(80,50,30,0.15)';
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH, r * 0.18);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = shade(color, -0.25);
  ctx.lineWidth = Math.max(1, r * 0.07);
  for (let i = -3; i <= 3; i++) {
    const yy = cy + (i * bodyH) / 7;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW / 2, yy - r * 0.12);
    ctx.quadraticCurveTo(cx, yy + r * 0.12, cx + bodyW / 2, yy - r * 0.12);
    ctx.stroke();
  }
  ctx.fillStyle = shade(color, 0.4);
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillRect(cx - bodyW / 2 + r * 0.14, cy - bodyH / 2, r * 0.16, bodyH);
  ctx.restore();

  ctx.fillStyle = WOOD;
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = Math.max(1, r * 0.07);
  for (const yy of [cy - bodyH / 2 - capH * 0.7, cy + bodyH / 2 - capH * 0.3]) {
    ctx.beginPath();
    ctx.roundRect(cx - capW / 2, yy, capW, capH, capH * 0.45);
    ctx.fill();
    ctx.stroke();
  }

  ctx.font = `800 ${Math.round(r * 0.95)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.22;
  ctx.strokeStyle = 'rgba(60,40,30,0.85)';
  ctx.strokeText(String(n), cx, cy + r * 0.04);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(n), cx, cy + r * 0.04);
  ctx.restore();
}

export function draw(ctx, game, view, time) {
  const { s, ox, oy } = view;
  const X = (wx) => ox + wx * s;
  const Y = (wy) => oy + wy * s;
  const { cols: C, rows: R } = game;

  // 천 바탕
  ctx.beginPath();
  ctx.roundRect(X(-0.25), Y(-0.25), (C + 0.5) * s, (R + 0.5) * s, s * 0.4);
  ctx.fillStyle = '#fffaf1';
  ctx.fill();
  ctx.strokeStyle = '#e8dcc6';
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.setLineDash([s * 0.18, s * 0.14]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#eadfcb';
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < C; x++) {
      const c = game.grid[y * C + x];
      if (c >= 0) drawStitch(ctx, X(x), Y(y), s, game.colors[c]);
      else ctx.fillRect(X(x + 0.5) - s * 0.05, Y(y + 0.5) - s * 0.05, s * 0.1, s * 0.1);
    }
  }

  // 컨베이어 벨트
  const bx = X(-G), by = Y(-G), bw = (C + 2 * G) * s, bh = (R + 2 * G) * s;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, s * 0.35);
  ctx.strokeStyle = '#dcc7a6';
  ctx.lineWidth = s * 0.95;
  ctx.stroke();
  ctx.strokeStyle = '#cfb894';
  ctx.lineWidth = Math.max(1, s * 0.06);
  ctx.setLineDash([s * 0.25, s * 0.35]);
  ctx.lineDashOffset = -time * 7.5 * s;
  ctx.stroke();
  ctx.setLineDash([]);

  // 출발 지점 표시
  ctx.save();
  ctx.translate(X(-G), Y(R + G));
  ctx.fillStyle = '#b8946a';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.lineTo(-s * 0.22, -s * 0.25);
  ctx.lineTo(s * 0.22, -s * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 날아가는 스티치와 실
  for (const f of game.flies) {
    const t = f.t;
    const tx = f.target.x, ty = f.target.y;
    const mx = (f.sx + tx) / 2, my = Math.min(f.sy, ty) - 1.2;
    const px = (1 - t) ** 2 * f.sx + 2 * (1 - t) * t * mx + t * t * tx;
    const py = (1 - t) ** 2 * f.sy + 2 * (1 - t) * t * my + t * t * ty;
    ctx.beginPath();
    ctx.moveTo(X(tx), Y(ty));
    ctx.quadraticCurveTo(X(mx), Y(my), X(px), Y(py));
    ctx.strokeStyle = game.colors[f.color];
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.stroke();
    const k = 1 - t * 0.6;
    drawStitch(ctx, X(px) - (s * k) / 2, Y(py) - (s * k) / 2, s * k, game.colors[f.color]);
  }

  // 보관함
  game.slots.forEach((b, i) => {
    const p = game.slotPos(i);
    ctx.beginPath();
    ctx.roundRect(X(p.x - SLOT_W / 2), Y(p.y - 0.8), SLOT_W * s, 1.6 * s, s * 0.3);
    ctx.fillStyle = '#efe3cf';
    ctx.fill();
    ctx.strokeStyle = '#d8c4a4';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.setLineDash([s * 0.14, s * 0.1]);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  const wobble = (b) => (b.shake > 0 ? Math.sin(b.shake * 60) * 0.12 * (b.shake / 0.35) : 0);

  for (const b of game.slots) {
    if (b) drawBobbin(ctx, X(b.x + wobble(b)), Y(b.y), PARK_R * s, game.colors[b.color], b.remaining);
  }

  // 대기열: 맨 앞만 선택 가능, 뒤쪽은 흐리게
  game.queues.forEach((q, qi) => {
    for (let row = Math.min(q.length, 3) - 1; row >= 0; row--) {
      const b = q[row];
      const scale = [1, 0.82, 0.7][row];
      const alpha = [1, 0.6, 0.35][row];
      drawBobbin(ctx, X(b.x + wobble(b)), Y(b.y), PARK_R * s * scale, game.colors[b.color], b.remaining, alpha);
    }
    if (q.length > 3) {
      const p = game.supplyPos(qi, 2);
      ctx.font = `700 ${Math.round(s * 0.42)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#a08a70';
      ctx.fillText(`+${q.length - 3}`, X(p.x), Y(p.y + 1.05));
    }
  });

  // 벨트 위 보빈 (보관함/대기열에서 벨트로 이동 중일 때는 크기를 서서히 줄인다)
  for (const b of [...game.launchQueue, ...game.belt]) {
    const r = PARK_R + (BELT_R - PARK_R) * Math.min(1, b.state === 'belt' ? 1 : b.tween);
    drawBobbin(ctx, X(b.x), Y(b.y), r * s, game.colors[b.color], b.remaining);
  }

  for (const b of game.popping) {
    const t = b.pop;
    const r = BELT_R * s * (1 + t * 0.6);
    drawBobbin(ctx, X(b.x), Y(b.y), r, game.colors[b.color], '✓', 1 - t);
  }

  if (game.status === 'lost' && game.stranded) {
    const b = game.stranded;
    ctx.beginPath();
    ctx.arc(X(b.x), Y(b.y), s * (0.75 + Math.sin(time * 8) * 0.08), 0, Math.PI * 2);
    ctx.strokeStyle = '#e5484d';
    ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.stroke();
  }
}
