import type { World } from '@twsim/sim-core';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 載入畫面的高雄剪影（ROADMAP 1.6）：用世界檔的行政區外框畫成 SVG，
 * 載入進度由左往右把剪影「填滿」。地圖還沒出來前就能顯示，不需要網路。
 */
export function drawSilhouette(svg: SVGSVGElement, world: World) {
  const rings = world.regions.flatMap((r) => r.polygon ?? []);
  if (!rings.length) return null;

  // 等距圓柱投影，經度依緯度縮放，形狀才不會被壓扁
  const pts = rings.flat();
  const midLat = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * kx);
  const ys = pts.map((p) => -p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const [w, h] = [Math.max(...xs) - x0, Math.max(...ys) - y0];
  const scale = 1000 / Math.max(w, h);
  const d = rings
    .map(
      (ring) =>
        'M' +
        ring
          .map(([lng, lat]) => `${((lng * kx - x0) * scale).toFixed(1)},${((-lat - y0) * scale).toFixed(1)}`)
          .join('L') +
        'Z',
    )
    .join('');

  svg.setAttribute('viewBox', `-10 -10 ${(w * scale + 20).toFixed(0)} ${(h * scale + 20).toFixed(0)}`);
  const el = (tag: string, attrs: Record<string, string>) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };
  const clip = el('clipPath', { id: 'loading-clip' });
  const fillRect = el('rect', { x: '-10', y: '-10', width: '0', height: String(h * scale + 20) });
  clip.append(fillRect);
  svg.replaceChildren(
    el('defs', {}),
    el('path', { d, class: 'shape-empty' }),
    el('path', { d, class: 'shape-fill', 'clip-path': 'url(#loading-clip)' }),
  );
  svg.firstElementChild!.append(clip);

  const fullWidth = w * scale + 20;
  return (fraction: number) => fillRect.setAttribute('width', String(Math.max(0, Math.min(1, fraction)) * fullWidth));
}
