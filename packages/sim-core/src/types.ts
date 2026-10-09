/**
 * sim-core 的公開型別。
 * 原則：靜態世界（World）由資料管線產生、遊戲中不變；動態狀態（WorldState）每 tick 更新。
 */

/** 經緯度 [lon, lat]（WGS84 / TWD97 經緯度，兩者在遊戲精度下視為相同） */
export type LonLat = [number, number];

export type EdgeKind = 'adjacent' | 'road' | 'rail' | 'hsr' | 'freeway';

export interface Region {
  /** 政府行政區代碼，例：高雄市三民區 */
  id: string;
  name: string;
  county: string;
  centroid: LonLat;
  areaKm2: number;
  population: number;
  /** 其他數值屬性：醫院床數、避難收容量…（鍵名由資料管線與劇本約定） */
  attrs: Record<string, number>;
  /** 外框（可多個多邊形，每個是一圈點）；沒有時畫面會用六角柱代替 */
  polygon?: LonLat[][];
}

export interface Edge {
  /** 區塊索引（regions 陣列中的位置） */
  from: number;
  to: number;
  kind: EdgeKind;
  /** 每 tick 可通過量（單位由劇本解讀，例：可轉送傷患人數） */
  capacity: number;
  /** 正常通行所需 tick 數 */
  travelTicks: number;
  lengthKm: number;
}

export interface Fault {
  id: string;
  name: string;
  line: LonLat[];
  note?: string;
}

export interface WorldMeta {
  id: string;
  name: string;
  version: number;
  source: string;
  note?: string;
}

export interface World {
  meta: WorldMeta;
  regions: Region[];
  edges: Edge[];
  faults: Fault[];
}

export interface ScheduledEvent {
  tick: number;
  /** 同一 tick 內依 seq 排序，確保可重現 */
  seq: number;
  type: string;
  payload: unknown;
}

export interface LogEntry {
  tick: number;
  kind: string;
  text: string;
  region?: number;
}

export interface EndResult {
  reason: string;
  score: number;
  grade: string;
  details: Record<string, number>;
}

export interface WorldState {
  tick: number;
  /** 亂數狀態（uint32）；只能透過 Rng 讀寫 */
  rng: number;
  /** 每個區塊變數一個陣列：vars['trapped'][regionIndex] */
  vars: Record<string, Float64Array>;
  /** 每條連線的通行率 0–1 */
  edgeStatus: Float64Array;
  /** 劇本自用的全域數值（指揮點數、可用搜救隊…） */
  scalars: Record<string, number>;
  eventQueue: ScheduledEvent[];
  nextSeq: number;
  log: LogEntry[];
  ended: EndResult | null;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

export interface Action {
  type: string;
}

/** 劇本規則介面。sim-core 不知道任何變數的意義，全部由劇本定義。 */
export interface Rules<A extends Action = Action> {
  id: string;
  title: string;
  maxTicks: number;
  /** 劇本使用的區塊變數名稱；引擎會為每個名稱配置一個陣列 */
  vars: readonly string[];
  init(ctx: Ctx): void;
  applyAction(ctx: Ctx, action: A): ActionResult;
  onEvent(ctx: Ctx, ev: ScheduledEvent): void;
  /** 沿連線的擴散與流動 */
  spread(ctx: Ctx): void;
  /** 各區塊內部更新 */
  local(ctx: Ctx): void;
  checkEnd(ctx: Ctx): EndResult | null;
  /** 給玩家看的少數指標 */
  metrics(ctx: Ctx): Record<string, number>;
}

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(n: number): number;
  chance(p: number): boolean;
}

export interface Adjacency {
  /** incident[i] = 與區塊 i 相連的連線索引 */
  incident: number[][];
  /** 連線 e 從區塊 i 看過去的另一端 */
  other(edgeIndex: number, region: number): number;
}

export interface Ctx {
  world: World;
  state: WorldState;
  rng: Rng;
  adj: Adjacency;
  /** 排程事件：delay 至少 1（下一個 tick 才觸發） */
  schedule(delay: number, type: string, payload: unknown): void;
  log(kind: string, text: string, region?: number): void;
  v(name: string): Float64Array;
}
