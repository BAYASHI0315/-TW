# Equipment Manager Lite v20 Auth Cloud

映像機材管理アプリのFirebaseログイン対応版です。v19のクラウド同期/PWA機能に、Firebase Authenticationを使ったログイン管理を追加しています。

## v20追加内容

- メール/パスワードログイン
- ログアウト
- ログイン中ユーザー表示
- 未ログイン時はクラウド同期ボタンを無効化
- 許可メール一覧のアプリ内管理
- 新規ユーザー作成ボタン
- クラウド保存データに更新者メールを記録
- v19以前のローカル保存データ読み込み互換

## 使い始める手順

1. VS Codeでこのフォルダを開く
2. `src/firebase-config.js` にFirebase Webアプリ設定を貼り付ける
3. Firebase Consoleで Authentication を開く
4. 「Sign-in method」で「メール/パスワード」を有効化する
5. Firestore Database のルールをログイン必須にする
6. Live Serverで `index.html` を開く
7. 「クラウド同期」タブでログインする
8. 「この端末のデータをアップロード」または「クラウドから読み込み」を実行する

## firebase-config.js の形

Firebase Consoleでコピーした設定のうち、`firebaseConfig` の中身だけを使い、最終的に下記の形にしてください。

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

export const CLOUD_DOCUMENT_ID = "main";
```

`import { initializeApp } ...` や `const app = initializeApp(firebaseConfig);` は、このファイルには貼らないでください。

## Firestoreルール例

まずログイン済みユーザーだけ許可するなら、Firestore Database → ルール に下記を貼り付けて「公開」します。

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

さらに特定メールだけに制限する場合は、下記のようにします。

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function isAllowedUser() {
      return request.auth != null
        && request.auth.token.email in [
          "owner@example.com",
          "staff@example.com"
        ];
    }

    match /{document=**} {
      allow read, write: if isAllowedUser();
    }
  }
}
```

## 注意

アプリ内の「許可メール一覧」は、画面上の操作制限です。外部公開する場合は、Firestoreルール側にもメール制限を入れるのが安全です。

## PWAとして使う

GitHub Pagesなどで公開後、iPhone/iPadのSafariで開き、共有ボタン → ホーム画面に追加、でアプリのように使えます。

## v20.1 修正メモ

- `src/firebase-config.js` に Firebase 設定を反映済みです。
- Firebase Console からコピーしたコード全体ではなく、`firebaseConfig` の中身だけを正しい JavaScript 形式で設定しています。
- iPhone / iPad 表示の崩れ対策として、横スクロール、タブ折り返し、フォーム幅、表の表示を調整しています。
