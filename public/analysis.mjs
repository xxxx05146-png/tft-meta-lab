export const components = [
  'Kiếm B.F.', 'Cung Gỗ', 'Gậy Quá Khổ', 'Nước Mắt Nữ Thần',
  'Giáp Lưới', 'Áo Choàng Bạc', 'Đai Khổng Lồ', 'Găng Đấu Tập',
];

const recipeRows = [
  ['Deathblade', 'GiantSlayer', 'HextechGunblade', 'SpearOfShojin', 'EdgeOfNight', 'Bloodthirster', 'SteraksGage', 'InfinityEdge'],
  ['RedBuff', 'GuinsoosRageblade', 'VoidStaff', 'TitansResolve', 'KrakensFury', 'NashorsTooth', 'LastWhisper'],
  ['RabadonsDeathcap', 'ArchangelsStaff', 'Crownguard', 'IonicSpark', 'Morellonomicon', 'JeweledGauntlet'],
  ['BlueBuff', 'ProtectorsVow', 'AdaptiveHelm', 'SpiritVisage', 'HandOfJustice'],
  ['BrambleVest', 'GargoyleStoneplate', 'SunfireCape', 'SteadfastHeart'],
  ['DragonsClaw', 'Evenshroud', 'Quicksilver'],
  ['WarmogsArmor', 'StrikersFlail'],
  ['ThiefsGloves'],
];
const recipes = new Map(recipeRows.flatMap((items, row) => items.map((item, column) => [item, [row, row + column]])));

export function itemRecipe(id) {
  return recipes.get(id?.replace(/^(DA_|TFT_Item_)/, ''));
}

export function craftableItems(items, inventory) {
  return items.filter(({ id }) => {
    const recipe = itemRecipe(id);
    if (!recipe) return false;
    const [first, second] = recipe;
    return first === second ? inventory[first] >= 2 : inventory[first] >= 1 && inventory[second] >= 1;
  });
}

const prior = 100;
const bound = (value) => Math.min(1, Math.max(0, value));

export function evaluate(comp, baseline, inventory) {
  const n = comp.count;
  const place = (comp.place * n + baseline * prior) / (n + prior);
  const top4 = (comp.top4 * n + 0.5 * prior) / (n + prior);
  const win = comp.win == null ? null : (comp.win * n + 0.125 * prior) / (n + prior);
  const ease = comp.difficulty == null ? null : 1 - comp.difficulty / 3;
  const rarity = comp.playRate == null ? null : 1 - bound(comp.playRate / 0.5);
  const matchingItems = craftableItems(comp.items ?? [], inventory);
  const readiness = matchingItems.length > 0 ? 1 : 0;
  const strength = 0.7 * bound(0.5 + (baseline - place) / 1.5) + 0.3 * bound(0.5 + (top4 - 0.5) * 2);
  const score = 100 * (0.65 * strength + 0.18 * (rarity ?? 0) + 0.12 * (ease ?? 0) + 0.05 * readiness);
  return { ...comp, placeAdjusted: place, top4Adjusted: top4, winAdjusted: win, score, matchingItems };
}

export function rank(dataset, filters, inventory) {
  const { comps, baseline = 4.5 } = dataset;
  const rows = comps.filter((comp) =>
    comp.count >= filters.minCount
    && (!filters.rare || (comp.playRate != null && comp.playRate <= filters.maxRate && comp.place < baseline && comp.top4 >= 0.5))
    && (!filters.easy || (comp.difficulty != null && comp.difficulty <= 1))
    && (!filters.search || [comp.name, ...comp.units.map((unit) => unit.name ?? unit.id)].join(' ').toLowerCase().includes(filters.search))
  ).map((comp) => evaluate(comp, baseline, inventory));
  const comparison = {
    score: (a, b) => b.score - a.score,
    place: (a, b) => a.placeAdjusted - b.placeAdjusted,
    top4: (a, b) => b.top4Adjusted - a.top4Adjusted,
    win: (a, b) => (b.winAdjusted ?? -1) - (a.winAdjusted ?? -1),
    playRate: (a, b) => (a.playRate ?? Infinity) - (b.playRate ?? Infinity),
    count: (a, b) => b.count - a.count,
  };
  return rows.sort((a, b) => comparison[filters.sort](a, b) || b.count - a.count || a.name.localeCompare(b.name));
}

export function summarizeTrials(trials) {
  const count = trials.length;
  if (!count) return null;
  const completion = trials.filter((trial) => trial.completed).length;
  return {
    count,
    place: trials.reduce((sum, trial) => sum + trial.place, 0) / count,
    top4: trials.filter((trial) => trial.place <= 4).length / count,
    completion: completion / count,
  };
}
