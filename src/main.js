import { Game } from './game.js';
import { getLevel, TOTAL_LEVELS } from './levels.js';
import { isHardLevel } from './generator.js';
import { computeView, draw, fx } from './render.js';
import { unlock, sfx, setMuted, isMuted } from './audio.js';
import { cloud, initCloud, signIn, signOut, loadProgress, saveProgress } from './cloud.js';

const $ = (id) => document.getElementById(id);
const canvas = $('cv');
const ctx = canvas.getContext('2d');
const hud = $('hud');
const overlay = $('overlay');

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`yarnloop.${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`yarnloop.${key}`, JSON.stringify(value));
    } catch { /* 저장 불가 환경에서는 진행도만 유지 안 됨 */ }
  },
};

let unlocked = store.get('unlocked', 0);
// ?level=N 으로 특정 레벨을 바로 열 수 있다. 잠금을 건너뛰는 테스트용이라 로컬에서만 받는다
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const levelParam = isLocal ? Number(new URLSearchParams(location.search).get('level')) : 0;
let levelIndex = levelParam > 0 ? Math.min(levelParam, TOTAL_LEVELS) - 1 : Math.min(store.get('current', 0), unlocked);
let game;
let view;
let toastTimer = 0;
setMuted(store.get('muted', false));

function startLevel(i) {
  levelIndex = i;
  store.set('current', i);
  syncCloud();
  game = new Game(getLevel(i), i + 1);
  fx.clear();
  $('lv-label').innerHTML = `Lv.${i + 1}<small> / ${TOTAL_LEVELS}</small>`;
  $('lv-name').textContent = getLevel(i).name;
  hideOverlay();
  resize();
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (game) view = computeView(game, w, h, hud.offsetHeight + 4, dpr);
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1200);
}

function showOverlay(html, actions) {
  overlay.querySelector('.card').innerHTML = html;
  const row = document.createElement('div');
  row.className = 'actions';
  for (const [label, fn, primary] of actions) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.className = primary ? 'btn primary' : 'btn';
    btn.addEventListener('click', fn);
    row.appendChild(btn);
  }
  overlay.querySelector('.card').appendChild(row);
  overlay.hidden = false;
}

function hideOverlay() { overlay.hidden = true; }

function showWin() {
  if (levelIndex + 1 > unlocked) {
    unlocked = levelIndex + 1;
    store.set('unlocked', unlocked);
    syncCloud();
  }
  if (levelIndex + 1 >= TOTAL_LEVELS) {
    showOverlay(
      `<div class="emoji">🏆</div><h2>모든 스테이지 완료!</h2><p>${TOTAL_LEVELS}개의 뜨개질을 전부 끝냈어요.</p>`,
      [['레벨 선택', showLevels, true]],
    );
    return;
  }
  showOverlay(
    `<div class="emoji">🧶</div><h2>완성!</h2><p>${getLevel(levelIndex).name} 뜨개질을 끝냈어요.</p>`,
    [['다음 레벨', () => startLevel(levelIndex + 1), true]],
  );
}

function showLose() {
  const actions = [['다시 하기', () => startLevel(levelIndex), true]];
  if (!game.usedRescue) {
    actions.push(['보관함 +1 하고 계속', () => { game.rescue(); hideOverlay(); resize(); }, false]);
  }
  const pct = Math.round((1 - game.remainingStitches / game.totalStitches) * 100);
  showOverlay(
    `<div class="emoji">🪡</div><h2>보관함이 가득 찼어요</h2><p>${pct}% 완성했어요. 보빈 순서를 바꿔 다시 도전해 보세요.</p>`,
    actions,
  );
}

function showLevels() {
  let grid = '<div class="level-grid">';
  for (let i = 0; i < TOTAL_LEVELS; i++) {
    const locked = i > unlocked;
    const cls = ['lv', locked && 'locked', i < unlocked && 'cleared', i === levelIndex && 'current', isHardLevel(i) && 'hard']
      .filter(Boolean).join(' ');
    grid += `<button class="${cls}" data-lv="${i}" ${locked ? 'disabled' : ''}>${i + 1}</button>`;
  }
  grid += '</div>';
  showOverlay(
    `<h2>레벨 선택</h2><p class="sub">${Math.min(unlocked, TOTAL_LEVELS)} / ${TOTAL_LEVELS} 완료 · ★ 어려운 스테이지</p>${grid}`,
    [['닫기', hideOverlay, false]],
  );
  overlay.querySelectorAll('[data-lv]').forEach((b) =>
    b.addEventListener('click', () => startLevel(Number(b.dataset.lv))));
  overlay.querySelector('.lv.current')?.scrollIntoView({ block: 'center' });
}

// ── 구글 계정 ──────────────────────────────────────────

const accountBtn = $('btn-account');
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** 로그인해 있으면 진행도를 클라우드에도 저장한다 */
function syncCloud() {
  if (!cloud.user) return;
  saveProgress({ unlocked, current: levelIndex }).catch(() => toast('클라우드 저장에 실패했어요'));
}

function renderAccountButton() {
  const u = cloud.user;
  accountBtn.innerHTML = u?.photoURL
    ? `<img src="${escapeHtml(u.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : '👤';
  accountBtn.classList.toggle('signed-in', Boolean(u));
}

/** 로그인하면 클라우드 진행도와 합친다. 더 많이 깬 쪽을 따른다 */
async function onUser(user) {
  renderAccountButton();
  if (!user) return;
  try {
    const saved = await loadProgress();
    if (saved && saved.unlocked > unlocked) {
      unlocked = Math.min(saved.unlocked, TOTAL_LEVELS);
      store.set('unlocked', unlocked);
      startLevel(Math.min(saved.current ?? unlocked, unlocked, TOTAL_LEVELS - 1));
      toast('클라우드에 저장된 진행도를 불러왔어요');
    } else {
      syncCloud();
    }
  } catch {
    toast('진행도를 불러오지 못했어요');
  }
}

function showAccount() {
  if (!cloud.ready) {
    toast('잠시 후 다시 시도해 주세요');
    return;
  }
  const u = cloud.user;
  if (!u) {
    showOverlay(
      `<div class="emoji">🧵</div><h2>구글 계정으로 로그인</h2><p>로그인하면 진행도가 저장되어<br>다른 기기에서도 이어서 할 수 있어요.</p>`,
      [
        ['Google로 로그인', async () => {
          try {
            await signIn();
            hideOverlay();
          } catch {
            toast('로그인에 실패했어요');
          }
        }, true],
        ['닫기', hideOverlay, false],
      ],
    );
    return;
  }
  const photo = u.photoURL
    ? `<img class="avatar" src="${escapeHtml(u.photoURL)}" alt="" referrerpolicy="no-referrer">`
    : '<div class="emoji">👤</div>';
  showOverlay(
    `${photo}<h2>${escapeHtml(u.displayName || '플레이어')}</h2><p>${escapeHtml(u.email)}<br>${Math.min(unlocked, TOTAL_LEVELS)} / ${TOTAL_LEVELS} 스테이지 완료 · 클라우드에 저장 중</p>`,
    [
      ['닫기', hideOverlay, true],
      ['로그아웃', async () => {
        await signOut();
        hideOverlay();
        toast('로그아웃했어요');
      }, false],
    ],
  );
}

function handleEvents() {
  for (const e of game.events) {
    sfx[e.type]?.();
    const color = game.colors[e.color];
    if (e.type === 'hit') fx.fluff(e.x, e.y, color);
    if (e.type === 'done') fx.burst(e.x, e.y, color, game.k);
    if (e.type === 'full') toast(`벨트가 가득 찼어요 (최대 ${game.beltCap}개)`);
    if (e.type === 'win') {
      fx.confetti(game, game.colors);
      setTimeout(showWin, 900);
    }
    if (e.type === 'lose') setTimeout(showLose, 600);
  }
  game.events.length = 0;
}

function updateHud() {
  const pct = (1 - game.remainingStitches / game.totalStitches) * 100;
  $('progress-fill').style.width = `${pct}%`;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const slotsBefore = game.slots.length;
  game.update(dt);
  if (game.slots.length !== slotsBefore) resize();
  handleEvents();
  updateHud();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  draw(ctx, game, view, now / 1000, dt);
  requestAnimationFrame(frame);
}

canvas.addEventListener('pointerdown', (e) => {
  unlock();
  const rect = canvas.getBoundingClientRect();
  game.tap((e.clientX - rect.left - view.ox) / view.s, (e.clientY - rect.top - view.oy) / view.s);
});

$('btn-restart').addEventListener('click', () => startLevel(levelIndex));
$('btn-levels').addEventListener('click', showLevels);
const muteBtn = $('btn-mute');
const syncMute = () => { muteBtn.textContent = isMuted() ? '🔇' : '🔊'; };
muteBtn.addEventListener('click', () => {
  unlock();
  setMuted(!isMuted());
  store.set('muted', isMuted());
  syncMute();
});
syncMute();
window.addEventListener('resize', resize);

startLevel(levelIndex);
requestAnimationFrame(frame);

if (cloud.enabled) {
  accountBtn.hidden = false;
  accountBtn.addEventListener('click', showAccount);
  initCloud(onUser).catch(() => { accountBtn.hidden = true; });
}
