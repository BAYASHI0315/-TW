// Firebase同期設定
// このファイルは「Firebaseの接続情報だけ」を置く場所です。
// initializeApp() は src/cloud-sync.js 側で実行します。
export const firebaseConfig = {
  apiKey: "AIzaSyAOtjZsmX4oVJxkCcA-N7l5pk-5BwizZCM",
  authDomain: "kizai-kanri-system.firebaseapp.com",
  projectId: "kizai-kanri-system",
  storageBucket: "kizai-kanri-system.firebasestorage.app",
  messagingSenderId: "270754514539",
  appId: "1:270754514539:web:eb2d6d39ff77610765d32e"
};

// 1つの会社/チームで共有するデータIDです。最初はこのままでOK。
// 複数の台帳を分けたい場合だけ変更してください。
export const CLOUD_DOCUMENT_ID = "main";
