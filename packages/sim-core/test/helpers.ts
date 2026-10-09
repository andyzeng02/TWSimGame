import type { Action, Rules, World } from '../src/index';

/** 4 個區塊排成一排：0 - 1 - 2 - 3 */
export function lineWorld(): World {
  const regions = [0, 1, 2, 3].map((i) => ({
    id: `r${i}`,
    name: `區${i}`,
    county: '測試縣',
    centroid: [120 + i * 0.05, 22.6] as [number, number],
    areaKm2: 10,
    population: 1000,
    attrs: {},
  }));
  const edges = [0, 1, 2].map((i) => ({
    from: i,
    to: i + 1,
    kind: 'road' as const,
    capacity: 10,
    travelTicks: 1,
    lengthKm: 5,
  }));
  return { meta: { id: 'line', name: 'line', version: 1, source: 'test' }, regions, edges, faults: [] };
}

export type ToyAction = { type: 'add'; region: number; amount: number };

/** 玩具劇本：heat 沿連線擴散，每 tick 加一點雜訊；事件 'ping' 會寫入紀錄 */
export function toyRules(): Rules<ToyAction> {
  return {
    id: 'toy',
    title: 'toy',
    maxTicks: 20,
    vars: ['heat'],
    init(ctx) {
      ctx.v('heat')[0] = 100;
      ctx.schedule(3, 'ping', { n: 1 });
      ctx.schedule(3, 'ping', { n: 2 });
      ctx.schedule(1, 'ping', { n: 0 });
    },
    applyAction(ctx, a) {
      ctx.v('heat')[a.region] += a.amount;
      return { ok: true };
    },
    onEvent(ctx, ev) {
      ctx.log('ping', String((ev.payload as { n: number }).n));
    },
    spread(ctx) {
      const x = ctx.v('heat');
      const d = new Float64Array(x.length);
      for (let e = 0; e < ctx.world.edges.length; e++) {
        const { from, to } = ctx.world.edges[e];
        const f = 0.2 * (x[to] - x[from]);
        d[from] += f;
        d[to] -= f;
      }
      for (let i = 0; i < x.length; i++) x[i] += d[i];
    },
    local(ctx) {
      const x = ctx.v('heat');
      for (let i = 0; i < x.length; i++) x[i] += ctx.rng.range(-0.01, 0.01);
    },
    checkEnd(ctx) {
      return ctx.state.tick >= 20 ? { reason: 'time', score: 0, grade: '-', details: {} } : null;
    },
    metrics(ctx) {
      return { total: ctx.v('heat').reduce((a, b) => a + b, 0) };
    },
  };
}

export type { Action };
