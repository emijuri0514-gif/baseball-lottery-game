#!/usr/bin/env node
// 指定したFirebase AuthユーザーにAdminカスタムクレームを付与する。
// このクレームを持つユーザーは、firestore.rules 上で試合結果の確定・取消などの
// 管理操作(games/betsへの書き込みなど)が行えるようになる。
//
// 事前準備は scripts/seed-games.mjs と同じ(serviceAccountKey.json を配置し、npm install)。
//
// 使い方:
//   node scripts/set-admin-claim.mjs <UID>
//
// <UID> は、対象ユーザーが一度アプリにアクセスして匿名ログインした後、
// Firebaseコンソールの Authentication タブに表示されるユーザーIDを指定する。
// 付与後はブラウザ側で再ログイン(またはトークンの再取得)しないと反映されない点に注意。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import admin from 'firebase-admin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
} catch (err) {
  console.error(
    `サービスアカウントキーが見つかりません: ${serviceAccountPath}\n` +
      'Firebaseコンソールから発行したJSONキーをこのパスに配置してください。'
  );
  process.exit(1);
}

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node scripts/set-admin-claim.mjs <UID>');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

admin
  .auth()
  .setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`Granted admin claim to ${uid}.`);
    console.log('ブラウザ側は再サインイン(またはIDトークンの再取得)後に管理者パネルが表示されます。');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
