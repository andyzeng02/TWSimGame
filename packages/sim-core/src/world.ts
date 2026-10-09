import type { Adjacency, LonLat, World } from './types';

export function buildAdjacency(world: World): Adjacency {
  const incident: number[][] = world.regions.map(() => []);
  world.edges.forEach((e, i) => {
    incident[e.from].push(i);
    incident[e.to].push(i);
  });
  return {
    incident,
    other: (edgeIndex, region) => {
      const e = world.edges[edgeIndex];
      return e.from === region ? e.to : e.from;
    },
  };
}

/** 檢查世界檔是否合法；回傳錯誤訊息清單（空陣列表示沒問題） */
export function validateWorld(world: World): string[] {
  const errors: string[] = [];
  const n = world.regions.length;
  if (n === 0) errors.push('regions 是空的');
  const ids = new Set<string>();
  world.regions.forEach((r, i) => {
    if (ids.has(r.id)) errors.push(`區塊 id 重複：${r.id}`);
    ids.add(r.id);
    if (!(r.population >= 0)) errors.push(`區塊 ${i}（${r.name}）人口不合法`);
    if (!(r.areaKm2 > 0)) errors.push(`區塊 ${i}（${r.name}）面積不合法`);
    if (r.centroid.length !== 2 || !r.centroid.every(Number.isFinite)) {
      errors.push(`區塊 ${i}（${r.name}）中心點不合法`);
    }
  });
  const pairs = new Set<string>();
  world.edges.forEach((e, i) => {
    if (e.from < 0 || e.from >= n || e.to < 0 || e.to >= n) {
      errors.push(`連線 ${i} 指向不存在的區塊`);
      return;
    }
    if (e.from === e.to) errors.push(`連線 ${i} 自己連到自己`);
    const key = `${Math.min(e.from, e.to)}-${Math.max(e.from, e.to)}-${e.kind}`;
    if (pairs.has(key)) errors.push(`連線重複：${key}`);
    pairs.add(key);
    if (!(e.capacity >= 0)) errors.push(`連線 ${i} 容量不合法`);
    if (!(e.travelTicks >= 1)) errors.push(`連線 ${i} travelTicks 至少為 1`);
  });
  if (n > 0 && errors.length === 0 && !isConnected(world)) {
    errors.push('區塊之間不是全部連通（有孤島）');
  }
  return errors;
}

export function isConnected(world: World): boolean {
  const n = world.regions.length;
  if (n === 0) return true;
  const adj = buildAdjacency(world);
  const seen = new Uint8Array(n);
  const stack = [0];
  seen[0] = 1;
  let count = 1;
  while (stack.length) {
    const i = stack.pop()!;
    for (const e of adj.incident[i]) {
      const j = adj.other(e, i);
      if (!seen[j]) {
        seen[j] = 1;
        count++;
        stack.push(j);
      }
    }
  }
  return count === n;
}

const KM_PER_DEG = 111.32;

/** 兩點距離（公里，等距圓柱近似，台灣尺度下誤差可忽略） */
export function distanceKm(a: LonLat, b: LonLat): number {
  const lat0 = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (a[0] - b[0]) * KM_PER_DEG * Math.cos(lat0);
  const dy = (a[1] - b[1]) * KM_PER_DEG;
  return Math.hypot(dx, dy);
}

/** 點到折線的最短距離（公里） */
export function distanceToLineKm(p: LonLat, line: LonLat[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return distanceKm(p, line[0]);
  const lat0 = p[1] * (Math.PI / 180);
  const sx = KM_PER_DEG * Math.cos(lat0);
  const sy = KM_PER_DEG;
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][0] - p[0]) * sx;
    const ay = (line[i][1] - p[1]) * sy;
    const bx = (line[i + 1][0] - p[0]) * sx;
    const by = (line[i + 1][1] - p[1]) * sy;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
