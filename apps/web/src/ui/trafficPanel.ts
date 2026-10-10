import { CONGESTION_LABEL, MODE_LABEL, type CongestionLevel, type TrafficMode, type TrafficSnapshot } from '@twsim/traffic';
import { TRAFFIC } from '../map/config';
import type { MapView, TrafficLayerKey, TrafficPick } from '../map/MapView';
import { TrafficFeed, type FeedState } from '../traffic/feed';
import { byId, el, fmtInt } from './format';

/**
 * 交通模式的左側面板：資料狀態、各運具數量、圖層開關、路況圖例、資料來源狀態、伺服器設定。
 * 點地圖上的車輛、車站、路段會跳出說明框，資料更新時說明框內容跟著更新。
 */

const LAYER_KEYS: { key: TrafficLayerKey; label: string; color: string }[] = [
  { key: 'metro', label: MODE_LABEL.metro, color: TRAFFIC.modeColor.metro },
  { key: 'lightrail', label: MODE_LABEL.lightrail, color: TRAFFIC.modeColor.lightrail },
  { key: 'rail', label: MODE_LABEL.rail, color: TRAFFIC.modeColor.rail },
  { key: 'bus', label: MODE_LABEL.bus, color: TRAFFIC.modeColor.bus },
  { key: 'road', label: '路況', color: TRAFFIC.congestion[2] },
  { key: 'bike', label: MODE_LABEL.bike, color: TRAFFIC.modeColor.bike },
];

const HIDDEN_KEY = 'twsim.traffic.hidden';

const BADGE: Record<FeedState['kind'], { text: string; cls: string }> = {
  live: { text: '即時', cls: 'live' },
  demo: { text: '示範', cls: 'demo' },
  'server-demo': { text: '示範', cls: 'demo' },
  offline: { text: '未連線', cls: 'offline' },
};

export class TrafficPanel {
  private active = false;
  private snap: TrafficSnapshot | null = null;
  private state: FeedState | null = null;
  private hidden = new Set<TrafficLayerKey>(loadHidden());
  private pick: TrafficPick | null = null;
  private popupBody: HTMLElement | null = null;
  private feed = new TrafficFeed((snap, state) => this.update(snap, state));

  constructor(
    private map: MapView,
    onExit: () => void,
  ) {
    byId('traffic-close').addEventListener('click', onExit);
    map.setTrafficHidden([...this.hidden]);
    map.onTrafficPick((p) => this.select(p));
    this.setupServerForm();
    this.renderLayers();
  }

  get isActive() {
    return this.active;
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    document.body.classList.toggle('traffic', on);
    byId('traffic').hidden = !on;
    this.map.setTrafficMode(on);
    if (on) this.feed.start();
    else {
      this.feed.stop();
      this.pick = null;
    }
  }

  private update(snap: TrafficSnapshot, state: FeedState) {
    this.snap = snap;
    this.state = state;
    this.map.setTraffic(snap, state.animateMs);
    this.render();
    this.renderPopup();
  }

  private render() {
    const { snap, state } = this;
    if (!snap || !state) return;
    const badge = BADGE[state.kind];
    const b = byId('traffic-badge');
    b.textContent = badge.text;
    b.className = `badge ${badge.cls}`;
    byId('traffic-status').textContent = `${state.message}｜${clock(snap.updatedAt)} 更新`;
    byId('traffic-attribution').textContent = snap.attribution;
    this.renderLayers();
    this.renderLegend();
    this.renderFeeds();
  }

  /** 每個圖層一個按鈕，附數量；按了切換顯示 */
  private renderLayers() {
    const counts = this.counts();
    byId('traffic-layers').replaceChildren(
      ...LAYER_KEYS.map(({ key, label, color }) => {
        const on = !this.hidden.has(key);
        const btn = el(
          'button',
          { class: on ? 'chip on traffic-chip' : 'chip traffic-chip', title: on ? `隱藏${label}` : `顯示${label}` },
          el('i', { class: 'dot', style: `background:${color}` }),
          label,
          el('small', {}, counts[key] ?? ''),
        );
        btn.addEventListener('click', () => {
          if (on) this.hidden.add(key);
          else this.hidden.delete(key);
          saveHidden([...this.hidden]);
          this.map.setTrafficHidden([...this.hidden]);
          this.renderLayers();
        });
        return btn;
      }),
    );
  }

  /** 圖層按鈕上的數量文字 */
  private counts(): Partial<Record<TrafficLayerKey, string>> {
    const s = this.snap;
    if (!s) return {};
    const out: Partial<Record<TrafficLayerKey, string>> = {};
    const vehicles = new Map<TrafficMode, number>();
    for (const v of s.vehicles) vehicles.set(v.mode, (vehicles.get(v.mode) ?? 0) + 1);
    const stations = new Map<TrafficMode, number>();
    for (const st of s.stations) stations.set(st.mode, (stations.get(st.mode) ?? 0) + 1);
    for (const mode of ['metro', 'lightrail', 'rail', 'bus'] as const) {
      const n = vehicles.get(mode) ?? 0;
      const st = stations.get(mode) ?? 0;
      if (n || st) out[mode] = mode === 'bus' ? `${fmtInt(n)} 台` : `${n} 列`;
    }
    if (stations.get('bike')) out.bike = `${fmtInt(stations.get('bike')!)} 站`;
    const jam = s.roads.filter((r) => r.level === 3).length;
    if (s.roads.length) out.road = jam ? `${jam} 段壅塞` : `${fmtInt(s.roads.length)} 段`;
    return out;
  }

  private renderLegend() {
    const box = byId('traffic-legend');
    const roads = this.snap?.roads ?? [];
    if (!roads.length || this.hidden.has('road')) {
      box.replaceChildren();
      return;
    }
    const by = [0, 0, 0, 0];
    for (const r of roads) by[r.level]++;
    box.replaceChildren(
      ...([1, 2, 3, 0] as CongestionLevel[]).map((lv) =>
        el('span', { class: 'legend-item' }, el('i', { class: 'swatch', style: `background:${TRAFFIC.congestion[lv]}` }), `${CONGESTION_LABEL[lv]} ${by[lv]}`),
      ),
    );
  }

  /** 伺服器回報的資料來源狀態；只列啟用中的 */
  private renderFeeds() {
    const feeds = this.state?.feeds ?? [];
    const list = byId('traffic-feeds');
    if (!feeds.length) {
      list.replaceChildren(el('li', { class: 'quiet' }, this.state?.api ? '（連上伺服器後顯示）' : '尚未設定交通資料伺服器'));
      return;
    }
    const enabled = feeds.filter((f) => f.enabled);
    const off = feeds.length - enabled.length;
    list.replaceChildren(
      ...enabled.map((f) =>
        el(
          'li',
          { class: f.ok ? 'ok' : 'err', title: f.error ?? '' },
          el('span', { class: 'mark' }, '●'),
          el('span', { class: 'name' }, f.name),
          el('span', { class: 'quiet' }, f.ok ? `${fmtInt(f.count)} 筆・${f.lastOk ? clock(f.lastOk) : ''}` : f.error ? '失敗' : '等待中'),
        ),
      ),
      ...(off ? [el('li', { class: 'quiet' }, `另有 ${off} 個來源停用（可在管理後台開啟）`)] : []),
    );
  }

  private setupServerForm() {
    const input = byId<HTMLInputElement>('traffic-api');
    input.value = this.feed.api;
    byId('traffic-api-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.feed.setApi(input.value);
      input.value = this.feed.api;
    });
    byId('traffic-api-clear').addEventListener('click', () => {
      input.value = '';
      this.feed.setApi('');
    });
  }

  // ---------- 說明框 ----------

  private select(p: TrafficPick | null) {
    this.pick = p;
    if (!p) {
      this.map.closePopup();
      return;
    }
    this.popupBody = el('div', { class: 'traffic-info' });
    this.renderPopup();
    this.map.showPopup(p.at, this.popupBody);
  }

  private renderPopup() {
    const p = this.pick;
    const body = this.popupBody;
    if (!p || !body || !this.snap) return;
    const s = this.snap;
    const rows: (HTMLElement | string)[] = [];
    if (p.kind === 'vehicle') {
      const v = s.vehicles.find((x) => x.id === p.id);
      if (!v) return body.replaceChildren(el('p', { class: 'quiet' }, '這台車已不在資料中（可能已收班或離開範圍）'));
      rows.push(el('h4', {}, el('i', { class: 'dot', style: `background:${v.color ?? TRAFFIC.modeColor[v.mode]}` }), `${MODE_LABEL[v.mode]}　${v.line}`));
      rows.push(el('div', {}, v.label));
      if (v.status) rows.push(el('div', {}, v.status));
      if (v.speedKmh !== undefined) rows.push(el('div', { class: 'quiet' }, `時速 ${Math.round(v.speedKmh)} 公里`));
      if (v.time) rows.push(el('div', { class: 'quiet' }, `定位時間 ${clock(v.time)}`));
    } else if (p.kind === 'station') {
      const st = s.stations.find((x) => x.id === p.id);
      if (!st) return body.replaceChildren(el('p', { class: 'quiet' }, '找不到這個站點'));
      rows.push(el('h4', {}, st.name, el('small', {}, `　${MODE_LABEL[st.mode]}`)));
      if (st.bikes) rows.push(el('div', {}, `可借 ${st.bikes.rent} 輛・可還 ${st.bikes.ret} 位`));
      if (st.arrivals?.length) {
        rows.push(
          el(
            'ul',
            { class: 'arrivals' },
            ...st.arrivals.slice(0, 6).map((a) =>
              el('li', {}, el('span', {}, `${a.line}${a.toward ? `　往${a.toward}` : ''}`), el('strong', {}, a.minutes === 0 ? '進站中' : `${a.minutes} 分`)),
            ),
          ),
        );
      } else if (!st.bikes) rows.push(el('div', { class: 'quiet' }, '沒有即時到站資料'));
    } else {
      const r = s.roads.find((x) => x.id === p.id);
      if (!r) return body.replaceChildren(el('p', { class: 'quiet' }, '找不到這個路段'));
      rows.push(el('h4', {}, el('i', { class: 'dot', style: `background:${TRAFFIC.congestion[r.level]}` }), r.name));
      rows.push(el('div', {}, `${CONGESTION_LABEL[r.level]}${r.speedKmh !== undefined ? `・平均時速 ${Math.round(r.speedKmh)} 公里` : ''}`));
    }
    if (s.source === 'demo') rows.push(el('div', { class: 'quiet demo-note' }, '示範資料，非即時'));
    body.replaceChildren(...rows);
  }
}

/** ISO 時間 → 台灣時間 HH:MM:SS */
function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
}

function loadHidden(): TrafficLayerKey[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? 'null') as unknown;
    if (Array.isArray(v)) return v.filter((k): k is TrafficLayerKey => LAYER_KEYS.some((l) => l.key === k));
  } catch {
    // 讀不到就用預設
  }
  return [];
}

function saveHidden(keys: TrafficLayerKey[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(keys));
  } catch {
    // 存不了就算了，只影響下次開啟的預設
  }
}
