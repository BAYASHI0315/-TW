import { firebaseConfig, CLOUD_DOCUMENT_ID } from './firebase-config.js';

const statusEl = () => document.getElementById('cloudSyncStatus');
const logEl = () => document.getElementById('cloudSyncLog');
const authStatusEl = () => document.getElementById('authStatus');
const enabledKey = 'equipment-manager-cloud-sync-enabled-v20';
const autoKey = 'equipment-manager-cloud-sync-auto-v20';
const allowedKey = 'equipment-manager-allowed-emails-v20';
const hasConfig = Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId && firebaseConfig?.appId);
let firestore = null;
let docRef = null;
let unsubscribe = null;
let auth = null;
let currentUser = null;
let api = null;
let applyingRemote = false;
let saveTimer = null;

function setStatus(text, tone = '') {
  const el = statusEl();
  if (!el) return;
  el.textContent = text;
  el.className = `cloud-status ${tone}`.trim();
}
function setAuthStatus(text, tone = '') {
  const el = authStatusEl();
  if (!el) return;
  el.textContent = text;
  el.className = `cloud-status ${tone}`.trim();
}
function log(text) {
  const el = logEl();
  if (!el) return;
  const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  el.textContent = `[${time}] ${text}\n` + (el.textContent || '').split('\n').slice(0, 8).join('\n');
}
function allowedEmails() {
  return (localStorage.getItem(allowedKey) || '')
    .split(/\n|,|;/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}
function isAllowedUser(user = currentUser) {
  if (!user?.email) return false;
  const list = allowedEmails();
  if (list.length === 0) return true;
  return list.includes(user.email.toLowerCase());
}
function requireLogin() {
  if (!hasConfig) return false;
  if (!currentUser) {
    setStatus('ログインが必要です', 'danger');
    log('クラウド同期にはログインが必要です。');
    return false;
  }
  if (!isAllowedUser(currentUser)) {
    setStatus('許可されていないメールです', 'danger');
    log(`${currentUser.email} は許可メール一覧に含まれていません。`);
    return false;
  }
  return true;
}
function updateButtonState() {
  const ok = hasConfig && currentUser && isAllowedUser(currentUser);
  ['cloudStartBtn', 'cloudStopBtn', 'cloudPushBtn', 'cloudPullBtn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !ok;
  });
}
async function setupFirebase() {
  if (!hasConfig) {
    setStatus('Firebase未設定：ローカル保存で動作中', 'warn');
    setAuthStatus('Firebase未設定', 'warn');
    updateButtonState();
    return false;
  }
  if (firestore && docRef && auth) return true;
  try {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js');
    const dbMod = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js');
    const app = appMod.initializeApp(firebaseConfig);
    firestore = dbMod.getFirestore(app);
    auth = authMod.getAuth(app);
    docRef = dbMod.doc(firestore, 'equipmentManager', CLOUD_DOCUMENT_ID || 'main');
    window.__firebaseFirestore = dbMod;
    window.__firebaseAuth = authMod;
    authMod.onAuthStateChanged(auth, user => {
      currentUser = user || null;
      if (currentUser && isAllowedUser(currentUser)) {
        setAuthStatus(`ログイン中：${currentUser.email}`, 'ok');
        setStatus('Firebase接続準備OK：ログイン済み', 'ok');
      } else if (currentUser) {
        setAuthStatus(`ログイン中：${currentUser.email}（許可外）`, 'danger');
        setStatus('許可メール一覧に含まれていません', 'danger');
        stopRealtime(false);
      } else {
        setAuthStatus('未ログイン', 'warn');
        setStatus('Firebase設定あり：ログイン待ち', 'warn');
        stopRealtime(false);
      }
      updateButtonState();
    });
    setStatus('Firebase接続準備OK：ログインしてください', 'warn');
    return true;
  } catch (err) {
    console.error(err);
    setStatus('Firebase接続エラー', 'danger');
    setAuthStatus('Firebase接続エラー', 'danger');
    log(`接続エラー: ${err.message}`);
    updateButtonState();
    return false;
  }
}
async function login() {
  if (!(await setupFirebase())) return;
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPassword')?.value;
  if (!email || !password) { alert('メールアドレスとパスワードを入力してください。'); return; }
  try {
    const { signInWithEmailAndPassword } = window.__firebaseAuth;
    await signInWithEmailAndPassword(auth, email, password);
    log(`ログインしました：${email}`);
  } catch (err) {
    console.error(err);
    setAuthStatus('ログイン失敗', 'danger');
    log(`ログイン失敗: ${err.message}`);
  }
}
async function logout() {
  if (!(await setupFirebase())) return;
  try {
    await stopRealtime(false);
    const { signOut } = window.__firebaseAuth;
    await signOut(auth);
    log('ログアウトしました。');
  } catch (err) {
    console.error(err);
    log(`ログアウト失敗: ${err.message}`);
  }
}
async function createUser() {
  if (!(await setupFirebase())) return;
  const email = document.getElementById('authEmail')?.value.trim();
  const password = document.getElementById('authPassword')?.value;
  if (!email || !password) { alert('作成するメールアドレスとパスワードを入力してください。'); return; }
  if (!confirm(`Firebase Authenticationに新規ユーザーを作成します。\n${email}\nよろしいですか？`)) return;
  try {
    const { createUserWithEmailAndPassword } = window.__firebaseAuth;
    await createUserWithEmailAndPassword(auth, email, password);
    log(`新規ユーザーを作成しました：${email}`);
  } catch (err) {
    console.error(err);
    setAuthStatus('ユーザー作成失敗', 'danger');
    log(`ユーザー作成失敗: ${err.message}`);
  }
}
function currentPayload() {
  return {
    updatedAt: new Date().toISOString(),
    appVersion: api?.version || 20.1,
    updatedBy: currentUser?.email || '',
    data: api?.getData?.() || {}
  };
}
async function pushNow() {
  if (!(await setupFirebase()) || !requireLogin()) return;
  try {
    const { setDoc, serverTimestamp } = window.__firebaseFirestore;
    const payload = currentPayload();
    await setDoc(docRef, { ...payload, serverUpdatedAt: serverTimestamp() }, { merge: true });
    setStatus('クラウドへ保存済み', 'ok');
    log('クラウドへアップロードしました。');
  } catch (err) {
    console.error(err);
    setStatus('アップロード失敗', 'danger');
    log(`アップロード失敗: ${err.message}`);
  }
}
async function pullNow() {
  if (!(await setupFirebase()) || !requireLogin()) return;
  try {
    const { getDoc } = window.__firebaseFirestore;
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      log('クラウド側にデータがまだありません。先にアップロードしてください。');
      return;
    }
    const remote = snap.data();
    if (!remote?.data) {
      log('クラウドデータの形式が不正です。');
      return;
    }
    applyingRemote = true;
    api.replaceData(remote.data, { silent: true });
    applyingRemote = false;
    setStatus('クラウドから読み込み済み', 'ok');
    log(`クラウドからダウンロードして反映しました。${remote.updatedBy ? ` 最終更新: ${remote.updatedBy}` : ''}`);
  } catch (err) {
    applyingRemote = false;
    console.error(err);
    setStatus('ダウンロード失敗', 'danger');
    log(`ダウンロード失敗: ${err.message}`);
  }
}
async function startRealtime() {
  if (!(await setupFirebase()) || !requireLogin()) return;
  if (unsubscribe) return;
  try {
    const { onSnapshot } = window.__firebaseFirestore;
    unsubscribe = onSnapshot(docRef, snap => {
      if (!snap.exists()) return;
      const remote = snap.data();
      if (!remote?.data) return;
      applyingRemote = true;
      api.replaceData(remote.data, { silent: true });
      applyingRemote = false;
      setStatus('リアルタイム同期中', 'ok');
      log(`クラウド変更を反映しました。${remote.updatedBy ? ` 更新者: ${remote.updatedBy}` : ''}`);
    }, err => {
      console.error(err);
      setStatus('リアルタイム同期エラー', 'danger');
      log(`同期エラー: ${err.message}`);
    });
    localStorage.setItem(enabledKey, 'true');
    setStatus('リアルタイム同期中', 'ok');
    log('リアルタイム同期を開始しました。');
  } catch (err) {
    console.error(err);
    setStatus('リアルタイム同期開始失敗', 'danger');
    log(`同期開始失敗: ${err.message}`);
  }
}
function stopRealtime(writeLog = true) {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  localStorage.setItem(enabledKey, 'false');
  if (hasConfig) setStatus(currentUser ? '同期停止中' : 'Firebase設定あり：ログイン待ち', 'warn');
  else setStatus('Firebase未設定：ローカル保存', 'warn');
  if (writeLog) log('リアルタイム同期を停止しました。');
  updateButtonState();
}
function bind() {
  document.getElementById('authLoginBtn')?.addEventListener('click', login);
  document.getElementById('authLogoutBtn')?.addEventListener('click', logout);
  document.getElementById('authCreateBtn')?.addEventListener('click', createUser);
  const allowedInput = document.getElementById('allowedEmailsInput');
  if (allowedInput) allowedInput.value = localStorage.getItem(allowedKey) || '';
  document.getElementById('saveAllowedEmailsBtn')?.addEventListener('click', () => {
    localStorage.setItem(allowedKey, allowedInput?.value || '');
    log('許可メール一覧を保存しました。');
    updateButtonState();
    if (currentUser && !isAllowedUser(currentUser)) {
      setAuthStatus(`ログイン中：${currentUser.email}（許可外）`, 'danger');
      stopRealtime(false);
    }
  });
  document.getElementById('cloudPushBtn')?.addEventListener('click', pushNow);
  document.getElementById('cloudPullBtn')?.addEventListener('click', () => {
    if (confirm('クラウド側のデータで、この端末の表示を上書きしますか？')) pullNow();
  });
  document.getElementById('cloudStartBtn')?.addEventListener('click', startRealtime);
  document.getElementById('cloudStopBtn')?.addEventListener('click', () => stopRealtime(true));
  const auto = document.getElementById('cloudAutoPushToggle');
  if (auto) {
    auto.checked = localStorage.getItem(autoKey) !== 'false';
    auto.onchange = () => localStorage.setItem(autoKey, auto.checked ? 'true' : 'false');
  }
  window.addEventListener('equipment-manager-data-changed', () => {
    if (applyingRemote) return;
    if (!unsubscribe) return;
    if (!currentUser || !isAllowedUser(currentUser)) return;
    if (localStorage.getItem(autoKey) === 'false') return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushNow, 800);
  });
  updateButtonState();
}
export async function initCloudSync(appApi) {
  api = appApi;
  bind();
  if (!hasConfig) {
    setStatus('Firebase未設定：ローカル保存で動作中', 'warn');
    setAuthStatus('Firebase未設定', 'warn');
    log('src/firebase-config.js にFirebase設定を入れると同期できます。');
    updateButtonState();
    return;
  }
  setStatus('Firebase設定あり：ログイン待ち', 'warn');
  await setupFirebase();
  if (localStorage.getItem(enabledKey) === 'true') startRealtime();
}
