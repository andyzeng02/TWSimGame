import { createSim, type Sim } from './engine';
import type { Action, EndResult, Rules, World } from './types';

/** 一場遊戲的完整紀錄：種子 + 每個 tick 的玩家行動。足以完整重現結果。 */
export interface RunRecord<A extends Action = Action> {
  rulesId: string;
  worldId: string;
  seed: number | string;
  actionsByTick: A[][];
}

export type Policy<A extends Action> = (sim: Sim<A>) => A[];

export interface HeadlessResult<A extends Action> {
  end: EndResult | null;
  record: RunRecord<A>;
  metricsHistory: Record<string, number>[];
  finalHash: string;
}

/** 無畫面跑完一整場（批次平衡、自動測試用） */
export function runHeadless<A extends Action>(
  world: World,
  rules: Rules<A>,
  seed: number | string,
  policy: Policy<A>,
): HeadlessResult<A> {
  const sim = createSim(world, rules, seed);
  const record: RunRecord<A> = { rulesId: rules.id, worldId: world.meta.id, seed, actionsByTick: [] };
  const metricsHistory: Record<string, number>[] = [];
  let guard = 0;
  while (!sim.state.ended && guard++ < rules.maxTicks + 10) {
    const actions = policy(sim);
    record.actionsByTick.push(actions);
    const r = sim.step(actions);
    metricsHistory.push(r.metrics);
  }
  return { end: sim.state.ended, record, metricsHistory, finalHash: stateHash(sim) };
}

/** 依紀錄重播 */
export function replay<A extends Action>(world: World, rules: Rules<A>, record: RunRecord<A>): Sim<A> {
  const sim = createSim(world, rules, record.seed);
  for (const actions of record.actionsByTick) {
    if (sim.state.ended) break;
    sim.step(actions);
  }
  return sim;
}

/** 狀態雜湊：用來驗證兩次執行結果完全相同 */
export function stateHash(sim: Sim<Action>): string {
  let h = 2166136261;
  const mix = (n: number) => {
    // 以固定精度轉字串再雜湊，避免 -0 / NaN 之類的差異
    const s = Number.isFinite(n) ? n.toPrecision(12) : String(n);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  const st = sim.state;
  mix(st.tick);
  mix(st.rng);
  for (const k of Object.keys(st.vars).sort()) for (const x of st.vars[k]) mix(x);
  for (const x of st.edgeStatus) mix(x);
  for (const k of Object.keys(st.scalars).sort()) mix(st.scalars[k]);
  return (h >>> 0).toString(16).padStart(8, '0');
}
