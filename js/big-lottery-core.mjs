// 「非予想系(BIG方式)」の野球くじロジック(純粋関数のみ)。
//
// 2026年にNPBオーナー会議で検討が報じられた「非予想系」のスポーツ振興くじは、
// toto BIGと同じ考え方(ユーザーは勝敗を予想せず、システムが自動でランダムな
// 組み合わせを発行し、実際の結果とどれだけ一致したかで配当が決まる、純粋な
// 抽選型のくじ)を指す。js/lottery-core.mjs の「予想して当てる」モードとは
// 別のゲーム性として、このファイルに分離して実装している。
//
// 配当は「パリミュチュエル方式」(実際のtoto BIGと同じ)にしている。あらかじめ
// 固定された倍率で配当するのではなく、購入総額から確保したプールを、その等級の
// 実際の当選口数で山分けする。そのため、同じ的中数でも当選者が少ない回ほど
// 1口あたりの配当は増え、多い回ほど減る(=結果が確定するまで金額はわからない)。
// 販売中は、理論上の的中確率から算出した「目安配当」を参考情報として表示できる。

export const DEFAULT_UNIT_PRICE = 100; // 1口あたりの価格(pt)。totoBIGの100円単位を模している。
export const DEFAULT_PAYOUT_RATE = 0.85; // 還元率。購入総額のうちこの割合を配当プールに充てる。
export const DEFAULT_JACKPOT_SHARE = 0.7; // 配当プールのうち全試合的中(1等)に配分する割合。残りは1つ外れ(2等)に配分する。

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

// 二項分布 P(X=k), p=0.5 (五分五分の乱数でn試合中k試合的中する理論上の確率)。
export function probExactMatches(n, k) {
  const comb = factorial(n) / (factorial(k) * factorial(n - k));
  return comb * (0.5 ** n);
}

// 配当が出るのは「全試合的中(1等)」と「1試合だけ外れ(2等)」の2クラスのみ。
// それ以外ははずれ(配分なし)とする。
function tierShare(n, k, jackpotShare) {
  if (k === n) return jackpotShare;
  if (k === n - 1) return 1 - jackpotShare;
  return 0;
}

// 目安配当(1口あたり, まだ結果が出る前の参考値)。
// 実際のtoto BIGの「参考配当金」と同じ考え方で、現時点の販売口数と理論上の的中確率から
// 「このまま的中者数が理論通りだとしたら、1人あたりこれくらい」を試算する。
// 実際の的中者数によって最終的な配当額は変動するため、あくまで目安であり保証額ではない。
export function estimateTierPayout(n, k, ticketCount, unitPrice, opts = {}) {
  const { payoutRate = DEFAULT_PAYOUT_RATE, jackpotShare = DEFAULT_JACKPOT_SHARE, minExpectedWinners = 0.5 } = opts;
  const share = tierShare(n, k, jackpotShare);
  if (share === 0 || ticketCount <= 0) return 0;
  const pool = ticketCount * unitPrice * payoutRate * share;
  const expectedWinners = Math.max(ticketCount * probExactMatches(n, k), minExpectedWinners);
  return Math.round(pool / expectedWinners);
}

// 実際の精算(パリミュチュエル): 購入総額から確保したプールを、そのクラスの
// 「実際の」当選口数で山分けする。当選者が1人もいなければそのクラスの配当は
// 発生しない(繰越等の仕組みは今回のフェーズでは実装しない)。
export function settleTierPayout(n, k, totalTicketCount, actualWinnerCount, unitPrice, opts = {}) {
  const { payoutRate = DEFAULT_PAYOUT_RATE, jackpotShare = DEFAULT_JACKPOT_SHARE } = opts;
  const share = tierShare(n, k, jackpotShare);
  if (share === 0 || actualWinnerCount <= 0) return 0;
  const pool = totalTicketCount * unitPrice * payoutRate * share;
  return Math.round(pool / actualWinnerCount);
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

// くじ回(draw)ドキュメントの中身を組み立てる。unit_price / payout_rate / jackpot_share は
// くじ回ごとに変えられるようにしてある(週替わりで還元率や配分を調整したい場合を想定)。
export function buildDraw(gameIds, opts = {}) {
  const {
    unitPrice = DEFAULT_UNIT_PRICE,
    payoutRate = DEFAULT_PAYOUT_RATE,
    jackpotShare = DEFAULT_JACKPOT_SHARE,
  } = opts;
  return {
    game_ids: gameIds,
    unit_price: unitPrice,
    payout_rate: payoutRate,
    jackpot_share: jackpotShare,
  };
}
