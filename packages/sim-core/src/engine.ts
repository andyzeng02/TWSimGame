import { createRng, seedFrom } from './rng';
import type {
  Action,
  ActionResult,
  Ctx,
  EndResult,
  Rules,
  ScheduledEvent,
  World,
  WorldState,
} from './types';
import { buildAdjacency } from './world';

export interface StepReport {
  tick: number;
  actionResults: ActionResult[];
  metrics: Record<string, number>;
  ended: EndResult | null;
}

export interface Snapshot {
  tick: number;
  vars: Record<string, number[]>;
  edgeStatus: number[];
  scalars: Record<string, number>;
  metrics: Record<string, number>;
  ended: EndResult | null;
}

export interface Sim<A extends Action = Action> {
  readonly world: World;
  readonly rules: Rules<A>;
  readonly ctx: Ctx;
  readonly state: WorldState;
  /** 推進一個 tick。順序固定：行動 → 事件 → 擴散 → 區塊內更新 → 檢查結束 */
  step(actions?: A[]): StepReport;
  metrics(): Record<string, number>;
  snapshot(): Snapshot;
}

export function createState(world: World, varNames: readonly string[], seed: number | string): WorldState {
  const n = world.regions.length;
  const vars: Record<string, Float64Array> = {};
  for (const name of varNames) vars[name] = new Float64Array(n);
  return {
    tick: 0,
    rng: seedFrom(seed),
    vars,
    edgeStatus: new Float64Array(world.edges.length).fill(1),
    scalars: {},
    eventQueue: [],
    nextSeq: 0,
    log: [],
    ended: null,
  };
}

function byTickThenSeq(a: ScheduledEvent, b: ScheduledEvent): number {
  return a.tick - b.tick || a.seq - b.seq;
}

export function createCtx(world: World, state: WorldState): Ctx {
  const adj = buildAdjacency(world);
  const rng = createRng(state);
  const ctx: Ctx = {
    world,
    state,
    rng,
    adj,
    schedule(delay, type, payload) {
      const ev: ScheduledEvent = {
        tick: state.tick + Math.max(1, Math.round(delay)),
        seq: state.nextSeq++,
        type,
        payload,
      };
      // 依 (tick, seq) 插入，保持排序
      const q = state.eventQueue;
      let i = q.length;
      while (i > 0 && byTickThenSeq(q[i - 1], ev) > 0) i--;
      q.splice(i, 0, ev);
    },
    log(kind, text, region) {
      state.log.push({ tick: state.tick, kind, text, region });
    },
    v(name) {
      const arr = state.vars[name];
      if (!arr) throw new Error(`未宣告的區塊變數：${name}`);
      return arr;
    },
  };
  return ctx;
}

export function createSim<A extends Action>(world: World, rules: Rules<A>, seed: number | string): Sim<A> {
  const state = createState(world, rules.vars, seed);
  const ctx = createCtx(world, state);
  rules.init(ctx);

  const sim: Sim<A> = {
    world,
    rules,
    ctx,
    state,
    step(actions = []) {
      if (state.ended) {
        return { tick: state.tick, actionResults: [], metrics: rules.metrics(ctx), ended: state.ended };
      }
      // 1. 玩家行動
      const actionResults = actions.map((a) => rules.applyAction(ctx, a));
      // 2. 到期事件（事件處理中排程的新事件至少延後 1 tick，不會在本 tick 觸發）
      const q = state.eventQueue;
      while (q.length && q[0].tick <= state.tick) {
        const ev = q.shift()!;
        rules.onEvent(ctx, ev);
      }
      // 3. 擴散與流動
      rules.spread(ctx);
      // 4. 區塊內更新
      rules.local(ctx);
      // 5. 時間前進並檢查結束
      state.tick++;
      state.ended = rules.checkEnd(ctx);
      return { tick: state.tick, actionResults, metrics: rules.metrics(ctx), ended: state.ended };
    },
    metrics: () => rules.metrics(ctx),
    snapshot() {
      const vars: Record<string, number[]> = {};
      for (const [k, arr] of Object.entries(state.vars)) vars[k] = Array.from(arr);
      return {
        tick: state.tick,
        vars,
        edgeStatus: Array.from(state.edgeStatus),
        scalars: { ...state.scalars },
        metrics: rules.metrics(ctx),
        ended: state.ended,
      };
    },
  };
  return sim;
}
