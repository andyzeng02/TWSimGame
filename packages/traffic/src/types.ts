/**
 * 即時交通的統一格式。
 *
 * 伺服器把各資料來源（TDX 等）的回應轉成這個格式，網頁版只認這個格式，
 * 不需要知道資料原本來自哪個 API。座標一律是 [經度, 緯度]（WGS84）。
 */

export type LngLat = [number, number];

/** 運具種類 */
export type TrafficMode = 'metro' | 'lightrail' | 'rail' | 'bus' | 'bike';

/** 路段壅塞程度：0 不明、1 順暢、2 車多、3 壅塞 */
export type CongestionLevel = 0 | 1 | 2 | 3;

/** 移動中的車輛（公車、列車） */
export interface Vehicle {
  id: string;
  mode: TrafficMode;
  /** 路線名稱（例：紅線、紅 33、區間車） */
  line: string;
  /** 顯示用短名（例：車牌、車次） */
  label: string;
  at: LngLat;
  /** 行進方向（度，正北為 0，順時針） */
  bearing?: number;
  speedKmh?: number;
  /** 狀態文字（例：進站中、往小港） */
  status?: string;
  /** 路線顏色（有官方顏色時才給） */
  color?: string;
  /** 資料時間（ISO 8601） */
  time?: string;
}

/** 到站資訊 */
export interface Arrival {
  line: string;
  /** 終點站或行駛方向 */
  toward?: string;
  /** 幾分鐘後到站；0 = 進站中 */
  minutes: number;
}

/** 車站或站點（捷運站、火車站、公共自行車站） */
export interface Station {
  id: string;
  mode: TrafficMode;
  name: string;
  at: LngLat;
  arrivals?: Arrival[];
  /** 公共自行車：可借、可還數量 */
  bikes?: { rent: number; ret: number };
}

/** 軌道路線（畫在地圖上的線） */
export interface TransitLine {
  id: string;
  mode: TrafficMode;
  name: string;
  color: string;
  path: LngLat[][];
}

/** 道路路段 */
export interface RoadSegment {
  id: string;
  name: string;
  path: LngLat[][];
  speedKmh?: number;
  level: CongestionLevel;
}

/** 單一資料來源的狀態（後台與前端都會顯示） */
export interface FeedStatus {
  id: string;
  name: string;
  enabled: boolean;
  ok: boolean;
  /** 最近一次成功取得資料的時間（ISO 8601） */
  lastOk?: string;
  error?: string;
  count: number;
}

/** 前端每次取得的整份即時交通資料 */
export interface TrafficSnapshot {
  /** 產生時間（ISO 8601） */
  updatedAt: string;
  /** live = 真實即時資料；demo = 示範資料（非即時） */
  source: 'live' | 'demo';
  vehicles: Vehicle[];
  stations: Station[];
  lines: TransitLine[];
  roads: RoadSegment[];
  feeds: FeedStatus[];
  /** 資料來源標示（顯示在畫面上） */
  attribution: string;
}

export function emptySnapshot(source: TrafficSnapshot['source'] = 'live'): TrafficSnapshot {
  return { updatedAt: new Date(0).toISOString(), source, vehicles: [], stations: [], lines: [], roads: [], feeds: [], attribution: '' };
}

export const MODE_LABEL: Record<TrafficMode, string> = {
  metro: '捷運',
  lightrail: '輕軌',
  rail: '臺鐵',
  bus: '公車',
  bike: '公共自行車',
};

export const CONGESTION_LABEL: Record<CongestionLevel, string> = {
  0: '不明',
  1: '順暢',
  2: '車多',
  3: '壅塞',
};
