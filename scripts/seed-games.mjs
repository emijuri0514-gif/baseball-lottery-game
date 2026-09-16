#!/usr/bin/env node
// 試合データ(仮データ)をFirestoreへ投入する初期セットアップ用スクリプト。
//
// firestore.rules では games コレクションへの書き込みを管理者(admin custom claim)に
// 限定しているため、ブラウザからではなく、信頼された環境で動くこのスクリプト
// (Firebase Admin SDK。ルールを一切通らずアクセスできる)から実行する。
//
// 事前準備:
//   1. Firebaseコンソール > プロジェクトの設定 > サービスアカウント から秘密鍵(JSON)を発行し、
//      このリポジトリ直下に `serviceAccountKey.json` として保存する。
//      (このファイルは秘密情報のため、絶対にGitにコミットしないこと。.gitignore済み)
//   2. リポジトリ直下で `npm install` を実行し、firebase-admin を取得する。
//   3. `node scripts/seed-games.mjs` を実行する。
//
// 既に games コレクションにデータがある場合は上書きされる(同じ game_id で再セットする)。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import admin from 'firebase-admin';
import { buildSeedGames } from '../js/lottery-core.mjs';

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

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function main() {
  const games = buildSeedGames(Date.now());
  const batch = db.batch();
  for (const game of games) {
    batch.set(db.collection('games').doc(game.game_id), game);
  }
  await batch.commit();
  console.log(`Seeded ${games.length} games into Firestore:`);
  for (const game of games) {
    console.log(`  - ${game.game_id}: ${game.home_team_id} vs ${game.away_team_id} (${game.game_date})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
