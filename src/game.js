import { PALETTE } from './levels.js';
import { mulberry32, shuffle } from './rng.js';

// 월드 좌표 단위 = 스티치 한 칸. 보드는 (0,0)~(cols,rows)에 놓인다.
export const G = 0.95; // 보드 가장자리에서 벨트 중심선까지 거리
export const BELT_R = 0.42; // 벨트 위 보빈 크기
export const PARK_R = 0.6; // 대기열/보관함 보빈 크기
export const SLOT_W = 1.5;
const SLOT_GAP = 0.3;
const COL_GAP = 2.0;
const ROW_GAP = 1.7;
const SPEED = 7.5; // 벨트 속도 (칸/초)
const SPACING = 1.25; // 벨트 위 보빈 최소 간격
const FLY_TIME = 0.3;
const TWEEN_TIME = 0.28;

/**
 * @typedef {'supply'|'queued'|'belt'|'slot'|'done'} BobbinState
 * @typedef {object} Bobbin
 * @property {number} id
 * @property {number} color
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

export class Game {
  /** @param {import('./levels.js').LevelDef} def */
  constructor(def, seed) {
    this.rows = def.art.length;
    this.cols = Math.max(...def.art.map((r) => r.length));
    this.grid = new Array(this.cols * this.rows).fill(-1);
    const chars = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const ch = def.art[y][x] ?? '.';
        if (!PALETTE[ch]) continue;
        if (!chars.includes(ch)) chars.push(ch);
        this.grid[y * this.cols + x] = chars.indexOf(ch);
      }
    }
    this.colors = chars.map((c) => PALETTE[c]);
    this.totalStitches = this.grid.filter((c) => c >= 0).length;
    this.remainingStitches = this.totalStitches;

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
    /** @type {string[]} UI/사운드가 소비하는 이벤트 */ this.events = [];
    this.winTimer = 0;

    this.buildTrack();
    this.buildBobbins(def, mulberry32(seed));
    for (const b of this.allBobbins()) {
      const p = this.targetOf(b);
      b.x = b.fromX = p.x;
      b.y = b.fromY = p.y;
    }
  }

  // ── 벨트 ────────────────────────────────────────────

  /** 벨트는 왼쪽 아래 모서리에서 출발해 시계 방향으로 한 바퀴 돈다 */
  buildTrack() {
    const { cols: C, rows: R } = this;
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
    const { cols: C, rows: R, perimeter: P } = this;
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

    const chunks = [];
    byColor.forEach((depths, color) => {
      depths.sort((a, b) => a - b);
      for (let k = 0; k < depths.length;) {
        let size = Math.max(2, def.cap + Math.floor(rng() * 3) - 1);
        if (depths.length - k - size < 2) size = depths.length - k; // 자투리는 마지막 보빈에 합친다
        const part = depths.slice(k, k + size);
        const mean = part.reduce((s, d) => s + d, 0) / part.length;
        chunks.push({ color, size, pri: mean + rng() * (1.4 + (def.mix ?? 0) * 12) });
        k += size;
      }
    });
    chunks.sort((a, b) => a.pri - b.pri);

    let id = 0;
    const nq = def.queues;
    this.queues = Array.from({ length: nq }, () => []);
    for (let i = 0; i < chunks.length; i += nq) {
      const order = shuffle([...Array(nq).keys()], rng);
      for (let j = 0; j < nq && i + j < chunks.length; j++) {
        const { color, size } = chunks[i + j];
        const q = order[j];
        this.queues[q].push({
          id: id++, color, remaining: size, state: 'supply', queue: q,
          traveled: 0, x: 0, y: 0, fromX: 0, fromY: 0, tween: 1,
          inflight: 0, pop: 0, shake: 0,
        });
      }
    }
  }

  // ── 레이아웃 ────────────────────────────────────────

  get slotsY() { return this.rows + G + 1.9; }
  get supplyY() { return this.slotsY + 2.1; }

  slotPos(i) {
    const n = this.slots.length;
    const total = n * SLOT_W + (n - 1) * SLOT_GAP;
    return { x: this.cols / 2 - total / 2 + SLOT_W / 2 + i * (SLOT_W + SLOT_GAP), y: this.slotsY };
  }

  supplyPos(q, row) {
    const x0 = this.cols / 2 - ((this.queues.length - 1) * COL_GAP) / 2;
    return { x: x0 + q * COL_GAP, y: this.supplyY + row * ROW_GAP };
  }

  bounds() {
    const n = this.slots.length;
    const half = Math.max(
      this.cols / 2 + G + 0.7,
      (n * SLOT_W + (n - 1) * SLOT_GAP) / 2 + 0.3,
      ((this.queues.length - 1) * COL_GAP) / 2 + 0.9,
    );
    return {
      minX: this.cols / 2 - half,
      maxX: this.cols / 2 + half,
      minY: -G - 0.7,
      maxY: this.supplyY + 2 * ROW_GAP + 0.9,
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

  // ── 입력 ────────────────────────────────────────────

  tap(wx, wy) {
    if (this.status !== 'playing') return;
    const hit = (b) => b && Math.abs(wx - b.x) < 0.8 && Math.abs(wy - b.y) < 0.9;

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
    if (this.belt.length + this.launchQueue.length >= this.beltCap) {
      b.shake = 0.35;
      this.events.push('full');
      return;
    }
    detach();
    this.setState(b, 'queued');
    this.launchQueue.push(b);
    this.events.push('launch');
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
      this.popping[i].pop += dt / 0.35;
      if (this.popping[i].pop >= 1) this.popping.splice(i, 1);
    }
    for (const b of this.allBobbins()) {
      b.shake = Math.max(0, b.shake - dt);
      b.tween = Math.min(1, b.tween + dt / TWEEN_TIME);
      const t = this.targetOf(b);
      const k = easeOut(b.tween);
      b.x = b.fromX + (t.x - b.fromX) * k;
      b.y = b.fromY + (t.y - b.fromY) * k;
    }

    if (this.status === 'playing' && this.remainingStitches === 0 && this.flies.length === 0) {
      this.winTimer += dt;
      if (this.winTimer > 0.5) {
        this.status = 'won';
        this.events.push('win');
      }
    }
  }

  step(dt) {
    while (this.launchQueue.length && this.belt.every((b) => b.traveled >= SPACING)) {
      const b = this.launchQueue.shift();
      b.traveled = 0;
      this.setState(b, 'belt');
      this.belt.push(b);
    }

    for (const b of [...this.belt]) {
      const old = b.traveled;
      b.traveled += SPEED * dt;
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
        this.events.push('done');
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
        this.remainingStitches--;
        b.remaining--;
        b.inflight++;
        this.flies.push({ color: b.color, sx: x + 0.5, sy: y + 0.5, target: b, t: 0 });
        this.events.push('hit');
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
      this.events.push('lose');
      return;
    }
    this.belt.splice(this.belt.indexOf(b), 1);
    this.slots[idx] = b;
    this.setState(b, 'slot');
    this.events.push('park');
  }
}
