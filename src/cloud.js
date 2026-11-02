// 구글 로그인과 진행도 클라우드 저장 (Firebase Auth + Realtime Database).
// SDK 는 로그인 기능을 켰을 때만 CDN 에서 불러온다. 설정이 없으면 아무것도 하지 않는다.
import { FIREBASE_CONFIG } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';

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
