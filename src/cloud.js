// 구글 로그인, 진행도 클라우드 저장, 랭킹 (Firebase Auth + Realtime Database).
// SDK 는 로그인 기능을 켰을 때만 CDN 에서 불러온다. 설정이 없으면 아무것도 하지 않는다.
import { FIREBASE_CONFIG } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
// 랭킹 정렬 점수: 깬 스테이지 수가 먼저, 같으면 먼저 도달한 사람이 위 (reachedAt 이 작을수록 큼)
const TIME_SPAN = 1e13;

let auth = null;
let db = null;
let fb = {};

export const cloud = {
  enabled: Boolean(FIREBASE_CONFIG.apiKey),
  ready: false,
  /** @type {null | { uid: string, displayName: string, email: string, photoURL: string }} */
  user: null,
};

const progressRef = () => fb.ref(db, `users/${cloud.user.uid}/yarnloop`);
const rankRef = (uid = cloud.user.uid) => fb.ref(db, `leaderboard/${uid}`);

/** SDK 를 불러오고 로그인 상태가 바뀔 때마다 onUser(user | null) 를 부른다 */
export async function initCloud(onUser) {
  if (!cloud.enabled) return;
  const [app, authMod, dbMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-database.js`),
  ]);
  fb = { ...authMod, ...dbMod };
  const firebaseApp = app.initializeApp(FIREBASE_CONFIG);
  auth = authMod.getAuth(firebaseApp);
  db = dbMod.getDatabase(firebaseApp);
  authMod.onAuthStateChanged(auth, (user) => {
    cloud.user = user;
    cloud.ready = true;
    onUser(user);
  });
}

/** 팝업으로 구글 로그인. 팝업이 막힌 브라우저에서는 페이지 이동 방식으로 바꾼다 */
export async function signIn() {
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await fb.signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked') return fb.signInWithRedirect(auth, provider);
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    throw e;
  }
}

export function signOut() {
  return fb.signOut(auth);
}

/** @returns {Promise<null | { unlocked: number, current: number }>} */
export async function loadProgress() {
  if (!cloud.user) return null;
  const snap = await fb.get(progressRef());
  return snap.val();
}

export async function saveProgress({ unlocked, current }) {
  if (!cloud.user) return;
  await fb.set(progressRef(), { unlocked, current, updatedAt: fb.serverTimestamp() });
}

// ── 랭킹 ───────────────────────────────────────────────

/**
 * @typedef {object} RankEntry
 * @property {string} uid
 * @property {string} name
 * @property {number} cleared    깬 스테이지 수
 * @property {number} reachedAt  그 수에 처음 도달한 시각(ms)
 */

export const rankScore = (cleared, reachedAt) => cleared * TIME_SPAN + (TIME_SPAN - reachedAt);

/** 실명이 드러나지 않도록 uid 로 만든 기본 닉네임 */
export function defaultNickname(uid) {
  let h = 0;
  for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) % 10000;
  return `뜨개러 ${String(h).padStart(4, '0')}`;
}

/** @returns {Promise<RankEntry | null>} */
export async function loadMyRank() {
  if (!cloud.user) return null;
  const snap = await fb.get(rankRef());
  return snap.exists() ? { uid: cloud.user.uid, ...snap.val() } : null;
}

export async function saveRank({ name, cleared, reachedAt }) {
  if (!cloud.user || cleared < 1) return;
  await fb.set(rankRef(), {
    name, cleared, reachedAt,
    score: rankScore(cleared, reachedAt),
    updatedAt: fb.serverTimestamp(),
  });
}

/** 점수 높은 순 상위 limit 명 */
export async function loadTopRanks(limit = 50) {
  const q = fb.query(fb.ref(db, 'leaderboard'), fb.orderByChild('score'), fb.limitToLast(limit));
  const snap = await fb.get(q);
  const list = [];
  snap.forEach((child) => { list.push({ uid: child.key, ...child.val() }); });
  return list.sort((a, b) => b.score - a.score);
}

/** 내 점수보다 높은 사람 수 + 1 */
export async function rankOf(score) {
  const q = fb.query(fb.ref(db, 'leaderboard'), fb.orderByChild('score'), fb.startAfter(score));
  const snap = await fb.get(q);
  return snap.size + 1;
}
