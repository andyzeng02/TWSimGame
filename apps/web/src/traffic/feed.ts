import { demoSnapshot, type FeedStatus, type TrafficSnapshot } from '@twsim/traffic';
import { TRAFFIC } from '../map/config';

/**
 * 即時交通資料的取得：向交通資料伺服器定時要資料；沒有設定伺服器或連不上時改用示範資料。
 *
 * 伺服器網址的優先順序：網址 ?traffic=… → 交通面板裡存的設定（localStorage）→ 建置時的 VITE_TRAFFIC_API。
 */

export type FeedKind =
  /** 伺服器提供的真實即時資料 */
  | 'live'
  /** 沒有設定伺服器：示範資料 */
  | 'demo'
  /** 伺服器還沒設定 TDX 帳號：示範資料 */
  | 'server-demo'
  /** 連不上伺服器：示範資料 */
  | 'offline';

export interface FeedState {
  kind: FeedKind;
  /** 給使用者看的一句話 */
  message: string;
  api: string;
  /** 伺服器回報的各資料來源狀態（連上伺服器時才有） */
  feeds: FeedStatus[];
  /** 本次資料適合的動畫時間（毫秒） */
  animateMs: number;
}

const STORAGE_KEY = 'twsim.traffic.api';

export function savedApi(): string {
  const param = new URLSearchParams(location.search).get('traffic');
  if (param !== null) return param;
  try {
    return localStorage.getItem(STORAGE_KEY) ?? TRAFFIC.defaultApi;
  } catch {
    return TRAFFIC.defaultApi;
  }
}

export class TrafficFeed {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  /** 每次 start 或改網址就加一，舊的請求回來時發現代號變了就丟掉 */
  private gen = 0;
  api = savedApi();

  constructor(private onData: (snap: TrafficSnapshot, state: FeedState) => void) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.tick(++this.gen);
  }

  stop() {
    this.running = false;
    this.gen++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** 改伺服器網址（空字串 = 只用示範資料）；會記在瀏覽器裡 */
  setApi(url: string) {
    this.api = url.trim().replace(/\/+$/, '');
    try {
      if (this.api) localStorage.setItem(STORAGE_KEY, this.api);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 存不了也沒關係，這次仍然有效
    }
    if (this.running) {
      this.stop();
      this.start();
    }
  }

  private serverFeeds: FeedStatus[] = [];
  /** 伺服器狀態（offline／server-demo 期間用本機示範資料每秒更新，伺服器每 pollMs 再問一次） */
  private serverKind: FeedKind = 'demo';
  private serverError = '';
  private lastPoll = 0;

  private async tick(gen: number) {
    if (!this.running || gen !== this.gen) return;
    let next: number = TRAFFIC.demoTickMs;
    if (this.api && Date.now() - this.lastPoll >= TRAFFIC.pollMs - 50) {
      this.lastPoll = Date.now();
      try {
        const res = await fetch(`${this.api}/api/traffic/snapshot`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const snap = (await res.json()) as TrafficSnapshot;
        if (gen !== this.gen) return;
        this.serverFeeds = snap.feeds ?? [];
        this.serverError = '';
        this.serverKind = snap.source === 'live' ? 'live' : 'server-demo';
        if (this.serverKind === 'live') {
          this.onData(snap, this.state('live', TRAFFIC.pollMs));
          next = TRAFFIC.pollMs;
        }
      } catch (e) {
        if (gen !== this.gen) return;
        this.serverKind = 'offline';
        this.serverError = e instanceof Error ? e.message : String(e);
        this.serverFeeds = [];
      }
    }
    if (!this.api) this.serverKind = 'demo';
    if (this.serverKind !== 'live') {
      const snap = demoSnapshot(Date.now());
      this.onData(snap, this.state(this.serverKind, TRAFFIC.demoTickMs));
    }
    if (this.running && gen === this.gen) this.timer = setTimeout(() => this.tick(gen), next);
  }

  private state(kind: FeedKind, animateMs: number): FeedState {
    const failing = this.serverFeeds.some((f) => f.enabled && f.error && f.error !== '尚未設定 TDX 帳號');
    const message = {
      live: '即時資料',
      demo: '示範資料：尚未設定交通資料伺服器',
      'server-demo': failing
        ? '示範資料：伺服器抓不到 TDX 資料（原因見下方資料來源）'
        : '示範資料：伺服器尚未設定 TDX 帳號，或資料還在抓取中',
      offline: `示範資料：連不上交通資料伺服器（${this.serverError}）`,
    }[kind];
    return { kind, message, api: this.api, feeds: this.serverFeeds, animateMs: Math.min(animateMs, TRAFFIC.animateMaxMs) };
  }
}
