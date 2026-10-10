/**
 * 高雄市世界檔產生器（Node 版，免裝 Python）
 *   政府開放資料 → data/world/kaohsiung.json
 *
 * 用法（repo 根目錄）：
 *   npm run build-world -- --boundaries pipeline/raw/TOWN_MOI_1140318.shp
 *   npm run build-world -- --boundaries <界線.shp> --population <人口.csv> --faults <斷層.shp>
 *
 * 參數：
 *   --boundaries  鄉鎮市區界線 .shp（同名的 .dbf、.cpg 要放在旁邊）或 .geojson   必要
 *   --population  人口 CSV（村里或鄉鎮市區層級皆可）                             建議
 *   --faults      活動斷層 .shp 或 .geojson                                      建議
 *   --beds        醫院床數 CSV（欄位：district,beds）                            選用
 *   --shelters    避難收容處所 CSV（需有經度、緯度欄；全國檔也行，只留高雄）     選用
 *   --hospitals   醫院點位 CSV（需有經度、緯度欄；有病床數欄會一併讀入）         選用
 *   --out         輸出路徑，預設 data/world/kaohsiung.json
 *   --county-col / --town-col / --code-col / --pop-district-col / --pop-value-col / --fault-name-col
 *                 自動偵測不到欄位時手動指定
 *
 * 座標：經緯度與 TWD97 TM2（公尺）都接受，會自動判斷。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  areaKm2,
  bboxOf,
  decodeText,
  interiorPoint,
  looksLikeLonLat,
  openRing,
  parseCsv,
  pointInRing,
  readDbf,
  readShp,
  roundXY,
  signedAreaKm2,
  simplifyRing,
  tm2ToLonLat,
  type Ring,
  type XY,
} from '@twsim/geo';
import {
  distanceKm,
  validateWorld,
  type DataSource,
  type Edge,
  type Facility,
  type Fault,
  type Region,
  type World,
} from '@twsim/sim-core';

export const COUNTY = '高雄市';
/** 本島範圍：旗津區在行政上包含東沙、南沙，這些離島不放進遊戲地圖 */
export const MAINLAND_BBOX: [number, number, number, number] = [119.9, 22.2, 121.2, 23.6];
const SIMPLIFY_KM = 0.03;
const MIN_RING_KM2 = 0.02;
const ROAD_SPEED_KMH = 30;
const EDGE_CAPACITY = 120;

const COUNTY_COLS = ['COUNTYNAME', 'COUNTY', 'C_NAME', '縣市名稱', '縣市'];
const TOWN_COLS = ['TOWNNAME', 'TOWN', 'T_NAME', '鄉鎮市區名稱', '鄉鎮市區'];
const CODE_COLS = ['TOWNCODE', 'TOWNID', 'TOWN_ID', '鄉鎮市區代碼'];
const POP_VALUE_COLS = ['people_total', '人口數', '總人口數', 'population', 'P_CNT'];
const POP_DISTRICT_COLS = ['site_id', '區域別', '鄉鎮市區', 'district', 'TOWNNAME'];
const FAULT_NAME_COLS = ['NAME', 'FAULT_NAME', 'Fault_Name', 'FaultName', '斷層名稱', '名稱', 'C_NAME', 'CName'];

/** 斷層中文名 → 劇本用的英文 id（地震劇本以 id 指定震源） */
const KNOWN_FAULTS: [string, string][] = [
  ['小岡山', 'hsiaokangshan'],
  ['旗山', 'chishan'],
  ['鳳山', 'fengshan'],
  ['潮州', 'chaochou'],
  ['六甲', 'liuchia'],
  ['左鎮', 'tsochen'],
  ['新化', 'hsinhua'],
  ['後甲里', 'houchiali'],
  ['木屐寮', 'muchiliao'],
  ['龍船', 'lungchuan'],
  ['仁武', 'jenwu'],
];

const norm = (s: unknown) => String(s ?? '').trim().replace(/臺/g, '台');

export class InputError extends Error {}

function pickCol(cols: string[], candidates: string[], what: string, override?: string): string {
  if (override) {
    if (!cols.includes(override)) throw new InputError(`找不到你指定的${what}欄位「${override}」。實際欄位：${cols.join(', ')}`);
    return override;
  }
  const hit = candidates.find((c) => cols.includes(c));
  if (!hit) throw new InputError(`找不到${what}欄位。實際欄位：${cols.join(', ')}。請用參數指定。`);
  return hit;
}

// ---------- 讀取幾何 ----------

export interface Feature {
  props: Record<string, unknown>;
  /** 多邊形：外圈與內洞混在一起（之後依方向分辨）；線：每段一條 */
  parts: XY[][];
  kind: 'polygon' | 'line' | 'point' | 'empty';
}

export interface FileSet {
  shp?: Uint8Array;
  dbf?: Uint8Array;
  cpg?: string;
  geojson?: string;
}

export function readFeatures(files: FileSet): Feature[] {
  let feats: Feature[];
  if (files.geojson !== undefined) {
    const gj = JSON.parse(files.geojson) as { features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } | null }[] };
    feats = gj.features.map((f) => {
      const g = f.geometry;
      if (!g) return { props: f.properties ?? {}, parts: [], kind: 'empty' as const };
      switch (g.type) {
        case 'Polygon':
          return { props: f.properties, parts: g.coordinates as XY[][], kind: 'polygon' as const };
        case 'MultiPolygon':
          return { props: f.properties, parts: (g.coordinates as XY[][][]).flat(), kind: 'polygon' as const };
        case 'LineString':
          return { props: f.properties, parts: [g.coordinates as XY[]], kind: 'line' as const };
        case 'MultiLineString':
          return { props: f.properties, parts: g.coordinates as XY[][], kind: 'line' as const };
        default:
          return { props: f.properties, parts: [], kind: 'empty' as const };
      }
    });
  } else {
    if (!files.shp || !files.dbf) throw new InputError('Shapefile 需要同名的 .shp 與 .dbf');
    const shp = readShp(files.shp);
    const dbf = readDbf(files.dbf, files.cpg);
    if (shp.records.length !== dbf.rows.length) throw new InputError(`.shp 有 ${shp.records.length} 筆，.dbf 有 ${dbf.rows.length} 筆，不一致`);
    feats = shp.records.map((r, i) => ({
      props: dbf.rows[i],
      parts: r.parts,
      kind: r.type === 5 ? 'polygon' : r.type === 3 ? 'line' : r.type === 1 ? 'point' : 'empty',
    }));
  }
  // TM2 公尺座標 → 經緯度
  const all = feats.flatMap((f) => f.parts.flat());
  if (all.length && !looksLikeLonLat(bboxOf([all]))) {
    for (const f of feats) f.parts = f.parts.map((p) => p.map(([x, y]) => tm2ToLonLat(x, y)));
  }
  return feats;
}

export function loadFileSet(path: string): FileSet {
  if (/\.(geo)?json$/i.test(path)) return { geojson: readFileSync(path, 'utf8') };
  const base = path.replace(/\.shp$/i, '');
  const find = (ext: string) => [base + ext, base + ext.toUpperCase()].find(existsSync);
  const dbf = find('.dbf');
  const cpg = find('.cpg');
  return {
    shp: readFileSync(path),
    dbf: dbf ? readFileSync(dbf) : undefined,
    cpg: cpg ? readFileSync(cpg, 'utf8') : undefined,
  };
}

// ---------- 組世界 ----------

const inMainland = (p: XY) =>
  p[0] >= MAINLAND_BBOX[0] && p[0] <= MAINLAND_BBOX[2] && p[1] >= MAINLAND_BBOX[1] && p[1] <= MAINLAND_BBOX[3];

export interface BuildOptions {
  countyCol?: string;
  townCol?: string;
  codeCol?: string;
  popDistrictCol?: string;
  popValueCol?: string;
  faultNameCol?: string;
  log?: (msg: string) => void;
}

interface RawRegion {
  name: string;
  code: string;
  rawRings: Ring[];
}

export function buildRegions(features: Feature[], opt: BuildOptions = {}): RawRegion[] {
  const log = opt.log ?? (() => {});
  const cols = Object.keys(features.find((f) => f.kind === 'polygon')?.props ?? {});
  const cc = pickCol(cols, COUNTY_COLS, '縣市名稱', opt.countyCol);
  const tc = pickCol(cols, TOWN_COLS, '鄉鎮市區名稱', opt.townCol);
  const code = CODE_COLS.find((c) => cols.includes(c)) ?? opt.codeCol;

  const byName = new Map<string, RawRegion>();
  let dropped = 0;
  for (const f of features) {
    if (f.kind !== 'polygon' || norm(f.props[cc]) !== norm(COUNTY)) continue;
    const name = String(f.props[tc]).trim();
    const reg = byName.get(name) ?? { name, code: code ? String(f.props[code]).trim() : '', rawRings: [] };
    // 內洞判斷不靠繞行方向（各資料來源慣例不同）：落在同一筆資料另一個較大外框內的環就是洞
    const rings = f.parts.map(openRing).filter((r) => r.length >= 3);
    const areas = rings.map((r) => Math.abs(signedAreaKm2(r)));
    for (let k = 0; k < rings.length; k++) {
      const r = rings[k];
      const isHole = rings.some((o, m) => m !== k && areas[m] > areas[k] && pointInRing(r[0], o));
      if (isHole) continue;
      if (!r.every(inMainland)) {
        dropped++;
        continue;
      }
      reg.rawRings.push(r);
    }
    byName.set(name, reg);
  }
  if (byName.size === 0) throw new InputError(`界線檔中找不到 ${COUNTY}（縣市欄位：${cc}）`);
  if (dropped) log(`略過 ${dropped} 個本島範圍外的離島外框（東沙、南沙等）`);
  const list = [...byName.values()].filter((r) => r.rawRings.length);
  list.sort((a, b) => (a.code && b.code ? a.code.localeCompare(b.code) : a.name.localeCompare(b.name, 'zh-Hant')));
  list.forEach((r, i) => (r.code ||= `KHH-${String(i + 1).padStart(2, '0')}`));
  log(`讀入 ${list.length} 個鄉鎮市區`);
  return list;
}

/** 以「共用的原始頂點」判斷相鄰；再補線確保全部連通 */
export function buildEdges(raw: RawRegion[], centroids: XY[], log: (m: string) => void = () => {}): Edge[] {
  const owner = new Map<string, Set<number>>();
  raw.forEach((r, i) => {
    for (const ring of r.rawRings)
      for (const p of ring) {
        const k = `${p[0].toFixed(5)},${p[1].toFixed(5)}`; // 約 1 公尺
        let s = owner.get(k);
        if (!s) owner.set(k, (s = new Set()));
        s.add(i);
      }
  });
  const shared = new Map<string, number>();
  for (const s of owner.values()) {
    if (s.size < 2) continue;
    const ids = [...s];
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++) {
        const key = `${Math.min(ids[a], ids[b])}-${Math.max(ids[a], ids[b])}`;
        shared.set(key, (shared.get(key) ?? 0) + 1);
      }
  }
  const edges = new Map<string, Edge>();
  const add = (a: number, b: number, kind: Edge['kind']) => {
    const [i, j] = a < b ? [a, b] : [b, a];
    const key = `${i}-${j}`;
    if (edges.has(key)) return;
    const km = distanceKm(centroids[i], centroids[j]);
    edges.set(key, { from: i, to: j, kind, capacity: EDGE_CAPACITY, travelTicks: Math.max(1, Math.ceil(km / ROAD_SPEED_KMH)), lengthKm: Math.round(km * 10) / 10 });
  };
  for (const [key, n] of shared) {
    if (n >= 2) {
      const [a, b] = key.split('-').map(Number);
      add(a, b, 'adjacent');
    }
  }
  // 連通性：把孤立群組接到最近的區塊（例如被港口水道隔開的旗津）
  const parent = raw.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const e of edges.values()) parent[find(e.from)] = find(e.to);
  for (;;) {
    const roots = new Set(raw.map((_, i) => find(i)));
    if (roots.size <= 1) break;
    const r0 = find(0);
    let best: [number, number, number] = [-1, -1, Infinity];
    raw.forEach((_, i) => {
      if (find(i) !== r0) return;
      raw.forEach((__, j) => {
        if (find(j) === r0) return;
        const d = distanceKm(centroids[i], centroids[j]);
        if (d < best[2]) best = [i, j, d];
      });
    });
    log(`補連線：${raw[best[0]].name} ↔ ${raw[best[1]].name}（原本不相鄰）`);
    add(best[0], best[1], 'road');
    parent[find(best[0])] = find(best[1]);
  }
  return [...edges.values()].sort((a, b) => a.from - b.from || a.to - b.to);
}

export function readPopulation(csvText: string, names: string[], opt: BuildOptions = {}): Map<string, number> {
  const log = opt.log ?? (() => {});
  const rows = parseCsv(csvText);
  const header = rows[0].map((h) => h.trim());
  const vc = header.indexOf(pickCol(header, POP_VALUE_COLS, '人口數', opt.popValueCol));
  const dc = header.indexOf(pickCol(header, POP_DISTRICT_COLS, '行政區', opt.popDistrictCol));
  const county = norm(COUNTY);
  const data = rows
    .slice(1)
    .map((r) => ({ d: norm(r[dc]), v: Number(String(r[vc] ?? '').replace(/,/g, '')) }))
    .filter((r) => Number.isFinite(r.v) && r.d !== '')
    // 有寫縣市的列只留高雄市；沒寫縣市的列（已是單一縣市的檔案）全部保留
    .filter((r) => r.d.includes(county) || !/[市縣]/.test(r.d.replace(/區$/, '').slice(0, 3)));
  const out = new Map<string, number>();
  for (const name of names) {
    const n = norm(name);
    let sum = data.filter((r) => r.d === n || r.d.endsWith(n)).reduce((s, r) => s + r.v, 0);
    if (sum === 0) sum = data.filter((r) => r.d.includes(n)).reduce((s, r) => s + r.v, 0);
    if (sum === 0) log(`[警告] 人口檔找不到 ${name}`);
    out.set(name, sum);
  }
  log(`人口合計 ${[...out.values()].reduce((a, b) => a + b, 0).toLocaleString('zh-TW')} 人`);
  return out;
}

export function readBeds(csvText: string): Map<string, number> {
  const rows = parseCsv(csvText);
  const header = rows[0].map((h) => h.trim());
  const nc = header.indexOf(pickCol(header, ['district', '鄉鎮市區', '行政區'], '行政區'));
  const bc = header.indexOf(pickCol(header, ['beds', '病床數', '總病床數'], '病床數'));
  return new Map(rows.slice(1).map((r) => [String(r[nc]).trim(), Number(r[bc])]));
}

const FAC_NAME_COLS = ['避難收容處所名稱', '收容處所名稱', '醫院名稱', '機構名稱', '醫事機構名稱', '名稱', 'name', 'NAME'];
const FAC_LON_COLS = ['經度', 'lon', 'lng', 'longitude', 'Longitude', 'LON', 'X', 'x', 'TWD97X', 'TWD97_X'];
const FAC_LAT_COLS = ['緯度', 'lat', 'latitude', 'Latitude', 'LAT', 'Y', 'y', 'TWD97Y', 'TWD97_Y'];
const FAC_CAP_COLS = ['預計收容人數', '收容人數', '可收容人數', '總病床數', '病床數', 'capacity', 'beds'];
/** 點位不在任何區的外框內時（簡化外框在海岸邊會差幾十公尺），改歸到這個距離內最近的區 */
const FAC_SNAP_KM = 2;

/**
 * 讀設施點 CSV（避難收容處所、醫院）→ 只留落在高雄各區內的點。
 * 座標可為經緯度或 TWD97 TM2；名稱、經緯度、容量欄位自動偵測。
 */
export function readFacilities(csvText: string, kind: string, regions: Region[], opt: BuildOptions = {}): Facility[] {
  const log = opt.log ?? (() => {});
  const rows = parseCsv(csvText).filter((r) => r.some((c) => c.trim()));
  const header = rows[0].map((h) => h.trim());
  const what = kind === 'shelter' ? '避難收容處所' : '醫院';
  const col = (cands: string[], label: string, optional = false) => {
    const hit = cands.find((c) => header.includes(c));
    if (!hit && !optional) throw new InputError(`${what}檔找不到${label}欄位。實際欄位：${header.join(', ')}`);
    return hit ? header.indexOf(hit) : -1;
  };
  const [nc, xc, yc, cc] = [col(FAC_NAME_COLS, '名稱'), col(FAC_LON_COLS, '經度'), col(FAC_LAT_COLS, '緯度'), col(FAC_CAP_COLS, '容量', true)];
  const out: Facility[] = [];
  let skipped = 0;
  for (const r of rows.slice(1)) {
    let x = Number(r[xc]);
    let y = Number(r[yc]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) {
      skipped++;
      continue;
    }
    if (!looksLikeLonLat([x, y, x, y])) [x, y] = tm2ToLonLat(x, y);
    const at = roundXY([x, y]) as [number, number];
    let region = regions.findIndex((g) => (g.polygon ?? []).some((ring) => pointInRing(at, ring)));
    if (region < 0) {
      const near = regions
        .map((g, i) => ({ i, d: distanceKm(at, g.centroid) }))
        .filter((c) => c.d <= FAC_SNAP_KM)
        .sort((a, b) => a.d - b.d)[0];
      if (!near) continue; // 高雄以外
      region = near.i;
    }
    const cap = cc >= 0 ? Number(String(r[cc]).replace(/,/g, '')) : Number.NaN;
    out.push({
      kind,
      name: String(r[nc] ?? '').trim() || `${what} ${out.length + 1}`,
      at,
      region,
      ...(Number.isFinite(cap) && cap >= 0 ? { capacity: cap } : {}),
    });
  }
  if (skipped) log(`[提醒] ${what}檔有 ${skipped} 筆沒有座標，已略過`);
  log(`納入 ${out.length} 處${what}`);
  return out;
}

export function buildFaults(features: Feature[], opt: BuildOptions = {}): Fault[] {
  const log = opt.log ?? (() => {});
  const cols = Object.keys(features[0]?.props ?? {});
  const nc = opt.faultNameCol ?? FAULT_NAME_COLS.find((c) => cols.includes(c));
  const near = (p: XY) =>
    p[0] >= MAINLAND_BBOX[0] - 0.1 && p[0] <= MAINLAND_BBOX[2] + 0.1 && p[1] >= MAINLAND_BBOX[1] - 0.1 && p[1] <= MAINLAND_BBOX[3] + 0.1;
  const used = new Map<string, number>();
  const faults: Fault[] = [];
  features.forEach((f, i) => {
    if (f.kind !== 'line') return;
    const name = nc ? String(f.props[nc]).trim() : `斷層 ${i + 1}`;
    for (const part of f.parts) {
      if (part.length < 2 || !part.some(near)) continue;
      const base = KNOWN_FAULTS.find(([zh]) => name.includes(zh))?.[1] ?? `fault-${i + 1}`;
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      faults.push({ id: n === 1 ? base : `${base}-${n}`, name, line: part.map((p) => roundXY(p)) });
    }
  });
  if (!nc) log(`[警告] 斷層檔找不到名稱欄位（實際欄位：${cols.join(', ')}），請用 --fault-name-col 指定`);
  log(`納入 ${faults.length} 段斷層：${[...new Set(faults.map((f) => `${f.name}(${f.id})`))].join('、')}`);
  return faults;
}

export interface BuildInputs {
  boundaries: Feature[];
  populationCsv?: string;
  faults?: Feature[];
  bedsCsv?: string;
  sheltersCsv?: string;
  hospitalsCsv?: string;
  sourceNote: string;
  /** 資料來源清單（寫進 meta.sources，給「關於」頁顯示） */
  sources?: DataSource[];
  /** 產生日期 YYYY-MM-DD */
  builtAt?: string;
  /** 沒有人口檔時改用的約略人口（依區名對應，通常取自草稿世界） */
  fallbackPopulation?: Map<string, number>;
  /** 沒有斷層檔時改用的示意斷層 */
  fallbackFaults?: Fault[];
}

export function buildWorld(inp: BuildInputs, opt: BuildOptions = {}): World {
  const log = opt.log ?? (() => {});
  const raw = buildRegions(inp.boundaries, opt);
  const names = raw.map((r) => r.name);
  let pop = new Map<string, number>();
  if (inp.populationCsv) pop = readPopulation(inp.populationCsv, names, opt);
  else if (inp.fallbackPopulation) {
    pop = inp.fallbackPopulation;
    log('[提醒] 沒有人口檔，暫用草稿世界的約略人口（四捨五入到千位）');
  } else log('[警告] 沒有人口檔，人口全部為 0（遊戲可跑，但不會有受困者）');
  const beds = inp.bedsCsv ? readBeds(inp.bedsCsv) : new Map<string, number>();

  const regions: Region[] = raw.map((r) => {
    const rings = r.rawRings
      .map((ring) => simplifyRing(ring, SIMPLIFY_KM).map((p) => roundXY(p)))
      .filter((ring) => ring.length >= 3 && Math.abs(signedAreaKm2(ring)) >= MIN_RING_KM2);
    const usable = rings.length ? rings : [r.rawRings[0].map((p) => roundXY(p))];
    const attrs: Record<string, number> = {};
    if (beds.has(r.name)) attrs.hospitalBeds = beds.get(r.name)!;
    return {
      id: r.code,
      name: r.name,
      county: COUNTY,
      centroid: roundXY(interiorPoint(usable)),
      areaKm2: Math.round(areaKm2(r.rawRings) * 100) / 100,
      population: pop.get(r.name) ?? 0,
      attrs,
      polygon: usable,
    };
  });
  const edges = buildEdges(raw, regions.map((r) => r.centroid), log);
  let faults: Fault[] = [];
  if (inp.faults) faults = buildFaults(inp.faults, opt);
  else if (inp.fallbackFaults) {
    faults = inp.fallbackFaults;
    log('[提醒] 沒有斷層檔，暫用草稿世界的示意斷層');
  } else log('[警告] 沒有斷層檔，地震劇本會退回以第一個區塊為震源');

  const facilities = [
    ...(inp.hospitalsCsv ? readFacilities(inp.hospitalsCsv, 'hospital', regions, opt) : []),
    ...(inp.sheltersCsv ? readFacilities(inp.sheltersCsv, 'shelter', regions, opt) : []),
  ];

  const world: World = {
    meta: {
      id: 'kaohsiung',
      name: COUNTY,
      version: 1,
      source: 'pipeline/build-world.ts',
      note: inp.sourceNote,
      ...(inp.builtAt ? { builtAt: inp.builtAt } : {}),
      ...(inp.sources ? { sources: inp.sources } : {}),
    },
    regions,
    edges,
    faults,
    ...(facilities.length ? { facilities } : {}),
  };
  const errors = validateWorld(world);
  if (errors.length) throw new InputError(`產出的世界檔沒通過檢查：\n${errors.join('\n')}`);
  return world;
}

// ---------- CLI ----------

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] ?? '';
  }
  return out;
}

const FILE_ARGS = ['boundaries', 'population', 'faults', 'beds', 'shelters', 'hospitals'];

/**
 * 執行前先確認輸入檔都存在；找不到時回傳中文說明，並列出資料夾裡實際有的資料檔，
 * 方便直接複製正確檔名。全部都在就回傳 null。
 */
export function checkInputFiles(a: Record<string, string>, rawDir: string): string | null {
  const missing = FILE_ARGS.filter((k) => a[k] !== undefined && !existsSync(a[k]));
  if (!missing.length) return null;
  let files: string[] = [];
  try {
    files = readdirSync(rawDir).filter((f) => /\.(shp|csv|geojson|json)$/i.test(f));
  } catch {
    // 資料夾不存在
  }
  return [
    '找不到這些檔案：',
    ...missing.map((k) => `  --${k} ${a[k]}`),
    '',
    files.length ? `${rawDir} 裡目前有：` : `${rawDir} 裡沒有任何 .shp／.csv 檔，請先把下載的資料解壓縮到這裡。`,
    ...files.map((f) => `  ${f}`),
    '',
    '請把指令裡的檔名換成上面實際的檔名（路徑可寫成 pipeline\\raw\\檔名）。',
  ].join('\n');
}

const GOV_LICENSE = '政府資料開放授權條款－第 1 版';

/**
 * 依輸入檔產生資料來源清單（ROADMAP 2.4）。版本優先從檔名裡的民國日期讀出，
 * 例如 TOWN_MOI_1140318 → 2025-03-18。
 */
export function describeSources(a: {
  boundaries: string;
  population?: string;
  faults?: string;
  beds?: string;
  shelters?: string;
  hospitals?: string;
}): DataSource[] {
  const file = (p: string) => basename(p);
  const list: DataSource[] = [
    {
      role: '行政區界線',
      name: '鄉鎮市區界線（TWD97 經緯度）',
      publisher: '內政部國土測繪中心',
      file: file(a.boundaries),
      version: rocDateIn(a.boundaries),
      license: GOV_LICENSE,
      url: 'https://data.gov.tw/dataset/7441',
    },
  ];
  list.push(
    a.population
      ? {
          role: '人口',
          name: '村里戶數、單一年齡人口',
          publisher: '內政部戶政司',
          file: file(a.population),
          version: rocDateIn(a.population),
          license: GOV_LICENSE,
          url: 'https://data.gov.tw/',
        }
      : { role: '人口', name: '草稿約略值', publisher: '本專案', license: '—', draft: true },
  );
  list.push(
    a.faults
      ? {
          role: '活動斷層',
          name: '活動斷層分布',
          publisher: '經濟部地質調查及礦業管理中心',
          file: file(a.faults),
          version: rocDateIn(a.faults),
          license: GOV_LICENSE,
          url: 'https://data.gov.tw/',
        }
      : { role: '活動斷層', name: '示意斷層（位置約略）', publisher: '本專案', license: '—', draft: true },
  );
  if (a.shelters) {
    list.push({
      role: '避難收容處所',
      name: '避難收容處所點位',
      publisher: '內政部消防署',
      file: file(a.shelters),
      version: rocDateIn(a.shelters),
      license: GOV_LICENSE,
      url: 'https://data.gov.tw/',
    });
  }
  if (a.hospitals) {
    list.push({ role: '醫院', name: '醫院點位（自行整理）', publisher: '衛生福利部', file: file(a.hospitals), version: rocDateIn(a.hospitals), license: GOV_LICENSE });
  }
  if (a.beds) {
    list.push({ role: '醫院病床', name: '醫療機構病床數（自行整理）', publisher: '衛生福利部', file: file(a.beds), license: GOV_LICENSE });
  }
  return list;
}

/** 檔名裡的 7 位數民國日期（例如 1140318）→ 西元 YYYY-MM-DD；沒有就回傳 undefined */
export function rocDateIn(path: string): string | undefined {
  const m = basename(path).match(/(?<!\d)(\d{3})(\d{2})(\d{2})(?!\d)/);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]) + 1911, Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const a = parseArgs(process.argv.slice(2));
  if (!a.boundaries) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
    process.exit(1);
  }
  const problem = checkInputFiles(a, resolve(root, 'pipeline', 'raw'));
  if (problem) {
    console.error(`\n[錯誤] ${problem}`);
    process.exit(1);
  }
  for (const k of ['boundaries', 'faults']) {
    if (a[k]?.toLowerCase().endsWith('.shp') && !existsSync(a[k].replace(/\.shp$/i, '.dbf'))) {
      console.log(`[提醒] ${a[k]} 旁邊沒有同名的 .dbf，會讀不到名稱欄位；請把壓縮檔裡的所有檔案一起解壓縮`);
    }
  }
  const opt: BuildOptions = {
    countyCol: a['county-col'],
    townCol: a['town-col'],
    codeCol: a['code-col'],
    popDistrictCol: a['pop-district-col'],
    popValueCol: a['pop-value-col'],
    faultNameCol: a['fault-name-col'],
    log: (m) => console.log(m),
  };
  const out = resolve(root, a.out ?? 'data/world/kaohsiung.json');
  const samplePath = resolve(root, 'data/world/kaohsiung.sample.json');
  const sample = existsSync(samplePath) ? (JSON.parse(readFileSync(samplePath, 'utf8')) as World) : null;
  try {
    const world = buildWorld(
      {
        boundaries: readFeatures(loadFileSet(a.boundaries)),
        populationCsv: a.population ? decodeText(readFileSync(a.population)) : undefined,
        faults: a.faults ? readFeatures(loadFileSet(a.faults)) : undefined,
        bedsCsv: a.beds ? decodeText(readFileSync(a.beds)) : undefined,
        sheltersCsv: a.shelters ? decodeText(readFileSync(a.shelters)) : undefined,
        hospitalsCsv: a.hospitals ? decodeText(readFileSync(a.hospitals)) : undefined,
        sourceNote: `界線：${basename(a.boundaries)}；人口：${a.population ? basename(a.population) : '草稿約略值'}；斷層：${a.faults ? basename(a.faults) : '草稿示意'}`,
        sources: describeSources({ ...a, boundaries: a.boundaries }),
        builtAt: new Date().toISOString().slice(0, 10),
        fallbackPopulation: sample ? new Map(sample.regions.map((r) => [r.name, r.population])) : undefined,
        fallbackFaults: sample?.faults,
      },
      opt,
    );
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(world), 'utf8');
    const kb = Math.round(Buffer.byteLength(JSON.stringify(world)) / 1024);
    console.log(`\n寫出 ${out}`);
    console.log(`${world.regions.length} 區、${world.edges.length} 條連線、${world.faults.length} 段斷層、${world.facilities?.length ?? 0} 處設施，${kb} KB`);
    if (world.faults.length && !world.faults.some((f) => f.id === 'chishan')) {
      console.log('[提醒] 地震劇本預設震源 id 為 chishan，請改 packages/rules-game/src/earthquake/config.ts 的 faultId');
    }
  } catch (e) {
    if (e instanceof InputError) {
      console.error(`\n[錯誤] ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
