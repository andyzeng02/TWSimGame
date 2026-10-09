/**
 * 多邊形工具（經緯度輸入，內部用局部等距投影換成公里計算）。
 * 一個區塊 = 多個外圈（multipolygon，不含洞）。
 */
import type { XY } from './shapefile';

export type Ring = XY[];
export type BBox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

const KM_PER_DEG = 111.32;
const kx = (lat: number) => KM_PER_DEG * Math.cos((lat * Math.PI) / 180);

/** 去掉重複的封閉點 */
export function openRing(r: Ring): Ring {
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) return r.slice(0, -1);
  return r;
}

/** 有號面積（km²）；正值 = 逆時針 */
export function signedAreaKm2(r: Ring): number {
  if (r.length < 3) return 0;
  const lat0 = r.reduce((s, p) => s + p[1], 0) / r.length;
  const sx = kx(lat0);
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    s += (r[j][0] * sx) * (r[i][1] * KM_PER_DEG) - (r[i][0] * sx) * (r[j][1] * KM_PER_DEG);
  }
  return s / 2;
}

export function areaKm2(rings: Ring[]): number {
  return rings.reduce((s, r) => s + Math.abs(signedAreaKm2(r)), 0);
}

export function bboxOf(rings: Ring[]): BBox {
  let a = Infinity;
  let b = Infinity;
  let c = -Infinity;
  let d = -Infinity;
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < a) a = x;
      if (y < b) b = y;
      if (x > c) c = x;
      if (y > d) d = y;
    }
  return [a, b, c, d];
}

export function pointInRing(p: XY, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const pointInRings = (p: XY, rings: Ring[]) => rings.some((r) => pointInRing(p, r));

/** 點到多邊形邊界的最短距離（km） */
export function distanceToEdgesKm(p: XY, rings: Ring[]): number {
  const sx = kx(p[1]);
  let best = Infinity;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const ax = (r[j][0] - p[0]) * sx;
      const ay = (r[j][1] - p[1]) * KM_PER_DEG;
      const bx = (r[i][0] - p[0]) * sx;
      const by = (r[i][1] - p[1]) * KM_PER_DEG;
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}

/**
 * 代表點：保證落在區塊內、且盡量遠離邊界（放標籤、搜救隊標記用）。
 * 在最大的外圈上做兩階段格點搜尋。
 */
export function interiorPoint(rings: Ring[]): XY {
  const main = rings.reduce((m, r) => (Math.abs(signedAreaKm2(r)) > Math.abs(signedAreaKm2(m)) ? r : m), rings[0]);
  let [x0, y0, x1, y1] = bboxOf([main]);
  let best: XY = main[0];
  let bestD = -1;
  for (let pass = 0; pass < 2; pass++) {
    const n = 24;
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const p: XY = [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * j) / n];
        if (!pointInRing(p, main)) continue;
        const d = distanceToEdgesKm(p, [main]);
        if (d > bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    // 第二輪在最佳點附近細搜
    const wx = (x1 - x0) / 12;
    const wy = (y1 - y0) / 12;
    [x0, y0, x1, y1] = [best[0] - wx, best[1] - wy, best[0] + wx, best[1] + wy];
  }
  return best;
}

/** Douglas–Peucker 簡化（容差單位 km） */
export function simplifyRing(r: Ring, toleranceKm: number): Ring {
  if (r.length <= 8) return r;
  const lat0 = r[0][1];
  const sx = kx(lat0);
  const keep = new Uint8Array(r.length);
  keep[0] = 1;
  keep[r.length - 1] = 1;
  // 封閉環：先以最遠點把環切成兩段
  let far = 0;
  let farD = -1;
  for (let i = 1; i < r.length; i++) {
    const d = Math.hypot((r[i][0] - r[0][0]) * sx, (r[i][1] - r[0][1]) * KM_PER_DEG);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  keep[far] = 1;
  const stack: [number, number][] = [
    [0, far],
    [far, r.length - 1],
  ];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const ax = r[s][0] * sx;
    const ay = r[s][1] * KM_PER_DEG;
    const bx = r[e][0] * sx;
    const by = r[e][1] * KM_PER_DEG;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let idx = -1;
    let maxD = 0;
    for (let i = s + 1; i < e; i++) {
      const px = r[i][0] * sx;
      const py = r[i][1] * KM_PER_DEG;
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > toleranceKm) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = r.filter((_, i) => keep[i]);
  return out.length >= 3 ? out : r;
}

export const roundXY = (p: XY, digits = 5): XY => {
  const m = 10 ** digits;
  return [Math.round(p[0] * m) / m, Math.round(p[1] * m) / m];
};
