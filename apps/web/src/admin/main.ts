import { MODE_LABEL, type TrafficMode } from '@twsim/traffic';
import { byId, el, fmtInt } from '../ui/format';
import './admin.css';

/**
 * 交通資料管理後台：設定 TDX 帳號、各資料來源的啟用與更新間隔、CORS，查看狀態與紀錄。
 * 所有操作都透過交通資料伺服器的 /admin/api（見 apps/server/src/http.ts）。
 */

interface ConnectorRow {
  id: string;
  name: string;
  group: string;
  description: string;
  paths: string[];
  minIntervalSec: number;
  enabled: boolean;
  intervalSec: number;
  lastRun?: string;
  lastOk?: string;
  nextRun?: string;
  error?: string;
  count: number;
  durationMs?: number;
  running: boolean;
}

interface AdminState {
  server: { startedAt: string; tdxCalls: number; allowedOrigins: string[] };
  tdx: { clientId: string; clientSecret: string; configured: boolean; fromEnv: boolean };
  connectors: ConnectorRow[];
  snapshot: { source: 'live' | 'demo'; updatedAt: string; vehicles: Partial<Record<TrafficMode, number>>; stations: number; lines: number; roads: number };
  log: { time: string; level: 'info' | 'error'; message: string }[];
}

const API_KEY = 'twsim.admin.api';
const TOKEN_KEY = 'twsim.admin.token';
const REFRESH_MS = 5000;

let api = '';
let token = '';
let timer: ReturnType<typeof setInterval> | null = null;
/** 正在編輯的欄位不要被自動更新蓋掉 */
let tdxFormDirty = false;
let originsDirty = false;

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}

async function call(method: string, path: string, body?: unknown): Promise<AdminState> {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as AdminState & { error?: string };
  if (res.status === 401) {
    logout();
    throw new Error(data.error ?? '管理者權杖錯誤');
  }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

// ---------- 登入 ----------

function setupLogin() {
  const apiInput = byId<HTMLInputElement>('api');
  const tokenInput = byId<HTMLInputElement>('token');
  apiInput.value = storage('local')?.getItem(API_KEY) ?? 'http://localhost:8787';
  const saved = storage('local')?.getItem(TOKEN_KEY) ?? storage('session')?.getItem(TOKEN_KEY) ?? '';
  tokenInput.value = saved;
  byId<HTMLInputElement>('remember').checked = Boolean(storage('local')?.getItem(TOKEN_KEY));

  byId('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    api = apiInput.value.trim().replace(/\/+$/, '');
    token = tokenInput.value.trim();
    const msg = byId('login-msg');
    msg.textContent = '連線中…';
    msg.className = 'msg';
    try {
      const state = await call('GET', '/admin/api/state');
      storage('local')?.setItem(API_KEY, api);
      const remember = byId<HTMLInputElement>('remember').checked;
      storage('local')?.removeItem(TOKEN_KEY);
      storage('session')?.removeItem(TOKEN_KEY);
      storage(remember ? 'local' : 'session')?.setItem(TOKEN_KEY, token);
      msg.textContent = '';
      showDash(state);
    } catch (err) {
      msg.textContent = `連線失敗：${err instanceof Error ? err.message : String(err)}（伺服器有啟動嗎？網址對嗎？）`;
      msg.className = 'msg err';
    }
  });
  byId('logout').addEventListener('click', () => {
    storage('local')?.removeItem(TOKEN_KEY);
    storage('session')?.removeItem(TOKEN_KEY);
    tokenInput.value = '';
    logout();
  });
  if (saved) byId<HTMLFormElement>('login-form').requestSubmit();
}

function logout() {
  if (timer) clearInterval(timer);
  timer = null;
  byId('dash').hidden = true;
  byId('login').hidden = false;
  byId('logout').hidden = true;
  byId('who').textContent = '';
}

function showDash(state: AdminState) {
  byId('login').hidden = true;
  byId('dash').hidden = false;
  byId('logout').hidden = false;
  byId('who').textContent = `已連線：${api}`;
  render(state);
  if (timer) clearInterval(timer);
  timer = setInterval(() => void refresh(), REFRESH_MS);
}

async function refresh() {
  try {
    render(await call('GET', '/admin/api/state'));
  } catch (err) {
    byId('who').textContent = `連線中斷：${err instanceof Error ? err.message : String(err)}`;
  }
}

// ---------- 畫面 ----------

function render(s: AdminState) {
  renderOverview(s);
  renderTdx(s);
  renderConnectors(s);
  if (!originsDirty) byId<HTMLTextAreaElement>('origins').value = s.server.allowedOrigins.join('\n');
  byId('log').replaceChildren(
    ...s.log.map((l) => el('li', { class: l.level }, el('span', { class: 't' }, time(l.time)), l.message)),
  );
}

function renderOverview(s: AdminState) {
  const snap = s.snapshot;
  const tile = (label: string, value: string, cls = '') => el('div', { class: `tile ${cls}` }, el('span', {}, label), el('strong', {}, value));
  const vehicles = Object.entries(snap.vehicles).map(([m, n]) => tile(MODE_LABEL[m as TrafficMode] ?? m, fmtInt(n ?? 0)));
  const ok = s.connectors.filter((c) => c.enabled && c.lastOk && !c.error).length;
  const enabled = s.connectors.filter((c) => c.enabled).length;
  byId('overview').replaceChildren(
    tile('目前提供', snap.source === 'live' ? '即時資料' : '示範資料', snap.source === 'live' ? 'good' : 'warn'),
    tile('資料來源正常', `${ok} / ${enabled}`, ok === enabled && enabled > 0 ? 'good' : 'warn'),
    tile('TDX 帳號', s.tdx.configured ? '已設定' : '未設定', s.tdx.configured ? 'good' : 'warn'),
    ...vehicles,
    tile('車站與站點', fmtInt(snap.stations)),
    tile('路段', fmtInt(snap.roads)),
    tile('TDX 呼叫次數', fmtInt(s.server.tdxCalls)),
    tile('伺服器啟動', time(s.server.startedAt)),
  );
}

function renderTdx(s: AdminState) {
  const id = byId<HTMLInputElement>('tdx-id');
  const secret = byId<HTMLInputElement>('tdx-secret');
  id.disabled = secret.disabled = s.tdx.fromEnv;
  if (!tdxFormDirty) {
    id.value = s.tdx.clientId;
    secret.value = '';
    secret.placeholder = s.tdx.clientSecret ? `已設定（${s.tdx.clientSecret}），留空表示不變` : '尚未設定';
  }
  if (s.tdx.fromEnv) byId('tdx-msg').textContent = '帳號由環境變數 TDX_CLIENT_ID／TDX_CLIENT_SECRET 設定，這裡不能修改。';
}

function renderConnectors(s: AdminState) {
  const tbody = byId('connectors').querySelector('tbody')!;
  // 使用者正在改間隔時不要重畫，避免輸入被蓋掉
  if (tbody.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'number') return;
  let group = '';
  const rows: HTMLElement[] = [];
  for (const c of s.connectors) {
    if (c.group !== group) {
      group = c.group;
      rows.push(el('tr', { class: 'group' }, el('th', { colspan: '5' }, group)));
    }
    const enabled = el('input', { type: 'checkbox', 'aria-label': `啟用${c.name}` });
    enabled.checked = c.enabled;
    enabled.addEventListener('change', () => void update(c.id, { enabled: enabled.checked }));

    const interval = el('input', { type: 'number', min: String(c.minIntervalSec), step: '1', value: String(c.intervalSec), 'aria-label': '更新間隔（秒）' });
    interval.addEventListener('change', () => void update(c.id, { intervalSec: Number(interval.value) }));

    const run = el('button', { type: 'button' }, c.running ? '更新中…' : '立即更新');
    run.disabled = c.running || !c.enabled;
    run.addEventListener('click', async () => {
      run.disabled = true;
      run.textContent = '更新中…';
      try {
        render(await call('POST', `/admin/api/connectors/${c.id}/run`));
      } catch (err) {
        alert(`更新失敗：${err instanceof Error ? err.message : String(err)}`);
      }
    });

    const status = !c.enabled
      ? el('span', { class: 'quiet' }, '停用')
      : c.error
        ? el('span', { class: 'err', title: c.error }, `✕ ${c.error}`)
        : c.lastOk
          ? el('span', { class: 'good' }, `✓ ${fmtInt(c.count)} 筆・${time(c.lastOk)}${c.durationMs !== undefined ? `（${(c.durationMs / 1000).toFixed(1)} 秒）` : ''}`)
          : el('span', { class: 'quiet' }, '等待第一次更新');
    const next = c.enabled && c.nextRun ? el('div', { class: 'quiet' }, `下次 ${time(c.nextRun)}`) : '';

    rows.push(
      el(
        'tr',
        { class: c.enabled ? '' : 'off' },
        el('td', {}, enabled),
        el('td', {}, el('strong', {}, c.name), el('div', { class: 'quiet' }, c.description), el('code', { class: 'paths' }, c.paths.join('\n'))),
        el('td', { class: 'interval' }, interval, el('span', { class: 'quiet' }, ` 秒（≥ ${c.minIntervalSec}）`)),
        el('td', {}, status, next),
        el('td', {}, run),
      ),
    );
  }
  tbody.replaceChildren(...rows);
}

async function update(id: string, patch: { enabled?: boolean; intervalSec?: number }) {
  try {
    render(await call('PUT', `/admin/api/connectors/${id}`, patch));
  } catch (err) {
    alert(`儲存失敗：${err instanceof Error ? err.message : String(err)}`);
  }
}

function setupForms() {
  const msg = byId('tdx-msg');
  const say = (text: string, ok: boolean) => {
    msg.textContent = text;
    msg.className = `msg ${ok ? 'good' : 'err'}`;
  };
  for (const id of ['tdx-id', 'tdx-secret']) byId(id).addEventListener('input', () => (tdxFormDirty = true));
  byId('tdx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const clientId = byId<HTMLInputElement>('tdx-id').value.trim();
    const clientSecret = byId<HTMLInputElement>('tdx-secret').value.trim();
    try {
      const state = await call('PUT', '/admin/api/tdx', { clientId, ...(clientSecret ? { clientSecret } : {}) });
      tdxFormDirty = false;
      render(state);
      say('已儲存，開始重新抓取資料', true);
    } catch (err) {
      say(`儲存失敗：${err instanceof Error ? err.message : String(err)}`, false);
    }
  });
  byId('tdx-test').addEventListener('click', async () => {
    say('測試中…', true);
    try {
      const r = (await call('POST', '/admin/api/tdx/test')) as unknown as { ok: boolean; message: string };
      say(r.message, r.ok);
    } catch (err) {
      say(`測試失敗：${err instanceof Error ? err.message : String(err)}`, false);
    }
  });

  const origins = byId<HTMLTextAreaElement>('origins');
  origins.addEventListener('input', () => (originsDirty = true));
  byId('origins-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = byId('origins-msg');
    try {
      const state = await call('PUT', '/admin/api/origins', { allowedOrigins: origins.value.split(/\s+/).filter(Boolean) });
      originsDirty = false;
      render(state);
      m.textContent = '已儲存';
      m.className = 'msg good';
    } catch (err) {
      m.textContent = `儲存失敗：${err instanceof Error ? err.message : String(err)}`;
      m.className = 'msg err';
    }
  });
}

function time(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

setupLogin();
setupForms();
