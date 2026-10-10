/**
 * 資料來源清單：每個來源呼叫哪些 TDX API、多久更新一次。
 *
 * 「靜態」來源（車站、線形）一天更新一次即可；「即時」來源依資料本身的更新頻率設定。
 * 抓回來的是 TDX 原始回應，由 hub.ts 合併、轉換成統一格式。
 * 新增來源：在這裡加一筆，再到 hub.ts 的 buildSnapshot() 用它的資料。
 */

export interface ConnectorDef {
  id: string;
  name: string;
  /** 後台分組 */
  group: '捷運' | '輕軌' | '臺鐵' | '公車' | '道路' | '公共自行車';
  description: string;
  /** 依序呼叫的 TDX 路徑；結果依同樣順序存放 */
  paths: string[];
  defaultIntervalSec: number;
  /** 最短更新間隔（避免超過 TDX 呼叫上限） */
  minIntervalSec: number;
  /** 預設是否啟用 */
  defaultEnabled: boolean;
}

const DAY = 86400;

export const CONNECTORS: ConnectorDef[] = [
  {
    id: 'metro-static',
    name: '高雄捷運：車站與路線',
    group: '捷運',
    description: '紅線、橘線的車站位置、路線線形與官方顏色',
    paths: ['/v2/Rail/Metro/Station/KRTC', '/v2/Rail/Metro/Shape/KRTC', '/v2/Rail/Metro/Line/KRTC'],
    defaultIntervalSec: DAY,
    minIntervalSec: 3600,
    defaultEnabled: true,
  },
  {
    id: 'metro-live',
    name: '高雄捷運：即時到站',
    group: '捷運',
    description: '各站下一班車幾分鐘到；1 分鐘內到站的列車會畫在車站上',
    paths: ['/v2/Rail/Metro/LiveBoard/KRTC'],
    defaultIntervalSec: 30,
    minIntervalSec: 15,
    defaultEnabled: true,
  },
  {
    id: 'lightrail-static',
    name: '環狀輕軌：車站與路線',
    group: '輕軌',
    description: '輕軌車站位置與路線線形',
    paths: ['/v2/Rail/Metro/Station/KLRT', '/v2/Rail/Metro/Shape/KLRT', '/v2/Rail/Metro/Line/KLRT'],
    defaultIntervalSec: DAY,
    minIntervalSec: 3600,
    defaultEnabled: true,
  },
  {
    id: 'lightrail-live',
    name: '環狀輕軌：即時到站',
    group: '輕軌',
    description: '各站下一班車幾分鐘到',
    paths: ['/v2/Rail/Metro/LiveBoard/KLRT'],
    defaultIntervalSec: 30,
    minIntervalSec: 15,
    defaultEnabled: true,
  },
  {
    id: 'rail-static',
    name: '臺鐵：車站',
    group: '臺鐵',
    description: '全臺車站位置（只保留高雄附近）',
    paths: ['/v3/Rail/TRA/Station'],
    defaultIntervalSec: DAY,
    minIntervalSec: 3600,
    defaultEnabled: true,
  },
  {
    id: 'rail-live',
    name: '臺鐵：列車即時位置',
    group: '臺鐵',
    description: '列車目前在哪一站、誤點幾分鐘',
    paths: ['/v3/Rail/TRA/TrainLiveBoard'],
    defaultIntervalSec: 60,
    minIntervalSec: 30,
    defaultEnabled: true,
  },
  {
    id: 'bus-live',
    name: '高雄市公車：即時位置',
    group: '公車',
    description: '每台公車的 GPS 位置、方向與速度（約 15–30 秒更新）',
    paths: ['/v2/Bus/RealTimeByFrequency/City/Kaohsiung'],
    defaultIntervalSec: 20,
    minIntervalSec: 10,
    defaultEnabled: true,
  },
  {
    id: 'road-static',
    name: '市區道路：路段線形',
    group: '道路',
    description: '有偵測器的市區路段位置與名稱',
    paths: ['/v2/Road/Traffic/SectionShape/City/Kaohsiung', '/v2/Road/Traffic/Section/City/Kaohsiung'],
    defaultIntervalSec: DAY,
    minIntervalSec: 3600,
    defaultEnabled: true,
  },
  {
    id: 'road-live',
    name: '市區道路：即時路況',
    group: '道路',
    description: '各路段平均車速與壅塞程度',
    paths: ['/v2/Road/Traffic/Live/City/Kaohsiung'],
    defaultIntervalSec: 60,
    minIntervalSec: 30,
    defaultEnabled: true,
  },
  {
    id: 'bike-static',
    name: '公共自行車：站點',
    group: '公共自行車',
    description: '高雄市公共自行車站點位置',
    paths: ['/v2/Bike/Station/City/Kaohsiung'],
    defaultIntervalSec: DAY,
    minIntervalSec: 3600,
    defaultEnabled: false,
  },
  {
    id: 'bike-live',
    name: '公共自行車：即時車位',
    group: '公共自行車',
    description: '各站可借、可還數量',
    paths: ['/v2/Bike/Availability/City/Kaohsiung'],
    defaultIntervalSec: 60,
    minIntervalSec: 30,
    defaultEnabled: false,
  },
];

export const CONNECTOR_BY_ID = new Map(CONNECTORS.map((c) => [c.id, c]));
