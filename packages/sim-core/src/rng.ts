import type { Rng } from './types';

/** 把任意整數或字串轉成 uint32 種子 */
export function seedFrom(input: number | string): number {
  if (typeof input === 'number') return input >>> 0;
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * mulberry32。狀態存在 holder.rng，所以存檔時亂數狀態一起存下，
 * 讀檔後接著跑會得到完全一樣的結果。
 */
export function createRng(holder: { rng: number }): Rng {
  const next = (): number => {
    const a = (holder.rng = (holder.rng + 0x6d2b79f5) >>> 0);
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
  };
}

/** 獨立亂數（例如機器人玩家用），不會干擾世界狀態的亂數序列 */
export function createStandaloneRng(seed: number | string): Rng {
  const holder = { rng: seedFrom(seed) };
  return createRng(holder);
}
