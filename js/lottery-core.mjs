// 野球くじシミュレーター: チームデータ・シミュレーション・オッズ計算・AI予想ロジック。
//
// ここに定義する関数はすべて純粋関数(Firebase/DOMに依存しない)にしてある。
// ブラウザ側(index.html)と管理用スクリプト(scripts/*.mjs, Node)の両方から
// そのままimportして使うことで、判定ロジックが二重管理にならないようにしている。

// 12球団の仮データ(公式の実データではありません)。
// batting_avg: チーム打率, era: チーム防御率, runs_per_game: 1試合平均得点,
// runs_allowed_per_game: 1試合平均失点。
export const TEAMS = [
  { team_id: 'G',  team_name: '読売ジャイアンツ',       batting_avg: 0.258, era: 3.45, runs_per_game: 4.3, runs_allowed_per_game: 3.6 },
  { team_id: 'T',  team_name: '阪神タイガース',         batting_avg: 0.251, era: 3.10, runs_per_game: 3.9, runs_allowed_per_game: 3.3 },
  { team_id: 'C',  team_name: '広島東洋カープ',         batting_avg: 0.249, era: 3.60, runs_per_game: 4.0, runs_allowed_per_game: 3.9 },
  { team_id: 'DB', team_name: '横浜DeNAベイスターズ',   batting_avg: 0.253, era: 3.75, runs_per_game: 4.2, runs_allowed_per_game: 4.0 },
  { team_id: 'S',  team_name: '東京ヤクルトスワローズ', batting_avg: 0.247, era: 3.90, runs_per_game: 3.8, runs_allowed_per_game: 4.1 },
  { team_id: 'D',  team_name: '中日ドラゴンズ',         batting_avg: 0.240, era: 3.55, runs_per_game: 3.4, runs_allowed_per_game: 3.7 },
  { team_id: 'H',  team_name: '福岡ソフトバンクホークス', batting_avg: 0.262, era: 3.20, runs_per_game: 4.6, runs_allowed_per_game: 3.5 },
  { team_id: 'B',  team_name: 'オリックス・バファローズ', batting_avg: 0.250, era: 3.05, runs_per_game: 3.9, runs_allowed_per_game: 3.2 },
  { team_id: 'M',  team_name: '千葉ロッテマリーンズ',   batting_avg: 0.246, era: 3.50, runs_per_game: 3.7, runs_allowed_per_game: 3.8 },
  { team_id: 'E',  team_name: '東北楽天ゴールデンイーグルス', batting_avg: 0.248, era: 3.80, runs_per_game: 3.8, runs_allowed_per_game: 4.0 },
  { team_id: 'L',  team_name: '埼玉西武ライオンズ',     batting_avg: 0.244, era: 4.05, runs_per_game: 3.6, runs_allowed_per_game: 4.3 },
  { team_id: 'F',  team_name: '北海道日本ハムファイターズ', batting_avg: 0.243, era: 3.65, runs_per_game: 3.5, runs_allowed_per_game: 3.9 },
];

export function getTeam(teamId) {
  const team = TEAMS.find((t) => t.team_id === teamId);
  if (!team) throw new Error(`unknown team_id: ${teamId}`);
  return team;
}

// ピタゴラス勝率のスコア(そのチーム単体の"強さ"指標。0〜1のスコアで、
// 2チーム分を正規化してはじめて対戦の勝率になる)。
export function pythagoreanWinScore(team) {
  const rf = team.runs_per_game;
  const ra = team.runs_allowed_per_game;
  return (rf * rf) / (rf * rf + ra * ra);
}

export function winProbabilities(home, away) {
  const scoreHome = pythagoreanWinScore(home);
  const scoreAway = pythagoreanWinScore(away);
  const homeWinProb = scoreHome / (scoreHome + scoreAway);
  return { homeWinProb, awayWinProb: 1 - homeWinProb };
}

// Knuthのアルゴリズムによるポアソン分布の乱数生成。
export function poissonRandom(lambda) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= Math.random();
  } while (p > limit);
  return k - 1;
}

// 各チームのruns_per_gameを期待値としたポアソン分布に基づき、乱数で試合得点を生成する。
export function simulateGameScore(home, away) {
  return {
    homeScore: poissonRandom(home.runs_per_game),
    awayScore: poissonRandom(away.runs_per_game),
  };
}

// 得点シミュレーションを多数回試行し、合計得点のオーバー/アンダーのラインと
// それぞれの確率を統計的に推定する(モンテカルロ法)。
export function estimateTotalRunsMarket(home, away, trials = 4000) {
  const totals = new Array(trials);
  let sum = 0;
  for (let i = 0; i < trials; i += 1) {
    const { homeScore, awayScore } = simulateGameScore(home, away);
    const total = homeScore + awayScore;
    totals[i] = total;
    sum += total;
  }
  const mean = sum / trials;
  // 引き分け(ちょうどラインと同じ得点)が起こらないよう必ず「.5」のラインにする。
  const line = Math.max(0.5, Math.floor(mean) + 0.5);
  let over = 0;
  for (const total of totals) if (total > line) over += 1;
  const overProb = over / trials;
  return { line, overProb, underProb: 1 - overProb, meanTotal: mean };
}

// odds = (1 / 勝率) × 還元率。オッズがインフレしすぎないよう上限・下限でキャップする。
export function calcOdds(prob, { payoutRate = 0.9, min = 1.1, max = 10 } = {}) {
  const safeProb = Math.min(Math.max(prob, 0.01), 0.99);
  const raw = (1 / safeProb) * payoutRate;
  const capped = Math.min(Math.max(raw, min), max);
  return Math.round(capped * 100) / 100;
}

// 1試合分の「勝利チーム」「合計得点オーバー/アンダー」市場(確率・オッズ)をまとめて計算する。
export function buildMarket(home, away) {
  const { homeWinProb, awayWinProb } = winProbabilities(home, away);
  const totalMarket = estimateTotalRunsMarket(home, away);
  return {
    homeWinProb,
    awayWinProb,
    homeOdds: calcOdds(homeWinProb),
    awayOdds: calcOdds(awayWinProb),
    totalLine: totalMarket.line,
    overProb: totalMarket.overProb,
    underProb: totalMarket.underProb,
    overOdds: calcOdds(totalMarket.overProb),
    underOdds: calcOdds(totalMarket.underProb),
  };
}

// AIの予想(勝利チーム・合計得点)と、根拠テキスト(テンプレート文)を生成する。
export function buildAiPrediction(home, away, market) {
  const winnerIsHome = market.homeWinProb >= market.awayWinProb;
  const winner_team_id = winnerIsHome ? home.team_id : away.team_id;
  const winnerRationale = winnerIsHome
    ? `直近の防御率(ERA ${home.era.toFixed(2)})と得点力から、${home.team_name}有利と予想`
    : `直近の防御率(ERA ${away.era.toFixed(2)})と得点力から、${away.team_name}有利と予想`;

  const totalIsOver = market.overProb >= market.underProb;
  const totalRationale = totalIsOver
    ? `両チームの得点力から合計${market.totalLine}点を上回る打ち合いを予想し「オーバー」`
    : `両チームの投手力から合計${market.totalLine}点を下回る接戦を予想し「アンダー」`;

  return {
    winner_team_id,
    total_pick: { line: market.totalLine, pick: totalIsOver ? 'over' : 'under' },
    rationale: `${winnerRationale}。${totalRationale}。`,
  };
}

// デモ用の試合データ(仮データ)を、指定した基準時刻からの相対時間で組み立てる。
// nowMs を渡すことで、シード投入スクリプト(Node)とブラウザ側のセルフテストの
// 両方で同じ生成ロジックを共有できる。
export function buildSeedGames(nowMs) {
  const defs = [
    { game_id: 'g1', home_team_id: 'G', away_team_id: 'T', offsetMs: 30 * 60 * 1000 },
    { game_id: 'g2', home_team_id: 'C', away_team_id: 'DB', offsetMs: 3 * 60 * 60 * 1000 },
    { game_id: 'g3', home_team_id: 'H', away_team_id: 'B', offsetMs: 5 * 60 * 60 * 1000 },
    { game_id: 'g4', home_team_id: 'S', away_team_id: 'D', offsetMs: -2 * 60 * 60 * 1000 },
    { game_id: 'g5', home_team_id: 'M', away_team_id: 'E', offsetMs: 24 * 60 * 60 * 1000 },
    {
      game_id: 'g6',
      home_team_id: 'L',
      away_team_id: 'F',
      offsetMs: -24 * 60 * 60 * 1000,
      finished: { home_score: 5, away_score: 3 },
    },
  ];

  return defs.map((def) => {
    const home = getTeam(def.home_team_id);
    const away = getTeam(def.away_team_id);
    const market = buildMarket(home, away);
    const aiPrediction = buildAiPrediction(home, away, market);
    const game_date = new Date(nowMs + def.offsetMs).toISOString();

    let status = 'scheduled';
    let result = null;
    if (def.finished) {
      status = 'finished';
      const { home_score, away_score } = def.finished;
      const winner_team_id =
        home_score === away_score ? null : home_score > away_score ? def.home_team_id : def.away_team_id;
      result = { home_score, away_score, winner_team_id };
    }

    return {
      game_id: def.game_id,
      home_team_id: def.home_team_id,
      away_team_id: def.away_team_id,
      game_date,
      status,
      result,
      market,
      aiPrediction,
    };
  });
}

// 予想(ベット)の的中判定。game.result が未確定(null)なら pending のまま。
export function judgeBet(bet, game) {
  if (!game.result) return 'pending';
  if (bet.bet_type === 'winner') {
    if (!game.result.winner_team_id) return 'miss'; // 引き分けは今回未対応のため不的中扱い
    return bet.bet_value === game.result.winner_team_id ? 'hit' : 'miss';
  }
  if (bet.bet_type === 'total_runs') {
    const total = game.result.home_score + game.result.away_score;
    const { line, pick } = bet.bet_value;
    const hit = pick === 'over' ? total > line : total < line;
    return hit ? 'hit' : 'miss';
  }
  return 'miss';
}

// AIの予想が、実際の結果に対して的中していたかどうかを bet_type と同じ条件で判定する
// (ユーザーの的中率とAIの的中率を同じ土俵で比較するために使う)。
export function judgeAiPick(aiPrediction, betType, game) {
  if (!game.result) return null;
  if (betType === 'winner') {
    if (!game.result.winner_team_id) return false;
    return aiPrediction.winner_team_id === game.result.winner_team_id;
  }
  if (betType === 'total_runs') {
    const total = game.result.home_score + game.result.away_score;
    const { line, pick } = aiPrediction.total_pick;
    return pick === 'over' ? total > line : total < line;
  }
  return null;
}
