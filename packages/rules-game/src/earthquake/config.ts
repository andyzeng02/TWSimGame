/**
 * 地震 72 小時：全部可調係數。
 *
 * 這些數值是「遊戲調校用」，目的在於節奏與取捨，不是災害模型。
 * 調整後請跑 `npm run batch` 看評級分布有沒有跑掉（見 CLAUDE.md）。
 */
export interface EarthquakeConfig {
  /** 震央斷層 id（對應 world.faults） */
  faultId: string;
  magnitude: number;
  /** 每局規模隨機 ± 這個值，增加重玩變化 */
  magnitudeJitter: number;
  maxTicks: number;

  // 指揮點數
  cpStart: number;
  cpPerTick: number;
  cpMax: number;
  costs: {
    dispatchRescue: number;
    recallRescue: number;
    openShelter: number;
    repairRoad: number;
    sendSupplies: number;
    announce: number;
  };

  // 搜救
  rescueTeamsTotal: number;
  /** 增援：每 1000 名受威脅者，開局多派幾隊搜救隊（大地震時中央與外縣市支援較多，讓難度不只看規模運氣） */
  aidTeamsPer1000AtRisk: number;
  rescuePerTeamPerTick: number;
  rescuedInjuredShare: number;
  trappedDeathBase: number;
  trappedDeathGrowthPerTick: number;

  // 醫療
  bedsPer1000: number;
  bedsAvailableShare: number;
  injuredPerTrapped: number;
  injuredDeathUntreated: number;
  shelterInjuredDeathFactor: number;
  transferPerEdgeShare: number;
  /** 開設避難所所需小時；區內有登記的避難收容處所（世界檔 facilities）時較快 */
  shelterOpenTicks: number;
  shelterOpenTicksRegistered: number;

  // 物資（單位：天）
  suppliesStartDays: number;
  suppliesPerShipmentDays: number;
  suppliesLowDays: number;

  // 秩序與謠言（0–1）
  orderLossNoSupply: number;
  orderLossPerRumor: number;
  orderGainShelter: number;
  orderRecovery: number;
  orderCollapse: number;
  rumorGrowth: number;
  rumorDecay: number;
  rumorDiffusion: number;
  announceRumorCut: number;

  // 道路
  repairAmount: number;
  repairDelayTicks: number;

  // 餘震
  aftershockBaseChance: number;
  aftershockDecayTicks: number;

  // 評分：存活率在 [floor, ceil] 之間線性換成 0–1，再與秩序加權
  survivalFloor: number;
  survivalCeil: number;
  survivalWeight: number;

  // 評級門檻（分數 0–100），由批次跑分調出來
  grades: { S: number; A: number; B: number; C: number };
}

export const DEFAULT_EARTHQUAKE: EarthquakeConfig = {
  faultId: 'chishan',
  magnitude: 6.8,
  magnitudeJitter: 0.15,
  maxTicks: 72,

  cpStart: 6,
  cpPerTick: 2,
  cpMax: 12,
  costs: {
    dispatchRescue: 2,
    recallRescue: 0,
    openShelter: 2,
    repairRoad: 2,
    sendSupplies: 2,
    announce: 4,
  },

  rescueTeamsTotal: 8,
  aidTeamsPer1000AtRisk: 1,
  rescuePerTeamPerTick: 3,
  rescuedInjuredShare: 0.6,
  trappedDeathBase: 0.008,
  trappedDeathGrowthPerTick: 1 / 24,

  bedsPer1000: 3.5,
  bedsAvailableShare: 0.15,
  injuredPerTrapped: 1.5,
  injuredDeathUntreated: 0.008,
  shelterInjuredDeathFactor: 0.7,
  transferPerEdgeShare: 0.5,
  shelterOpenTicks: 2,
  shelterOpenTicksRegistered: 1,

  suppliesStartDays: 1,
  suppliesPerShipmentDays: 1.5,
  suppliesLowDays: 0.25,

  orderLossNoSupply: 0.015,
  orderLossPerRumor: 0.01,
  orderGainShelter: 0.006,
  orderRecovery: 0.002,
  orderCollapse: 0.15,
  rumorGrowth: 0.015,
  rumorDecay: 0.005,
  rumorDiffusion: 0.05,
  announceRumorCut: 0.5,

  repairAmount: 0.5,
  repairDelayTicks: 3,

  aftershockBaseChance: 0.3,
  aftershockDecayTicks: 8,

  survivalFloor: 0.6,
  survivalCeil: 0.9,
  survivalWeight: 0.8,

  grades: { S: 90, A: 80, B: 68, C: 50 },
};

export type DifficultyKey = 'easy' | 'normal' | 'hard';

/**
 * 難度：玩家開局可選，只覆寫上面的部分數值（主要是地震規模）。
 * 評級門檻三種難度相同，所以越難越不容易拿高評級。改這裡也要跑 `npm run batch`。
 */
export const DIFFICULTIES: Record<DifficultyKey, { label: string; description: string; overrides: Partial<EarthquakeConfig> }> = {
  easy: { label: '輕度', description: '規模約 6.6，受困者較少，適合第一次玩', overrides: { magnitude: 6.6 } },
  normal: { label: '標準', description: '規模約 6.8', overrides: {} },
  hard: { label: '嚴重', description: '規模約 7.0，受困者多、道路受損嚴重', overrides: { magnitude: 7.0 } },
};

export const DEFAULT_DIFFICULTY: DifficultyKey = 'normal';

/**
 * 震度估算（遊戲用簡化公式，0–7 對應中央氣象署震度級）。
 * distanceKm：區塊中心到斷層線的距離。
 */
export function intensityAt(magnitude: number, distanceKm: number): number {
  const i = magnitude - 1.0 - 2.2 * Math.log10(distanceKm + 3) + 1.0;
  return Math.max(0, Math.min(7, i));
}

/** 每人受困比例，震度 4 以下為 0 */
export function trappedRate(intensity: number): number {
  return intensity < 4 ? 0 : 0.0005 * (intensity - 4) ** 2;
}
