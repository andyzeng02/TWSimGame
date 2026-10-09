import type { Ctx } from './types';

/**
 * 沿連線擴散（守恆）：
 *   x_i(t+1) = x_i(t) + k * Σ_j w_ij * (x_j(t) - x_i(t))
 *
 * weight(e) 回傳連線 e 的權重（例：通行率 × 連線種類係數）。
 * 穩定條件：對每個區塊 k * Σ w ≤ 0.5，否則數值會震盪。
 */
export function diffuse(
  ctx: Ctx,
  varName: string,
  k: number,
  weight: (edgeIndex: number) => number,
): void {
  const x = ctx.v(varName);
  const delta = new Float64Array(x.length);
  const edges = ctx.world.edges;
  for (let e = 0; e < edges.length; e++) {
    const w = weight(e);
    if (w <= 0) continue;
    const { from, to } = edges[e];
    const flux = k * w * (x[to] - x[from]);
    delta[from] += flux;
    delta[to] -= flux;
  }
  for (let i = 0; i < x.length; i++) x[i] += delta[i];
}

/**
 * 沿單一連線把 amount 從 src 移到 dst（上限為連線容量 × 通行率），回傳實際移動量。
 */
export function transfer(
  ctx: Ctx,
  varName: string,
  edgeIndex: number,
  src: number,
  dst: number,
  amount: number,
): number {
  const x = ctx.v(varName);
  const e = ctx.world.edges[edgeIndex];
  const cap = e.capacity * ctx.state.edgeStatus[edgeIndex];
  const moved = Math.max(0, Math.min(amount, cap, x[src]));
  x[src] -= moved;
  x[dst] += moved;
  return moved;
}

/** 區塊對外通達度：所有相連道路中最好的通行率（沒有連線時視為 1） */
export function accessOf(ctx: Ctx, region: number): number {
  const inc = ctx.adj.incident[region];
  if (inc.length === 0) return 1;
  let best = 0;
  for (const e of inc) best = Math.max(best, ctx.state.edgeStatus[e]);
  return best;
}
