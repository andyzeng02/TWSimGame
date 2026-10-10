/**
 * TDX（交通部運輸資料流通服務）回應 → 統一交通格式。
 *
 * 這裡只做格式轉換，不連網路；連線與金鑰由伺服器（apps/server）處理。
 * TDX 不同版本的回應有時是陣列、有時包在物件裡（例如 { Stations: [...] }），兩種都接受。
 * 欄位缺漏或座標不合理的資料直接略過，不會讓整批失敗。
 */
import type { Arrival, CongestionLevel, LngLat, RoadSegment, Station, TrafficMode, TransitLine, Vehicle } from './types';

type Json = Record<string, unknown>;

/** 高雄市與周邊（含屏東、臺南交界）的經緯度範圍，用來過濾全臺資料（例如臺鐵） */
export const KAOHSIUNG_BBOX: [number, number, number, number] = [120.1, 22.45, 120.95, 23.3];

/** 路段速限換算壅塞程度的門檻（公里／小時）：≥ smooth 順暢，≥ busy 車多，其餘壅塞 */
export interface CongestionThresholds {
  smooth: number;
  busy: number;
}
export const DEFAULT_THRESHOLDS: CongestionThresholds = { smooth: 30, busy: 15 };

/** 官方路線顏色（TDX 沒給顏色時使用） */
export const LINE_COLORS: Record<string, string> = {
  R: '#e2231a',
  O: '#f8981d',
  C: '#7cc142',
};

export function rows(json: unknown, key?: string): Json[] {
  if (Array.isArray(json)) return json.filter(isObj);
  if (isObj(json) && key && Array.isArray(json[key])) return (json[key] as unknown[]).filter(isObj);
  return [];
}

function isObj(x: unknown): x is Json {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function str(x: unknown): string {
  if (typeof x === 'string') return x;
  if (typeof x === 'number') return String(x);
  return '';
}

function num(x: unknown): number | undefined {
  const n = typeof x === 'string' ? Number(x) : x;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/** { Zh_tw, En } 或純字串 → 中文名稱 */
export function zh(x: unknown): string {
  if (isObj(x)) return str(x.Zh_tw) || str(x.En);
  return str(x);
}

/** { PositionLon, PositionLat } → [經度, 緯度]；座標不在臺灣附近就回傳 null */
export function position(x: unknown): LngLat | null {
  if (!isObj(x)) return null;
  const lng = num(x.PositionLon);
  const lat = num(x.PositionLat);
  if (lng === undefined || lat === undefined) return null;
  if (lng < 118 || lng > 123 || lat < 21 || lat > 26.5) return null;
  return [lng, lat];
}

export function inBbox([lng, lat]: LngLat, b = KAOHSIUNG_BBOX): boolean {
  return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3];
}

/** WKT 的 LINESTRING／MULTILINESTRING → 線段陣列；看不懂的格式回傳空陣列 */
export function parseWktLines(wkt: string): LngLat[][] {
  const m = /^\s*(MULTI)?LINESTRING\s*\((.*)\)\s*$/is.exec(wkt);
  if (!m) return [];
  const body = m[2];
  const parts = m[1] ? body.split(/\)\s*,\s*\(/).map((s) => s.replace(/[()]/g, '')) : [body];
  return parts
    .map((part) =>
      part
        .split(',')
        .map((pair) => pair.trim().split(/\s+/).map(Number))
        .filter((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .map((p) => [p[0], p[1]] as LngLat),
    )
    .filter((line) => line.length >= 2);
}

// ---------- 公車 ----------

/** 公車動態定時資料（A1，RealTimeByFrequency）→ 車輛 */
export function busVehicles(json: unknown): Vehicle[] {
  const out: Vehicle[] = [];
  for (const r of rows(json, 'BusA1Data')) {
    const at = position(r.BusPosition);
    const plate = str(r.PlateNumb);
    if (!at || !plate || plate === '-1') continue;
    const route = zh(r.RouteName) || zh(r.SubRouteName) || str(r.RouteID);
    const dir = num(r.Direction);
    out.push({
      id: `bus:${plate}`,
      mode: 'bus',
      line: route,
      label: plate,
      at,
      bearing: num(r.Azimuth),
      speedKmh: num(r.Speed),
      status: dir === 0 ? '去程' : dir === 1 ? '返程' : undefined,
      time: str(r.GPSTime) || undefined,
    });
  }
  return out;
}

// ---------- 捷運、輕軌 ----------

/** 捷運／輕軌車站 */
export function metroStations(json: unknown, mode: TrafficMode): Station[] {
  const out: Station[] = [];
  for (const r of rows(json, 'Stations')) {
    const at = position(r.StationPosition);
    const id = str(r.StationID);
    if (!at || !id) continue;
    out.push({ id: `${mode}:${id}`, mode, name: zh(r.StationName), at });
  }
  return out;
}

/** 捷運／輕軌路線線形（Shape）＋路線資料（Line，選用，用來取官方顏色與名稱） */
export function metroLines(shapeJson: unknown, mode: TrafficMode, lineJson?: unknown): TransitLine[] {
  const info = new Map<string, { name: string; color?: string }>();
  for (const r of rows(lineJson, 'Lines')) {
    const color = str(r.LineColor);
    info.set(str(r.LineID), { name: zh(r.LineName), color: /^#[0-9a-f]{6}$/i.test(color) ? color : undefined });
  }
  const out: TransitLine[] = [];
  for (const r of rows(shapeJson, 'Shapes')) {
    const id = str(r.LineID) || str(r.LineNo);
    const path = parseWktLines(str(r.Geometry));
    if (!id || !path.length) continue;
    const meta = info.get(id);
    out.push({
      id: `${mode}:${id}`,
      mode,
      name: meta?.name || zh(r.LineName) || id,
      color: meta?.color ?? LINE_COLORS[id] ?? (mode === 'lightrail' ? LINE_COLORS.C : '#555555'),
      path,
    });
  }
  return out;
}

/**
 * 捷運／輕軌即時到離站（LiveBoard）→ 每站的到站資訊。
 * 回傳 Map：車站 id（含 mode 前綴）→ 到站列表（依分鐘排序）。
 */
export function metroArrivals(json: unknown, mode: TrafficMode): Map<string, Arrival[]> {
  const out = new Map<string, Arrival[]>();
  for (const r of rows(json, 'LiveBoards')) {
    const station = str(r.StationID);
    const minutes = num(r.EstimateTime);
    if (!station || minutes === undefined || minutes < 0) continue;
    const toward = zh(r.DestinationStationName) || str(r.TripHeadSign).replace(/^往/, '') || undefined;
    const line = zh(r.LineName) || str(r.LineID) || str(r.LineNO);
    const key = `${mode}:${station}`;
    const list = out.get(key) ?? [];
    list.push({ line, toward, minutes });
    out.set(key, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.minutes - b.minutes);
  return out;
}

/**
 * 由到站資訊推估列車位置：1 分鐘內到站的列車畫在該站。
 * 捷運沒有公開列車 GPS，這是「即將進站的列車」而不是精確位置。
 */
export function trainsNearStations(stations: Station[], arrivals: Map<string, Arrival[]>, lines: TransitLine[] = []): Vehicle[] {
  const colorByName = new Map(lines.map((l) => [l.name, l.color]));
  const out: Vehicle[] = [];
  for (const s of stations) {
    for (const a of arrivals.get(s.id) ?? []) {
      if (a.minutes > 1) continue;
      out.push({
        id: `${s.id}:${a.toward ?? a.line}`,
        mode: s.mode,
        line: a.line,
        label: a.toward ? `往${a.toward}` : a.line,
        at: s.at,
        status: a.minutes === 0 ? `${s.name}進站中` : `即將抵達${s.name}`,
        color: colorByName.get(a.line),
      });
    }
  }
  return out;
}

// ---------- 臺鐵 ----------

/** 臺鐵車站（全臺；預設只留高雄附近） */
export function railStations(json: unknown, bbox = KAOHSIUNG_BBOX): Station[] {
  const out: Station[] = [];
  for (const r of rows(json, 'Stations')) {
    const at = position(r.StationPosition);
    const id = str(r.StationID);
    if (!at || !id || !inBbox(at, bbox)) continue;
    out.push({ id: `rail:${id}`, mode: 'rail', name: zh(r.StationName), at });
  }
  return out;
}

/** 臺鐵路線線形（全臺）：只保留高雄附近的部分，線在範圍外的地方切斷 */
export function railLines(json: unknown, bbox = KAOHSIUNG_BBOX): TransitLine[] {
  const out: TransitLine[] = [];
  for (const r of rows(json, 'Shapes')) {
    const id = str(r.LineID) || str(r.LineNo);
    const path: LngLat[][] = [];
    for (const part of parseWktLines(str(r.Geometry))) {
      let cur: LngLat[] = [];
      for (const p of part) {
        if (inBbox(p, bbox)) cur.push(p);
        else if (cur.length) {
          if (cur.length >= 2) path.push(cur);
          cur = [];
        }
      }
      if (cur.length >= 2) path.push(cur);
    }
    if (!id || !path.length) continue;
    out.push({ id: `rail:${id}`, mode: 'rail', name: zh(r.LineName) || id, color: RAIL_COLOR, path });
  }
  return out;
}

/** 臺鐵路線顏色（TDX 沒有提供） */
export const RAIL_COLOR = '#3a5fa8';

const TRA_STATUS = ['進站中', '在站上', '已離站'];

/** 臺鐵列車即時位置（TrainLiveBoard）：列車畫在目前所在或剛離開的車站；不在高雄附近的略過 */
export function railTrains(json: unknown, stations: Station[]): Vehicle[] {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const out: Vehicle[] = [];
  for (const r of rows(json, 'TrainLiveBoards')) {
    const station = byId.get(`rail:${str(r.StationID)}`);
    const no = str(r.TrainNo);
    if (!station || !no) continue;
    const delay = num(r.DelayTime) ?? 0;
    const status = TRA_STATUS[num(r.TrainStationStatus) ?? -1] ?? '';
    out.push({
      id: `rail:${no}`,
      mode: 'rail',
      line: zh(r.TrainTypeName) || '臺鐵',
      label: `${no} 次`,
      at: station.at,
      status: `${station.name}${status}${delay > 0 ? `，晚 ${delay} 分` : '，準點'}`,
      time: str(r.UpdateTime) || undefined,
    });
  }
  return out;
}

// ---------- 道路 ----------

/** 速度 → 壅塞程度；沒有速度時改用 TDX 的 CongestionLevel（1 順暢、2 車多、3 以上壅塞） */
export function congestion(speed: number | undefined, level: unknown, t = DEFAULT_THRESHOLDS): CongestionLevel {
  if (speed !== undefined && speed > 0) return speed >= t.smooth ? 1 : speed >= t.busy ? 2 : 3;
  const l = num(level);
  if (l === undefined || l <= 0) return 0;
  return l >= 3 ? 3 : (l as 1 | 2);
}

/**
 * 市區路段：線形（SectionShape）＋路段名稱（Section，選用）＋即時路況（LiveTraffic）。
 * 只回傳有線形的路段；沒有即時路況的路段壅塞程度為 0（不明）。
 */
export function roadSegments(shapeJson: unknown, liveJson: unknown, sectionJson?: unknown, t = DEFAULT_THRESHOLDS): RoadSegment[] {
  const names = new Map<string, string>();
  for (const r of rows(sectionJson, 'Sections')) {
    names.set(str(r.SectionID), str(r.SectionName) || zh(r.RoadName));
  }
  const live = new Map<string, Json>();
  for (const r of rows(liveJson, 'LiveTraffics')) live.set(str(r.SectionID), r);
  const out: RoadSegment[] = [];
  for (const r of rows(shapeJson, 'SectionShapes')) {
    const id = str(r.SectionID);
    const path = parseWktLines(str(r.Geometry));
    if (!id || !path.length) continue;
    const l = live.get(id);
    const speed = l ? num(l.TravelSpeed) : undefined;
    out.push({
      id,
      name: names.get(id) || id,
      path,
      speedKmh: speed !== undefined && speed > 0 ? speed : undefined,
      level: l ? congestion(speed, l.CongestionLevel, t) : 0,
    });
  }
  return out;
}

// ---------- 公共自行車 ----------

/** 公共自行車站點（Station）＋即時車位（Availability） */
export function bikeStations(stationJson: unknown, availJson: unknown): Station[] {
  const avail = new Map<string, Json>();
  for (const r of rows(availJson, 'BikeAvailabilities')) avail.set(str(r.StationUID), r);
  const out: Station[] = [];
  for (const r of rows(stationJson, 'BikeStations')) {
    const uid = str(r.StationUID);
    const at = position(r.StationPosition);
    if (!uid || !at) continue;
    const a = avail.get(uid);
    out.push({
      id: `bike:${uid}`,
      mode: 'bike',
      name: zh(r.StationName).replace(/^YouBike2\.0_/, ''),
      at,
      bikes: a ? { rent: num(a.AvailableRentBikes) ?? 0, ret: num(a.AvailableReturnBikes) ?? 0 } : undefined,
    });
  }
  return out;
}
