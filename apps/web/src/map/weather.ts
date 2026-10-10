import type { Feature, FeatureCollection } from 'geojson';
import type { CloudSpec, RainSpec } from './config';

/**
 * 天氣效果的畫法（只負責畫面）：
 * - 雲：一朵雲由幾團「雲團」組成，每團是一個多邊形，交給 MapView 畫成懸空的立體雲朵與地面雲影。
 * - 雨：疊在地圖上方的畫布，畫斜斜落下的雨絲（螢幕座標，跟鏡頭無關）。
 */

type LngLat = [number, number];
type Bounds = [[number, number], [number, number]];

/** 一團雲：相對雲中心的外形（公里）、雲底、雲頂（公尺） */
interface Puff {
  ring: [number, number][];
  base: number;
  top: number;
  /** 最下層（最寬） */
  ground: boolean;
}

/** 雲團的分層：[半徑比例, 高度比例]，由下往上 */
const TIERS: [number, number][] = [
  [1, 0.45],
  [0.78, 0.78],
  [0.48, 1],
];

interface Cloud {
  /** 起始位置（公里，從範圍西南角算） */
  x: number;
  y: number;
  puffs: Puff[];
  /** 雲影外形：所有雲團最下層的外包多邊形（一朵雲一塊影子，重疊處才不會變深） */
  shadow: [number, number][];
}

const KM_PER_DEG_LAT = 110.57;

/** 可重現的亂數（mulberry32） */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 雲場：依種子產生固定的雲朵分布，offset 隨時間增加讓雲飄移，超出範圍就從另一邊繞回。
 */
export class CloudField {
  private clouds: Cloud[] = [];
  private widthKm: number;
  private heightKm: number;
  private kmPerDegLng: number;

  constructor(private bounds: Bounds, spec: CloudSpec, segments: number, seed: number) {
    const [[w, s], [e, n]] = bounds;
    this.kmPerDegLng = 111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180);
    this.widthKm = (e - w) * this.kmPerDegLng;
    this.heightKm = (n - s) * KM_PER_DEG_LAT;
    const r = rng(seed);
    const between = ([lo, hi]: [number, number]) => lo + (hi - lo) * r();
    const ring = (cx: number, cy: number, radius: number): [number, number][] => {
      const turn = r() * Math.PI * 2;
      const pts: [number, number][] = [];
      for (let k = 0; k <= segments; k++) {
        const a = turn + ((k % segments) / segments) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
      }
      return pts;
    };
    // 每團雲疊三層（下寬上窄），遠看像圓頂的低多邊形雲朵
    const tiers = (cx: number, cy: number, radius: number, top: number): Puff[] =>
      TIERS.map(([scale, height], k) => ({
        ring: ring(cx, cy, radius * scale),
        base: spec.baseM,
        top: spec.baseM + (top - spec.baseM) * height,
        ground: k === 0,
      }));
    for (let i = 0; i < spec.count; i++) {
      const size = between(spec.sizeKm);
      const top = between(spec.topM);
      // 中間一團最大最高，周圍幾團較小較矮；雲底齊平（積雲的平底）
      const puffs = tiers(0, 0, size * 0.3, top);
      const extra = 3 + Math.floor(r() * 4);
      for (let k = 0; k < extra; k++) {
        const a = r() * Math.PI * 2;
        const d = size * (0.18 + r() * 0.24);
        const radius = size * (0.15 + r() * 0.13);
        const h = spec.baseM + (top - spec.baseM) * (0.45 + r() * 0.4);
        // 雲朵橫向拉長一點
        puffs.push(...tiers(Math.cos(a) * d * 1.3, Math.sin(a) * d * 0.8, radius, h));
      }
      const outline = hull(puffs.filter((p) => p.ground).flatMap((p) => p.ring));
      this.clouds.push({ x: r() * this.widthKm, y: r() * this.heightKm, puffs, shadow: outline });
    }
  }

  /**
   * 目前的雲（GeoJSON）。drift：已飄移的距離（公里，[東, 北]）；
   * shadow：給了就是雲影（每朵雲一塊），值是雲影相對雲的偏移（公里，[東, 北]）。
   */
  features(drift: [number, number], shadow?: [number, number]): FeatureCollection {
    const [[w, s]] = this.bounds;
    const wrap = (v: number, m: number) => ((v % m) + m) % m;
    const features: Feature[] = [];
    for (const c of this.clouds) {
      const cx = wrap(c.x + drift[0], this.widthKm) + (shadow?.[0] ?? 0);
      const cy = wrap(c.y + drift[1], this.heightKm) + (shadow?.[1] ?? 0);
      const lat = s + cy / KM_PER_DEG_LAT;
      const lng = w + cx / this.kmPerDegLng;
      const polygon = (ring: [number, number][], properties: Record<string, number>): Feature => ({
        type: 'Feature',
        properties,
        geometry: {
          type: 'Polygon',
          coordinates: [ring.map(([dx, dy]): LngLat => [lng + dx / this.kmPerDegLng, lat + dy / KM_PER_DEG_LAT])],
        },
      });
      if (shadow) features.push(polygon(c.shadow, {}));
      else for (const p of c.puffs) features.push(polygon(p.ring, { base: p.base, top: p.top }));
    }
    return { type: 'FeatureCollection', features };
  }
}

/** 凸包（monotone chain），回傳頭尾相接的外圈 */
function hull(points: [number, number][]): [number, number][] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const out: [number, number][] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  const ring = [...half(pts), ...half([...pts].reverse())];
  return [...ring, ring[0]];
}

interface Drop {
  /** 位置（0–1，畫面比例） */
  x: number;
  y: number;
  len: number;
  speed: number;
  /** 0 = 遠（淡、細）、1 = 近 */
  near: number;
}

/**
 * 雨絲畫布：放在地圖畫布正上方、控制按鈕底下，不擋滑鼠。
 * 系統設定「減少動態效果」時只畫一張靜止的雨；省電模式雨絲減半。
 */
export class RainOverlay {
  readonly canvas: HTMLCanvasElement;
  private spec: RainSpec | null = null;
  private drops: Drop[] = [];
  private frame = 0;
  private last = 0;
  private still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(container: HTMLElement, private lowPower: boolean) {
    const canvas = document.createElement('canvas');
    canvas.className = 'weather-rain';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.hidden = true;
    const controls = container.querySelector('.maplibregl-control-container');
    container.insertBefore(canvas, controls);
    this.canvas = canvas;
    addEventListener('resize', () => this.spec && this.resize());
  }

  set(spec: RainSpec | null) {
    this.spec = spec;
    cancelAnimationFrame(this.frame);
    this.canvas.hidden = !spec;
    if (!spec) return;
    this.resize();
    this.last = performance.now();
    if (this.still) this.draw();
    else this.frame = requestAnimationFrame(this.tick);
  }

  private resize() {
    const spec = this.spec!;
    const dpr = Math.min(devicePixelRatio, this.lowPower ? 1 : 1.5);
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const count = Math.round(((w * h) / 10000) * spec.density * (this.lowPower ? 0.5 : 1));
    const r = rng(7);
    const between = ([lo, hi]: [number, number], t: number) => lo + (hi - lo) * t;
    this.drops = Array.from({ length: count }, () => {
      const near = r();
      return { x: r(), y: r(), near, len: between(spec.lengthPx, near), speed: between(spec.speedPx, near * 0.7 + r() * 0.3) };
    });
    if (this.still) this.draw();
  }

  private tick = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const h = this.canvas.clientHeight || 1;
    const w = this.canvas.clientWidth || 1;
    const slant = this.spec!.slant;
    for (const d of this.drops) {
      const dy = (d.speed * dt) / h;
      d.y += dy;
      d.x += (dy * h * slant) / w;
      if (d.y > 1.05) {
        d.y -= 1.1;
        d.x = (d.x + 0.37) % 1;
      }
      if (d.x > 1) d.x -= 1;
    }
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  };

  private draw() {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.paint(g, this.canvas.width, this.canvas.height);
  }

  /** 把雨絲疊畫在 g 上（截圖時也用這個把雨畫進圖片） */
  paint(g: CanvasRenderingContext2D, width: number, height: number) {
    const spec = this.spec;
    if (!spec) return;
    const scale = width / (this.canvas.clientWidth || width);
    g.fillStyle = spec.veil;
    g.fillRect(0, 0, width, height);
    g.lineCap = 'round';
    g.strokeStyle = spec.color;
    // 遠近分兩批畫：遠的細而淡，近的粗而亮
    for (const [lo, hi, alpha, lineWidth] of [
      [0, 0.6, spec.alpha * 0.55, 1],
      [0.6, 1.01, spec.alpha, 1.6],
    ] as const) {
      g.globalAlpha = alpha;
      g.lineWidth = lineWidth * scale;
      g.beginPath();
      for (const d of this.drops) {
        if (d.near < lo || d.near >= hi) continue;
        const x = d.x * width;
        const y = d.y * height;
        const len = d.len * scale;
        g.moveTo(x, y);
        g.lineTo(x - len * spec.slant, y - len);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
}
