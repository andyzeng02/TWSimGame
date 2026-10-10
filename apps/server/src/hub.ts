/**
 * 資料中樞：依設定定時執行各資料來源、保存最新的原始回應、合併成前端要的 TrafficSnapshot。
 *
 * 還沒有任何真實資料時（沒設定 TDX 帳號，或全部來源都失敗），回傳示範資料，
 * 並在 feeds 裡附上各來源的狀態，前端與後台都看得到原因。
 */
import {
  bikeStations,
  busVehicles,
  demoSnapshot,
  metroArrivals,
  metroLines,
  metroStations,
  railLines,
  railStations,
  railTrains,
  roadSegments,
  rows,
  trainsNearStations,
  type FeedStatus,
  type Station,
  type TrafficSnapshot,
  type TransitLine,
  type Vehicle,
} from '@twsim/traffic';
import type { ConfigStore, ConnectorSetting } from './config';
import { CONNECTOR_BY_ID, CONNECTORS, type ConnectorDef } from './connectors';
import type { TdxClient } from './tdx';

export const TDX_ATTRIBUTION = '交通資料：交通部 TDX 運輸資料流通服務';
/** 失敗後多久重試（秒）；更新間隔比這個短就照更新間隔 */
export const RETRY_SEC = 60;

export interface ConnectorState {
  data?: unknown[];
  lastRun?: string;
  lastOk?: string;
  error?: string;
  durationMs?: number;
  /** 原始資料筆數（各路徑加總） */
  count: number;
  running: boolean;
  /** 下次排定執行時間 */
  nextRun?: string;
}

export interface LogEntry {
  time: string;
  level: 'info' | 'error';
  message: string;
}

export class Hub {
  readonly state = new Map<string, ConnectorState>(CONNECTORS.map((c) => [c.id, { count: 0, running: false }]));
  readonly log: LogEntry[] = [];
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private cache: TrafficSnapshot | null = null;
  private stopped = true;

  constructor(
    private store: ConfigStore,
    private tdx: TdxClient,
    private now: () => number = Date.now,
  ) {}

  setting(id: string): ConnectorSetting {
    const def = CONNECTOR_BY_ID.get(id)!;
    const s = this.store.config.connectors[id];
    return {
      enabled: s?.enabled ?? def.defaultEnabled,
      intervalSec: Math.max(def.minIntervalSec, s?.intervalSec ?? def.defaultIntervalSec),
    };
  }

  /** 後台修改來源設定：存檔並重新排程 */
  updateSetting(id: string, patch: Partial<ConnectorSetting>) {
    const def = CONNECTOR_BY_ID.get(id);
    if (!def) throw new Error(`沒有這個資料來源：${id}`);
    const cur = this.setting(id);
    const next: ConnectorSetting = {
      enabled: patch.enabled ?? cur.enabled,
      intervalSec: Math.max(def.minIntervalSec, Math.round(patch.intervalSec ?? cur.intervalSec)),
    };
    this.store.config.connectors[id] = next;
    this.store.save();
    this.info(`${def.name}：${next.enabled ? `啟用，每 ${next.intervalSec} 秒更新` : '停用'}`);
    this.cache = null;
    if (!this.stopped) this.schedule(def, next.enabled ? 0 : -1);
  }

  /** 開始定時抓取（靜態資料先抓，即時資料隨後） */
  start() {
    this.stopped = false;
    if (!this.tdx.configured) this.info('尚未設定 TDX 帳號：先提供示範資料。到管理後台填入帳號後就會開始抓取。');
    CONNECTORS.forEach((def, k) => this.schedule(def, this.setting(def.id).enabled ? k * 300 : -1));
  }

  stop() {
    this.stopped = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  /** TDX 帳號更新後：重抓全部已啟用的來源 */
  restartAll() {
    this.tdx.resetToken();
    if (this.stopped) return;
    this.stop();
    this.start();
  }

  /** delayMs < 0 表示取消排程 */
  private schedule(def: ConnectorDef, delayMs: number) {
    clearTimeout(this.timers.get(def.id));
    this.timers.delete(def.id);
    const st = this.state.get(def.id)!;
    st.nextRun = undefined;
    if (delayMs < 0) return;
    st.nextRun = new Date(this.now() + delayMs).toISOString();
    this.timers.set(
      def.id,
      setTimeout(async () => {
        const st = await this.run(def.id);
        const s = this.setting(def.id);
        // 失敗的話不要等完整的更新間隔（靜態資料是一天），一分鐘後就重試
        const sec = st.error ? Math.min(s.intervalSec, RETRY_SEC) : s.intervalSec;
        if (!this.stopped && s.enabled) this.schedule(def, sec * 1000);
      }, delayMs),
    );
  }

  /** 立即執行一個來源（後台「立即更新」也用這個）；回傳執行後的狀態 */
  async run(id: string): Promise<ConnectorState> {
    const def = CONNECTOR_BY_ID.get(id);
    if (!def) throw new Error(`沒有這個資料來源：${id}`);
    const st = this.state.get(id)!;
    if (st.running) return st;
    if (!this.tdx.configured) {
      st.error = '尚未設定 TDX 帳號';
      return st;
    }
    st.running = true;
    const t0 = this.now();
    st.lastRun = new Date(t0).toISOString();
    try {
      const data: unknown[] = [];
      for (const p of def.paths) data.push(await this.tdx.get(p));
      st.data = data;
      st.count = data.reduce<number>((n, d) => n + rows(d, firstArrayKey(d)).length, 0);
      st.lastOk = new Date(this.now()).toISOString();
      st.error = undefined;
      this.cache = null;
    } catch (e) {
      st.error = e instanceof Error ? e.message : String(e);
      this.error(`${def.name}：${st.error}`);
    } finally {
      st.durationMs = this.now() - t0;
      st.running = false;
    }
    return st;
  }

  feeds(): FeedStatus[] {
    return CONNECTORS.map((def) => {
      const st = this.state.get(def.id)!;
      return {
        id: def.id,
        name: def.name,
        enabled: this.setting(def.id).enabled,
        ok: Boolean(st.lastOk) && !st.error,
        lastOk: st.lastOk,
        error: st.error,
        count: st.count,
      };
    });
  }

  /** 前端要的整份資料；有新資料才重新合併 */
  snapshot(): TrafficSnapshot {
    const feeds = this.feeds();
    const hasLive = CONNECTORS.some((d) => this.setting(d.id).enabled && this.state.get(d.id)!.data);
    if (!hasLive) return { ...demoSnapshot(this.now()), feeds };
    if (!this.cache) this.cache = this.build();
    return { ...this.cache, feeds };
  }

  private data(id: string): unknown[] | undefined {
    return this.setting(id).enabled ? this.state.get(id)!.data : undefined;
  }

  private build(): TrafficSnapshot {
    const vehicles: Vehicle[] = [];
    const stations: Station[] = [];
    const lines: TransitLine[] = [];

    for (const mode of ['metro', 'lightrail'] as const) {
      const base = this.data(`${mode}-static`);
      if (!base) continue;
      const st = metroStations(base[0], mode);
      const ln = metroLines(base[1], mode, base[2]);
      const live = this.data(`${mode}-live`);
      if (live) {
        const arr = metroArrivals(live[0], mode);
        for (const s of st) s.arrivals = arr.get(s.id);
        vehicles.push(...trainsNearStations(st, arr, ln));
      }
      stations.push(...st);
      lines.push(...ln);
    }

    const railBase = this.data('rail-static');
    if (railBase) {
      const st = railStations(railBase[0]);
      stations.push(...st);
      lines.push(...railLines(railBase[1]));
      const live = this.data('rail-live');
      if (live) vehicles.push(...railTrains(live[0], st));
    }

    const bus = this.data('bus-live');
    if (bus) vehicles.push(...busVehicles(bus[0]));

    const roadBase = this.data('road-static');
    const roads = roadBase ? roadSegments(roadBase[0], this.data('road-live')?.[0], roadBase[1]) : [];

    const bikeBase = this.data('bike-static');
    if (bikeBase) stations.push(...bikeStations(bikeBase[0], this.data('bike-live')?.[0]));

    return {
      updatedAt: new Date(this.now()).toISOString(),
      source: 'live',
      vehicles,
      stations,
      lines,
      roads,
      feeds: [],
      attribution: TDX_ATTRIBUTION,
    };
  }

  info(message: string) {
    this.push('info', message);
  }

  error(message: string) {
    this.push('error', message);
  }

  private push(level: LogEntry['level'], message: string) {
    this.log.push({ time: new Date(this.now()).toISOString(), level, message });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    (level === 'error' ? console.error : console.log)(`[${level}] ${message}`);
  }
}

/** TDX 回應若是物件，找出裡面第一個陣列欄位（例如 { Stations: [...] }） */
function firstArrayKey(d: unknown): string | undefined {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return undefined;
  return Object.keys(d).find((k) => Array.isArray((d as Record<string, unknown>)[k]));
}
