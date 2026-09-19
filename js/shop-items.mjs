// 交換ショップの商品カタログ(純粋データ)。
//
// ここでの「購入」は消費型ではなく、ポイントを一度払うと恒久的に解放される
// 実績解放(アンロック)。当落確率やオッズそのものを変えるアイテムは、
// ポイントを多く持つ人が有利になり公平性を損なうため置かない。あくまで
// 「新しい遊び方へのアクセス権」だけを売る、という設計方針にしている。
//
// available: false の商品は準備中(まだ解放先の機能が実装されていない)ことを示し、
// ショップ上では表示するが購入はできない状態にする。

export const SHOP_ITEMS = [
  {
    id: 'expert_draw',
    name: 'エキスパートくじ 解放',
    description:
      '通常より対象試合数が多く、的中しにくい代わりに配当も大きい「エキスパート版」のロトくじ回を購入できるようになります。',
    cost: 3000,
    available: true,
  },
  {
    id: 'player_stat_cards',
    name: '選手成績予想カード(準備中)',
    description:
      '先制打を放つ選手や完投する先発投手などを予想できる「選手成績予想」の券が購入できるようになります。',
    cost: 5000,
    available: false,
  },
];

export function getShopItem(itemId) {
  return SHOP_ITEMS.find((item) => item.id === itemId) || null;
}

export function isUnlocked(unlocks, itemId) {
  return Array.isArray(unlocks) && unlocks.includes(itemId);
}
