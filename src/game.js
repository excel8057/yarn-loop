import { PALETTE } from './art.js';
import { mulberry32, shuffle } from './rng.js';

// 월드 좌표 단위 = 스티치 한 칸. 보드는 (0,0)~(cols,rows)에 놓인다.
// 벨트·보빈·보관함 같은 나머지 요소는 그림 크기에 비례하는 배율 k 로 키운다.
const FLY_TIME = 0.32;
const TWEEN_TIME = 0.28;
const LAP_TIME = 6; // 벨트 한 바퀴 시간(초)

/**
 * @typedef {'supply'|'queued'|'belt'|'slot'|'done'} BobbinState
 * @typedef {object} Bobbin
 * @property {number} id
 * @property {number} color
 * @property {number} total      처음 감아야 했던 스티치 수
 * @property {number} remaining  아직 감아야 할 스티치 수
 * @property {BobbinState} state
 * @property {number} queue      대기열 번호 (supply 상태일 때)
 * @property {number} traveled   벨트 위에서 이동한 거리
 * @property {number} x
 * @property {number} y
 * @property {number} fromX
 * @property {number} fromY
 * @property {number} tween      0→1 위치 보간 진행도
 * @property {number} inflight   날아오는 중인 스티치 수
 * @property {number} pop
 * @property {number} shake
 */

const easeOut = (t) => 1 - (1 - t) ** 3;

/** 위아래·양옆의 빈 줄을 잘라낸다 */
function trim(art) {
  const rows = art.map((r) => r.replace(/[^.]/g, '#'));
  const filledRow = (r) => r.includes('#');
  let top = 0, bottom = rows.length - 1;
  while (top < bottom && !filledRow(rows[top])) top++;
  while (bottom > top && !filledRow(rows[bottom])) bottom--;
  const kept = art.slice(top, bottom + 1);
  const w = Math.max(...kept.map((r) => r.length));
  const colFilled = (x) => kept.some((r) => (r[x] ?? '.') !== '.');
  let left = 0, right = w - 1;
  while (left < right && !colFilled(left)) left++;
  while (right > left && !colFilled(right)) right--;
  return kept.map((r) => r.padEnd(w, '.').slice(left, right + 1));
}

export class Game {
  /** @param {import('./levels.js').LevelDef} def */
  constructor(def, seed) {
    const art = trim(def.art);
    this.rows = art.length;
    this.cols = art[0].length;
    this.grid = new Array(this.cols * this.rows).fill(-1);
    const chars = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const ch = art[y][x];
        if (!PALETTE[ch]) continue;
        if (!chars.includes(ch)) chars.push(ch);
        this.grid[y * this.cols + x] = chars.indexOf(ch);
      }
    }
    this.colors = chars.map((c) => PALETTE[c]);
    this.totalStitches = this.grid.filter((c) => c >= 0).length;
    this.remainingStitches = this.totalStitches;
    this.version = 0; // 그리드가 바뀔 때마다 증가 (렌더러 캐시용)

    // 레이아웃 배율: 그림이 클수록 벨트와 보빈도 같은 비율로 커진다
    const k = Math.max(this.cols, this.rows) / 12;
    this.k = k;
    this.G = 1.25 * k; // 보드 가장자리에서 벨트 중심선까지
    this.trackW = 1.05 * k; // 벨트 폭 (레일 포함)
    this.gap = 1.35 * k; // 왼쪽 아래 입구 크기
    this.spacing = 1.3 * k;
    // 실패 5개가 벨트 바깥 폭을 거의 채우도록 아래쪽 요소는 벨트 폭 기준으로 잡는다
    const unit = (this.cols + 2 * this.G + this.trackW) / 5.3;
    this.colGap = unit;
    this.parkR = unit * 0.37;
    this.rowGap = unit * 0.92;
    this.slotW = unit * 0.8;
    this.slotGap = unit * 0.2;

    /** @type {Bobbin[][]} */ this.queues = [];
    /** @type {(Bobbin|null)[]} */ this.slots = new Array(def.slots).fill(null);
    /** @type {Bobbin[]} */ this.belt = [];
    /** @type {Bobbin[]} */ this.launchQueue = [];
    /** @type {Bobbin[]} */ this.popping = [];
    this.flies = [];
    this.beltCap = def.belt;
    /** @type {'playing'|'won'|'lost'} */ this.status = 'playing';
    this.usedRescue = false;
    this.stranded = null;
    /** UI/사운드/파티클이 소비하는 이벤트: { type, x, y, color } */ this.events = [];
    this.winTimer = 0;

    this.buildTrack();
    this.speed = Math.max(7.5, this.perimeter / LAP_TIME);
    this.buildBobbins(def, mulberry32(seed));
    for (const b of this.allBobbins()) {
      const p = this.targetOf(b);
      b.x = b.fromX = p.x;
      b.y = b.fromY = p.y;
    }
  }

  emit(type, x = 0, y = 0, color = -1) {
    this.events.push({ type, x, y, color });
  }

  // ── 벨트 ────────────────────────────────────────────

  /** 벨트는 왼쪽 아래 모서리(입구)에서 출발해 시계 방향으로 한 바퀴 돈다 */
  buildTrack() {
    const { cols: C, rows: R, G } = this;
    const L1 = R + 2 * G, L2 = C + 2 * G, L3 = R + 2 * G;
    this.sides = [L1, L2, L3];
    this.perimeter = 2 * (L1 + L2);
    // 체크포인트: 보빈이 각 행/열 정면을 지날 때 그 줄의 맨 앞 스티치를 확인한다
    const cps = [];
    for (let r = 0; r < R; r++) cps.push({ d: R + G - (r + 0.5), sx: 0, sy: r, dx: 1, dy: 0 });
    for (let c = 0; c < C; c++) cps.push({ d: L1 + c + 0.5 + G, sx: c, sy: 0, dx: 0, dy: 1 });
    for (let r = 0; r < R; r++) cps.push({ d: L1 + L2 + r + 0.5 + G, sx: C - 1, sy: r, dx: -1, dy: 0 });
    for (let c = 0; c < C; c++) cps.push({ d: L1 + L2 + L3 + C + G - (c + 0.5), sx: c, sy: R - 1, dx: 0, dy: -1 });
    this.checkpoints = cps.sort((a, b) => a.d - b.d);
  }

  trackPos(d) {
    const { cols: C, rows: R, perimeter: P, G } = this;
    const [L1, L2, L3] = this.sides;
    d = ((d % P) + P) % P;
    if (d < L1) return { x: -G, y: R + G - d };
    d -= L1;
    if (d < L2) return { x: -G + d, y: -G };
    d -= L2;
    if (d < L3) return { x: C + G, y: -G + d };
    d -= L3;
    return { x: C + G - d, y: R + G };
  }

  // ── 보빈 생성 ───────────────────────────────────────

  /** 바깥에서 쉽게 닿는 스티치를 감는 보빈일수록 대기열 앞쪽에 오도록 배치한다 */
  buildBobbins(def, rng) {
    const { cols: C, rows: R, grid } = this;
    const depth = (x, y) => {
      let best = Infinity;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let n = 0;
        for (let cx = x + dx, cy = y + dy; cx >= 0 && cx < C && cy >= 0 && cy < R; cx += dx, cy += dy) {
          if (grid[cy * C + cx] >= 0) n++;
        }
        best = Math.min(best, n);
      }
      return best;
    };

    const byColor = this.colors.map(() => []);
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < C; x++) {
        const c = grid[y * C + x];
        if (c >= 0) byColor[c].push(depth(x, y));
      }
    }

    const avg = Math.max(3, Math.round(this.totalStitches / def.bobbins));
    const maxDepth = Math.max(1, ...byColor.flat());
    const chunks = [];
    byColor.forEach((depths, color) => {
      depths.sort((a, b) => a - b);
      for (let k = 0; k < depths.length;) {
        let size = Math.max(2, Math.round(avg * (0.45 + rng() * 1.1)));
        if (depths.length - k - size < Math.max(2, avg * 0.3)) size = depths.length - k; // 자투리는 마지막 보빈에 합친다
        const part = depths.slice(k, k + size);
        const mean = part.reduce((s, d) => s + d, 0) / part.length / maxDepth;
        chunks.push({ color, size, pri: mean + rng() * (0.25 + (def.mix ?? 0) * 0.75) });
        k += size;
      }
    });
    chunks.sort((a, b) => a.pri - b.pri);

    // 시작하자마자 막히지 않도록 맨 앞줄에 바깥에서 보이는 색 보빈을 최소 2개 둔다
    const nq = def.queues;
    const exposed = this.exposedColors();
    let need = 2 - chunks.slice(0, nq).filter((c) => exposed.has(c.color)).length;
    for (let j = nq - 1; j >= 0 && need > 0; j--) {
      if (exposed.has(chunks[j].color)) continue;
      const k = chunks.findIndex((c, i) => i >= nq && exposed.has(c.color));
      if (k < 0) break;
      [chunks[j], chunks[k]] = [chunks[k], chunks[j]];
      need--;
    }

    let id = 0;
    this.queues = Array.from({ length: nq }, () => []);
    for (let i = 0; i < chunks.length; i += nq) {
      const order = shuffle([...Array(nq).keys()], rng);
      for (let j = 0; j < nq && i + j < chunks.length; j++) {
        const { color, size } = chunks[i + j];
        const q = order[j];
        this.queues[q].push({
          id: id++, color, total: size, remaining: size, state: 'supply', queue: q,
          traveled: 0, x: 0, y: 0, fromX: 0, fromY: 0, tween: 1,
          inflight: 0, pop: 0, shake: 0,
        });
      }
    }
  }

  /** 벨트에서 지금 바로 감을 수 있는(각 줄의 맨 앞) 스티치 색들 */
  exposedColors() {
    const { cols: C, rows: R, grid } = this;
    const set = new Set();
    for (const cp of this.checkpoints) {
      for (let x = cp.sx, y = cp.sy; x >= 0 && x < C && y >= 0 && y < R; x += cp.dx, y += cp.dy) {
        if (grid[y * C + x] >= 0) {
          set.add(grid[y * C + x]);
          break;
        }
      }
    }
    return set;
  }

  // ── 레이아웃 ────────────────────────────────────────

  get slotsY() { return this.rows + this.G + 1.5 * this.k + this.slotW / 2; }
  get supplyY() { return this.slotsY + this.slotW / 2 + this.parkR * 1.35; }

  slotPos(i) {
    const n = this.slots.length;
    const total = n * this.slotW + (n - 1) * this.slotGap;
    return { x: this.cols / 2 - total / 2 + this.slotW / 2 + i * (this.slotW + this.slotGap), y: this.slotsY };
  }

  supplyPos(q, row) {
    const x0 = this.cols / 2 - ((this.queues.length - 1) * this.colGap) / 2;
    return { x: x0 + q * this.colGap, y: this.supplyY + row * this.rowGap };
  }

  bounds() {
    const { k } = this;
    const n = this.slots.length;
    const half = Math.max(
      this.cols / 2 + this.G + 1.2 * k, // 왼쪽 아래 벨트 카운터까지 들어오도록
      (n * this.slotW + (n - 1) * this.slotGap) / 2 + 0.3 * k,
      ((this.queues.length - 1) * this.colGap) / 2 + this.parkR * 1.15,
    );
    return {
      minX: this.cols / 2 - half,
      maxX: this.cols / 2 + half,
      minY: -this.G - this.trackW / 2 - 0.6 * k, // 흰 카드와 그림자까지
      maxY: this.supplyY + 2 * this.rowGap + this.parkR * 2.2, // "+n" 표시 자리 포함
    };
  }

  targetOf(b) {
    switch (b.state) {
      case 'supply': return this.supplyPos(b.queue, this.queues[b.queue].indexOf(b));
      case 'slot': return this.slotPos(this.slots.indexOf(b));
      case 'queued': return this.trackPos(0);
      case 'belt': return this.trackPos(b.traveled);
      default: return { x: b.x, y: b.y };
    }
  }

  setState(b, state) {
    b.fromX = b.x;
    b.fromY = b.y;
    b.tween = 0;
    b.state = state;
  }

  *allBobbins() {
    for (const q of this.queues) yield* q;
    for (const s of this.slots) if (s) yield s;
    yield* this.launchQueue;
    yield* this.belt;
  }

  get beltCount() { return this.belt.length + this.launchQueue.length; }

  // ── 입력 ────────────────────────────────────────────

  tap(wx, wy) {
    if (this.status !== 'playing') return;
    const r = this.parkR;
    const hit = (b) => b && Math.abs(wx - b.x) < r * 1.3 && wy > b.y - r * 1.6 && wy < b.y + r * 1.2;

    for (const q of this.queues) {
      if (hit(q[0])) return this.tryLaunch(q[0], () => {
        q.shift();
        for (const o of q) this.setState(o, 'supply'); // 뒤 보빈들이 앞으로 당겨진다
      });
    }
    this.slots.forEach((b, i) => {
      if (hit(b)) this.tryLaunch(b, () => { this.slots[i] = null; });
    });
  }

  tryLaunch(b, detach) {
    if (this.beltCount >= this.beltCap) {
      b.shake = 0.35;
      this.emit('full', b.x, b.y);
      return;
    }
    detach();
    this.setState(b, 'queued');
    this.launchQueue.push(b);
    this.emit('launch', b.x, b.y, b.color);
  }

  /** 게임오버 시 1회: 보관함을 한 칸 늘리고 이어서 진행 */
  rescue() {
    if (this.status !== 'lost' || this.usedRescue || !this.stranded) return;
    this.usedRescue = true;
    this.slots.push(null);
    this.belt.splice(this.belt.indexOf(this.stranded), 1);
    this.slots[this.slots.length - 1] = this.stranded;
    this.setState(this.stranded, 'slot');
    this.stranded = null;
    this.status = 'playing';
  }

  // ── 진행 ────────────────────────────────────────────

  update(dt) {
    if (this.status === 'playing') this.step(dt);

    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i];
      f.t += dt / FLY_TIME;
      if (f.t >= 1) {
        f.target.inflight--;
        this.flies.splice(i, 1);
      }
    }
    for (let i = this.popping.length - 1; i >= 0; i--) {
      this.popping[i].pop += dt / 0.45;
      if (this.popping[i].pop >= 1) this.popping.splice(i, 1);
    }
    for (const b of this.allBobbins()) {
      b.shake = Math.max(0, b.shake - dt);
      b.tween = Math.min(1, b.tween + dt / TWEEN_TIME);
      const t = this.targetOf(b);
      const e = easeOut(b.tween);
      b.x = b.fromX + (t.x - b.fromX) * e;
      b.y = b.fromY + (t.y - b.fromY) * e;
    }

    if (this.status === 'playing' && this.remainingStitches === 0 && this.flies.length === 0) {
      this.winTimer += dt;
      if (this.winTimer > 0.6) {
        this.status = 'won';
        this.emit('win');
      }
    }
  }

  step(dt) {
    while (this.launchQueue.length && this.belt.every((b) => b.traveled >= this.spacing)) {
      const b = this.launchQueue.shift();
      b.traveled = 0;
      this.setState(b, 'belt');
      this.belt.push(b);
    }

    for (const b of [...this.belt]) {
      const old = b.traveled;
      b.traveled += this.speed * dt;
      if (b.remaining > 0) {
        for (const cp of this.checkpoints) {
          if (cp.d > old && cp.d <= b.traveled) this.fire(b, cp);
        }
      }
      if (b.remaining === 0 && b.inflight === 0) {
        this.belt.splice(this.belt.indexOf(b), 1);
        b.state = 'done';
        b.pop = 0;
        this.popping.push(b);
        this.emit('done', b.x, b.y, b.color);
      } else if (b.remaining > 0 && b.traveled >= this.perimeter) {
        this.park(b);
        if (this.status !== 'playing') return;
      }
    }
  }

  /** 체크포인트 줄을 따라 첫 번째 스티치를 찾고, 색이 같으면 감아온다 */
  fire(b, cp) {
    const { cols: C, rows: R, grid } = this;
    for (let x = cp.sx, y = cp.sy; x >= 0 && x < C && y >= 0 && y < R; x += cp.dx, y += cp.dy) {
      const i = y * C + x;
      if (grid[i] < 0) continue;
      if (grid[i] === b.color && b.remaining > 0) {
        grid[i] = -1;
        this.version++;
        this.remainingStitches--;
        b.remaining--;
        b.inflight++;
        this.flies.push({ color: b.color, sx: x + 0.5, sy: y + 0.5, target: b, t: 0 });
        this.emit('hit', x + 0.5, y + 0.5, b.color);
      }
      return;
    }
  }

  /** 한 바퀴를 다 돌았는데 덜 감았으면 보관함으로. 보관함이 꽉 차 있으면 실패 */
  park(b) {
    const idx = this.slots.indexOf(null);
    if (idx < 0) {
      this.status = 'lost';
      this.stranded = b;
      this.emit('lose', b.x, b.y);
      return;
    }
    this.belt.splice(this.belt.indexOf(b), 1);
    this.slots[idx] = b;
    this.setState(b, 'slot');
    this.emit('park', b.x, b.y, b.color);
  }
}
