import { accessOf, createStandaloneRng, type Policy, type Sim } from '@twsim/sim-core';
import type { EarthquakeConfig } from './config';
import type { EqAction } from './rules';

/**
 * 機器人玩家：給批次平衡與自動測試用。
 * 注意：機器人自己的亂數獨立於世界亂數，不會改變模擬結果的可重現性。
 */

/** 什麼都不做 */
export const idleBot: Policy<EqAction> = () => [];

/** 隨機亂按 */
export function randomBot(seed: number | string): Policy<EqAction> {
  const rng = createStandaloneRng(`bot:${seed}`);
  return (sim) => {
    const n = sim.world.regions.length;
    const m = sim.world.edges.length;
    const kinds: EqAction[] = [
      { type: 'dispatchRescue', region: rng.int(n) },
      { type: 'openShelter', region: rng.int(n) },
      { type: 'repairRoad', edge: rng.int(m) },
      { type: 'sendSupplies', region: rng.int(n) },
      { type: 'announce' },
    ];
    return rng.chance(0.6) ? [kinds[rng.int(kinds.length)]] : [];
  };
}

/** 貪婪策略：照優先順序把指揮點數用完 */
export function greedyBot(cfg: EarthquakeConfig): Policy<EqAction> {
  return (sim: Sim<EqAction>) => {
    const { ctx, state, world } = sim;
    const v = (k: string) => ctx.v(k);
    const trapped = v('trapped');
    const teams = v('teams');
    // 複製一份：規劃時會暫改估算值，不能動到模擬狀態
    const enroute = Float64Array.from(v('teamsEnroute'));
    const supplies = v('supplies');
    const supEnroute = v('suppliesEnroute');
    const shelter = v('shelter');
    const order = v('order');
    const rumor = v('rumor');
    let cp = state.scalars.cp;
    let teamsFree = state.scalars.teamsFree;
    const actions: EqAction[] = [];
    const planned = new Set<string>();
    const argmax = (score: (i: number) => number) => {
      let best = -1;
      let bestScore = 0;
      for (let i = 0; i < world.regions.length; i++) {
        const s = score(i);
        if (s > bestScore) {
          best = i;
          bestScore = s;
        }
      }
      return best;
    };

    for (let guard = 0; guard < 10; guard++) {
      // 1. 派搜救隊到「每隊負擔受困人數」最多的區
      if (teamsFree > 0 && cp >= cfg.costs.dispatchRescue) {
        const r = argmax((i) => trapped[i] / (teams[i] + enroute[i] + 1));
        if (r >= 0 && trapped[r] > 5) {
          actions.push({ type: 'dispatchRescue', region: r });
          cp -= cfg.costs.dispatchRescue;
          teamsFree--;
          enroute[r]++;
          continue;
        }
      }
      // 2. 搶修受困最多區的最差道路
      if (cp >= cfg.costs.repairRoad) {
        const r = argmax((i) => (accessOf(ctx, i) < 0.6 ? trapped[i] + 1 : 0));
        if (r >= 0) {
          let worst = -1;
          for (const e of ctx.adj.incident[r]) {
            if (state.scalars[`repairing:${e}`] || planned.has(`road:${e}`)) continue;
            if (worst < 0 || state.edgeStatus[e] < state.edgeStatus[worst]) worst = e;
          }
          if (worst >= 0 && state.edgeStatus[worst] < 0.9) {
            actions.push({ type: 'repairRoad', edge: worst });
            cp -= cfg.costs.repairRoad;
            planned.add(`road:${worst}`);
            continue;
          }
        }
      }
      // 3. 補物資到存量最低的區
      if (cp >= cfg.costs.sendSupplies) {
        const r = argmax((i) =>
          supplies[i] < 0.5 && supEnroute[i] === 0 && !planned.has(`sup:${i}`)
            ? (0.5 - supplies[i]) * world.regions[i].population + 1
            : 0,
        );
        if (r >= 0) {
          actions.push({ type: 'sendSupplies', region: r });
          cp -= cfg.costs.sendSupplies;
          planned.add(`sup:${r}`);
          continue;
        }
      }
      // 4. 謠言偏高就闢謠
      const rumorAvg = rumor.reduce((a, b) => a + b, 0) / rumor.length;
      if (rumorAvg > 0.3 && cp >= cfg.costs.announce && !planned.has('announce')) {
        actions.push({ type: 'announce' });
        cp -= cfg.costs.announce;
        planned.add('announce');
        continue;
      }
      // 5. 秩序最低且尚未開設避難所的區
      if (cp >= cfg.costs.openShelter) {
        const r = argmax((i) =>
          shelter[i] === 0 && !planned.has(`sh:${i}`) && order[i] < 0.8 ? (1 - order[i]) * 1000 + 1 : 0,
        );
        if (r >= 0) {
          actions.push({ type: 'openShelter', region: r });
          cp -= cfg.costs.openShelter;
          planned.add(`sh:${r}`);
          continue;
        }
      }
      break;
    }
    return actions;
  };
}
