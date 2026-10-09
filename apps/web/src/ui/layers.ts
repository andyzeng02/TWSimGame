import type { Snapshot, World } from '@twsim/sim-core';

/** 地圖圖層：把模擬狀態換成每區 0（平靜）– 1（危急）的嚴重度；null = 不著色 */
export interface Layer {
  id: string;
  label: string;
  severity(world: World, s: Snapshot): number[] | null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export const LAYERS: Layer[] = [
  {
    id: 'trapped',
    label: '受困人口',
    severity: (w, s) =>
      s.vars.trapped.map((t, i) => clamp01(Math.log10(1 + (t / Math.max(w.regions[i].population, 1)) * 1e5) / 2.5)),
  },
  {
    id: 'medical',
    label: '醫療餘裕',
    severity: (_w, s) => s.vars.injured.map((inj, i) => clamp01((inj - s.vars.bedsFree[i]) / 60 + 0.3)),
  },
  {
    id: 'supplies',
    label: '物資存量',
    severity: (_w, s) => s.vars.supplies.map((d) => clamp01(1 - d / 1.2)),
  },
  {
    id: 'order',
    label: '社會秩序',
    severity: (_w, s) => s.vars.order.map((o) => clamp01((1 - o) * 1.6)),
  },
  {
    id: 'intensity',
    label: '震度',
    severity: (_w, s) => s.vars.intensity.map((x) => clamp01((x - 2) / 4.5)),
  },
  {
    id: 'none',
    label: '純地圖',
    severity: () => null,
  },
];
