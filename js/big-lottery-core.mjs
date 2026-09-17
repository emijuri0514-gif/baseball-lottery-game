// 「非予想系(BIG方式)」の野球くじロジック(純粋関数のみ)。
//
// 2026年にNPBオーナー会議で検討が報じられた「非予想系」のスポーツ振興くじは、
// toto BIGと同じ考え方(ユーザーは勝敗を予想せず、システムが自動でランダムな
// 組み合わせを発行し、実際の結果とどれだけ一致したかで配当が決まる、純粋な
// 抽選型のくじ)を指す。js/lottery-core.mjs の「予想して当てる」モードとは
// 別のゲーム性として、このファイルに分離して実装している。

export const DEFAULT_UNIT_PRICE = 100; // 1口あたりの価格(pt)。totoBIGの100円単位を模している。

// 対象試合それぞれについて、ホーム/アウェイのどちらが勝つかをランダムに1つ選ぶ。
// 非予想系である以上、ユーザーの技術や球団成績の知識で結果を左右させないよう、
// 常に公正な五分五分の乱数で生成する(勝率などの情報は一切使わない)。
export function generateRandomPicks(gameIds) {
  const picks = {};
  for (const gameId of gameIds) {
    picks[gameId] = Math.random() < 0.5 ? 'home' : 'away';
  }
  return picks;
}

// チケットの picks が、実際の結果(gamesById: Map<game_id, gameDocData>)と
// 何試合一致したかを数える。結果未確定/引き分けの試合はカウント対象から除外する。
export function countMatches(picks, gamesById) {
  let matched = 0;
  let total = 0;
  for (const [gameId, pick] of Object.entries(picks)) {
    const game = gamesById.get(gameId);
    if (!game || !game.result || !game.result.winner_team_id) continue;
    total += 1;
    const actualSide = game.result.winner_team_id === game.home_team_id ? 'home' : 'away';
    if (pick === actualSide) matched += 1;
  }
  return { matched, total };
}

function factorial(x) {
  let r = 1;
  for (let i = 2; i <= x; i += 1) r *= i;
  return r;
}

// 二項分布 P(X=k), p=0.5 (五分五分の予想をn試合分的中させる確率)。
function probExactMatches(n, k) {
  const comb = factorial(n) / (factorial(k) * factorial(n - k));
  return comb * (0.5 ** n);
}

// 配当テーブル: 全試合的中(ジャックポット)と、1試合だけ外れ(2等)のみ配当を出し、
// それ以外ははずれ(0倍)とする。倍率は calcOdds と同じ考え方
// (odds = (1 / 的中確率) × 還元率)で公正な期待値から逆算し、上限でキャップする。
export function buildPayoutTable(n, { payoutRate = 0.85, maxMultiplier = 5000 } = {}) {
  const fairMultiplier = (k) => Math.min(maxMultiplier, Math.round((1 / probExactMatches(n, k)) * payoutRate));

  const table = new Map();
  for (let k = 0; k <= n; k += 1) table.set(k, 0);
  if (n >= 1) table.set(n, fairMultiplier(n));
  if (n >= 2) table.set(n - 1, fairMultiplier(n - 1));
  return table;
}

// FirestoreはMap型を保存できないため、プレーンオブジェクトと相互変換する。
export function payoutTableToObject(table) {
  return Object.fromEntries([...table.entries()].map(([k, v]) => [String(k), v]));
}

export function payoutTableFromObject(obj) {
  return new Map(Object.entries(obj).map(([k, v]) => [Number(k), v]));
}

export function computePayout(matchedCount, payoutTable, unitPrice) {
  const multiplier = payoutTable.get(matchedCount) || 0;
  return Math.round(unitPrice * multiplier);
}

// 対象試合のうち最も早い試合開始時刻を、このくじ回の購入締切とする
// (totoBIGも対象試合群のうち最初の試合が始まる前に販売を締め切る)。
export function getDrawDeadline(gameIds, gamesById) {
  let min = Infinity;
  for (const gameId of gameIds) {
    const game = gamesById.get(gameId);
    if (game) min = Math.min(min, new Date(game.game_date).getTime());
  }
  return min === Infinity ? null : min;
}

// くじ回(draw)ドキュメントの中身を組み立てる。
export function buildDraw(gameIds, unitPrice = DEFAULT_UNIT_PRICE) {
  const n = gameIds.length;
  const payoutTable = buildPayoutTable(n);
  return {
    game_ids: gameIds,
    unit_price: unitPrice,
    payout_table: payoutTableToObject(payoutTable),
  };
}
