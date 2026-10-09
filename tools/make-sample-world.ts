/**
 * 產生「高雄市草稿世界」data/world/kaohsiung.sample.json。
 *
 * 用途：在資料管線（pipeline/）還沒跑之前，讓模擬與畫面可以先開發。
 * 這份資料是「草稿」：
 *   - 38 區名稱正確，但中心點、面積、人口都是約略值（人口四捨五入到千位）。
 *   - 連線用「最近鄰」自動產生，不是真實道路網。
 *   - 斷層線為示意走向，不是地調中心的正式圖資。
 * 正式資料請執行 pipeline/build_world.py，產出 data/world/kaohsiung.json 取代它。
 *
 * 執行：npm run sample-world
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { distanceKm, validateWorld, type Edge, type LonLat, type World } from '../packages/sim-core/src/index';

// [名稱, 經度, 緯度, 約略面積 km², 約略人口(千人)]
const DISTRICTS: [string, number, number, number, number][] = [
  ['楠梓區', 120.326, 22.727, 25.8, 190],
  ['左營區', 120.295, 22.687, 19.4, 200],
  ['鼓山區', 120.275, 22.648, 14.8, 140],
  ['三民區', 120.318, 22.650, 19.8, 330],
  ['鹽埕區', 120.285, 22.625, 1.4, 22],
  ['前金區', 120.295, 22.627, 1.9, 26],
  ['新興區', 120.307, 22.630, 2.0, 48],
  ['苓雅區', 120.320, 22.622, 8.2, 160],
  ['前鎮區', 120.315, 22.590, 19.1, 175],
  ['旗津區', 120.270, 22.590, 1.5, 28],
  ['小港區', 120.355, 22.555, 45.0, 155],
  ['鳳山區', 120.358, 22.627, 26.8, 350],
  ['大寮區', 120.400, 22.600, 71.0, 110],
  ['鳥松區', 120.365, 22.660, 24.6, 44],
  ['林園區', 120.395, 22.505, 32.3, 68],
  ['仁武區', 120.350, 22.700, 36.1, 93],
  ['大樹區', 120.430, 22.700, 66.9, 41],
  ['大社區', 120.355, 22.730, 26.6, 34],
  ['岡山區', 120.295, 22.795, 47.9, 97],
  ['路竹區', 120.265, 22.855, 48.4, 50],
  ['橋頭區', 120.305, 22.757, 25.9, 38],
  ['梓官區', 120.265, 22.760, 11.6, 35],
  ['彌陀區', 120.245, 22.780, 14.8, 19],
  ['永安區', 120.225, 22.820, 22.6, 14],
  ['燕巢區', 120.360, 22.795, 65.4, 29],
  ['田寮區', 120.360, 22.865, 92.7, 7],
  ['阿蓮區', 120.320, 22.880, 34.6, 27],
  ['茄萣區', 120.180, 22.905, 15.8, 29],
  ['湖內區', 120.215, 22.905, 20.2, 29],
  ['旗山區', 120.480, 22.890, 94.6, 35],
  ['美濃區', 120.540, 22.895, 120.0, 38],
  ['內門區', 120.465, 22.945, 95.6, 14],
  ['杉林區', 120.540, 22.970, 104.0, 12],
  ['甲仙區', 120.590, 23.085, 124.0, 6],
  ['六龜區', 120.635, 23.000, 194.2, 12],
  ['茂林區', 120.665, 22.890, 194.0, 2],
  ['桃源區', 120.760, 23.160, 928.0, 4],
  ['那瑪夏區', 120.700, 23.270, 252.9, 3],
];

// 示意斷層走向（約略，正式資料由 pipeline 從地調中心活動斷層圖資產生）
const FAULTS = [
  {
    id: 'chishan',
    name: '旗山斷層（示意）',
    line: [
      [120.495, 22.975],
      [120.44, 22.87],
      [120.395, 22.78],
      [120.36, 22.70],
    ] as LonLat[],
    note: '示意走向，非正式圖資',
  },
  {
    id: 'hsiaokangshan',
    name: '小岡山斷層（示意）',
    line: [
      [120.315, 22.845],
      [120.300, 22.770],
    ] as LonLat[],
    note: '示意走向，非正式圖資',
  },
];

const K_NEAREST = 4;
const ROAD_SPEED_KMH = 30; // 災時平均車速（遊戲用）

function main() {
  const regions = DISTRICTS.map(([name, lon, lat, area, popK], i) => ({
    id: `KHH-${String(i + 1).padStart(2, '0')}`,
    name,
    county: '高雄市',
    centroid: [lon, lat] as LonLat,
    areaKm2: area,
    population: popK * 1000,
    attrs: {},
  }));

  const pairs = new Set<string>();
  const edges: Edge[] = [];
  const addEdge = (a: number, b: number) => {
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    const km = distanceKm(regions[a].centroid, regions[b].centroid);
    edges.push({
      from: Math.min(a, b),
      to: Math.max(a, b),
      kind: 'road',
      capacity: 120,
      travelTicks: Math.max(1, Math.ceil(km / ROAD_SPEED_KMH)),
      lengthKm: Math.round(km * 10) / 10,
    });
  };
  regions.forEach((r, i) => {
    const near = regions
      .map((o, j) => ({ j, d: distanceKm(r.centroid, o.centroid) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, K_NEAREST);
    for (const { j } of near) addEdge(i, j);
  });
  edges.sort((a, b) => a.from - b.from || a.to - b.to);

  const world: World = {
    meta: {
      id: 'kaohsiung-sample',
      name: '高雄市（草稿世界）',
      version: 1,
      source: 'tools/make-sample-world.ts',
      note: '中心點、面積、人口為約略值；連線為最近鄰自動產生；斷層為示意。正式資料請執行 pipeline/build_world.py。',
    },
    regions,
    edges,
    faults: FAULTS,
  };

  const errors = validateWorld(world);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../data/world/kaohsiung.sample.json');
  writeFileSync(out, JSON.stringify(world, null, 1) + '\n', 'utf8');
  console.log(`寫出 ${out}：${regions.length} 區、${edges.length} 條連線`);
}

main();
