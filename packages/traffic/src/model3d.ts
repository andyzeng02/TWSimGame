/**
 * 3D 車輛的車廂外框：把一台車（車頭位置＋方向）展開成一節節車廂的地面矩形，
 * 地圖再把矩形往上擠出成立體車廂。
 *
 * 有軌道線形時，車頭吸附到最近的軌道上，車廂沿著軌道往後排（轉彎時跟著彎）；
 * 沒有線形（公車、或離軌道太遠）就沿著行進方向排成直線。
 * 這裡只做幾何計算，不碰地圖程式庫。
 */
import type { LngLat } from './types';

/** 一種車的車廂規格（公尺） */
export interface CarSpec {
  cars: number;
  lengthM: number;
  widthM: number;
  /** 車廂之間的間隙 */
  gapM: number;
}

/** 一節車廂：地面矩形（首尾相接的 5 個點）＋第幾節（0 = 車頭） */
export interface CarFootprint {
  ring: LngLat[];
  index: number;
}

type XY = [number, number];

const M_PER_DEG_LAT = 110_574;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** 以 origin 為原點的平面座標（公尺）；城市範圍內誤差可忽略 */
function toXY(p: LngLat, o: LngLat): XY {
  return [(p[0] - o[0]) * mPerDegLng(o[1]), (p[1] - o[1]) * M_PER_DEG_LAT];
}

function toLngLat([x, y]: XY, o: LngLat): LngLat {
  return [o[0] + x / mPerDegLng(o[1]), o[1] + y / M_PER_DEG_LAT];
}

/** 方位角（度，北 = 0，順時針）→ 單位向量 */
function heading(bearing: number): XY {
  const r = (bearing * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r)];
}

/** 點到線段最近點：回傳最近點、參數 t（0–1）與距離平方 */
function nearestOnSegment(p: XY, a: XY, b: XY): { q: XY; t: number; d2: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  const q: XY = [a[0] + dx * t, a[1] + dy * t];
  return { q, t, d2: (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 };
}

/**
 * 從車頭往後的「車身中心線」：回傳一串平面座標點，第一點是車頭。
 * 有吸附到軌道時沿軌道往回走，否則是往行進反方向的直線。
 */
function spine(head: LngLat, bearing: number | undefined, length: number, paths: LngLat[][], snapM: number): XY[] {
  const o = head;
  let best: { line: XY[]; i: number; q: XY; d2: number } | null = null;
  for (const path of paths) {
    if (path.length < 2) continue;
    const line = path.map((p) => toXY(p, o));
    for (let i = 0; i < line.length - 1; i++) {
      const n = nearestOnSegment([0, 0], line[i], line[i + 1]);
      if (n.d2 <= snapM * snapM && (!best || n.d2 < best.d2)) best = { line, i, q: n.q, d2: n.d2 };
    }
  }
  if (!best) {
    const h = heading(bearing ?? 0);
    return [
      [0, 0],
      [-h[0] * length, -h[1] * length],
    ];
  }
  const { line, i, q } = best;
  const seg: XY = [line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]];
  // 沿著線的哪個方向是「前進」：和行進方向同向；沒有方向就當作順著線
  const h = bearing === undefined ? seg : heading(bearing);
  const forwardIsUp = seg[0] * h[0] + seg[1] * h[1] >= 0;
  // 往後走：前進方向是往索引變大，就往索引變小的方向走
  const back = forwardIsUp ? line.slice(0, i + 1).reverse() : line.slice(i + 1);
  const pts: XY[] = [q, ...back];
  // 軌道走完還不夠長：沿最後一段方向延伸
  let total = 0;
  for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  if (total < length) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // 最後一段長度為 0（車頭剛好在端點）時，用「前進的反方向」
    const s = Math.hypot(seg[0], seg[1]) || 1;
    const sign = forwardIsUp ? -1 : 1;
    const dir: XY = d ? [(b[0] - a[0]) / d, (b[1] - a[1]) / d] : [(sign * seg[0]) / s, (sign * seg[1]) / s];
    pts.push([b[0] + dir[0] * (length - total + 1), b[1] + dir[1] * (length - total + 1)]);
  }
  return pts;
}

/** 中心線上距起點 s 公尺的點 */
function pointAt(pts: XY[], s: number): XY {
  let left = s;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= d || k === pts.length - 1) {
      const f = d ? Math.min(left / d, 1) : 0;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    left -= d;
  }
  return pts[pts.length - 1];
}

/**
 * 車廂地面外框。
 * @param scale 放大倍數（拉遠時把車放大，才看得見）
 * @param paths 這種車可以吸附的軌道線形（公車給空陣列）
 * @param snapM 離軌道多遠以內才吸附（公尺，會乘上 scale）
 */
export function carFootprints(
  head: LngLat,
  bearing: number | undefined,
  spec: CarSpec,
  scale = 1,
  paths: LngLat[][] = [],
  snapM = 150,
): CarFootprint[] {
  const len = spec.lengthM * scale;
  const gap = spec.gapM * scale;
  const half = (spec.widthM * scale) / 2;
  const total = spec.cars * len + (spec.cars - 1) * gap;
  const pts = spine(head, bearing, total, paths, snapM * Math.max(1, scale));
  const out: CarFootprint[] = [];
  for (let k = 0; k < spec.cars; k++) {
    const front = pointAt(pts, k * (len + gap));
    const rear = pointAt(pts, k * (len + gap) + len);
    const dx = front[0] - rear[0];
    const dy = front[1] - rear[1];
    const d = Math.hypot(dx, dy) || 1;
    const n: XY = [(-dy / d) * half, (dx / d) * half];
    const ring: XY[] = [
      [front[0] + n[0], front[1] + n[1]],
      [front[0] - n[0], front[1] - n[1]],
      [rear[0] - n[0], rear[1] - n[1]],
      [rear[0] + n[0], rear[1] + n[1]],
    ];
    out.push({ ring: [...ring, ring[0]].map((p) => toLngLat(p, head)), index: k });
  }
  return out;
}
