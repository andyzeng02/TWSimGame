/* eslint-disable @typescript-eslint/no-explicit-any -- 測試直接讀 JSON 回應 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { ConfigStore, mask } from '../src/config';
import { Hub } from '../src/hub';
import { createApi } from '../src/http';
import { TDX_API_BASE, TDX_AUTH_URL, TdxClient, type Fetch } from '../src/tdx';

/** 假的 TDX：驗證帳號、依路徑回傳樣本資料、記錄呼叫 */
function fakeTdx() {
  const calls: string[] = [];
  const data: Record<string, unknown> = {
    '/v2/Bus/RealTimeByFrequency/City/Kaohsiung': [
      { PlateNumb: 'KKA-0001', RouteName: { Zh_tw: '紅33' }, BusPosition: { PositionLon: 120.31, PositionLat: 22.63 } },
    ],
    '/v2/Rail/Metro/Station/KRTC': [
      { StationID: 'R10', StationName: { Zh_tw: '美麗島' }, StationPosition: { PositionLon: 120.302, PositionLat: 22.6316 } },
    ],
    '/v2/Rail/Metro/Shape/KRTC': [{ LineID: 'R', Geometry: 'LINESTRING(120.35 22.56, 120.30 22.63)' }],
    '/v2/Rail/Metro/Line/KRTC': [{ LineID: 'R', LineName: { Zh_tw: '紅線' } }],
    '/v2/Rail/Metro/LiveBoard/KRTC': [{ LineName: { Zh_tw: '紅線' }, StationID: 'R10', TripHeadSign: '往小港', EstimateTime: 1 }],
  };
  const impl: Fetch = async (input, init) => {
    const url = String(input);
    if (url === TDX_AUTH_URL) {
      const body = new URLSearchParams(String(init?.body));
      calls.push('auth');
      if (body.get('client_secret') !== 'good') return new Response('{}', { status: 401 });
      return Response.json({ access_token: 'tok', expires_in: 3600 });
    }
    const path = url.slice(TDX_API_BASE.length).split('?')[0];
    calls.push(path);
    if (new Headers(init?.headers).get('authorization') !== 'Bearer tok') return new Response('', { status: 401 });
    return path in data ? Response.json(data[path]) : Response.json([]);
  };
  return { impl, calls };
}

describe('交通資料伺服器', () => {
  let dir: string;
  let base: string;
  let store: ConfigStore;
  let hub: Hub;
  let server: ReturnType<typeof createApi>;
  const fake = fakeTdx();
  const env = { ADMIN_TOKEN: 'admin-secret' } as NodeJS.ProcessEnv;
  const admin = (path: string, init: RequestInit = {}) =>
    fetch(`${base}${path}`, { ...init, headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' } });

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'twsim-server-'));
    store = new ConfigStore(dir, env);
    const tdx = new TdxClient(() => store.tdx, fake.impl, 0);
    hub = new Hub(store, tdx);
    server = createApi(store, hub, tdx);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    hub.stop();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('沒有 TDX 帳號時提供示範資料', async () => {
    const res = await fetch(`${base}/api/traffic/snapshot`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    const s = (await res.json()) as any;
    assert.equal(s.source, 'demo');
    assert.ok(s.vehicles.length > 0);
    assert.ok(s.feeds.some((f: { id: string }) => f.id === 'bus-live'));
  });

  it('管理 API 要權杖', async () => {
    assert.equal((await fetch(`${base}/admin/api/state`)).status, 401);
    const wrong = await fetch(`${base}/admin/api/state`, { headers: { authorization: 'Bearer nope' } });
    assert.equal(wrong.status, 401);
    assert.equal((await admin('/admin/api/state')).status, 200);
  });

  it('錯誤的 TDX 帳號：測試失敗並說明原因', async () => {
    await admin('/admin/api/tdx', { method: 'PUT', body: JSON.stringify({ clientId: 'me', clientSecret: 'bad' }) });
    const r = (await (await admin('/admin/api/tdx/test', { method: 'POST' })).json()) as any;
    assert.equal(r.ok, false);
    assert.match(r.message, /驗證失敗/);
  });

  it('設定 TDX 帳號後抓到真實資料；金鑰不會外流', async () => {
    hub.stop(); // 測試裡手動執行，不跑排程
    const state = (await (await admin('/admin/api/tdx', { method: 'PUT', body: JSON.stringify({ clientId: 'me', clientSecret: 'good' }) })).json()) as any;
    hub.stop();
    assert.equal(state.tdx.clientSecret, mask('good'));
    assert.ok(!JSON.stringify(state).includes('"good"'));
    assert.equal(JSON.parse(readFileSync(store.path, 'utf8')).tdx.clientSecret, 'good');

    for (const id of ['bus-live', 'metro-static', 'metro-live']) {
      const st = (await (await admin(`/admin/api/connectors/${id}/run`, { method: 'POST' })).json()) as any;
      const c = st.connectors.find((x: { id: string }) => x.id === id);
      assert.ok(c.lastOk, `${id}：${c.error}`);
    }
    const s = (await (await fetch(`${base}/api/traffic/snapshot`)).json()) as any;
    assert.equal(s.source, 'live');
    assert.match(s.attribution, /TDX/);
    const modes = s.vehicles.map((v: { mode: string }) => v.mode).sort();
    assert.deepEqual(modes, ['bus', 'metro']);
    assert.equal(s.lines[0].name, '紅線');
    assert.equal(s.stations[0].arrivals[0].toward, '小港');
  });

  it('只送 Client ID 時保留原本的 Secret', async () => {
    await admin('/admin/api/tdx', { method: 'PUT', body: JSON.stringify({ clientId: 'me2' }) });
    hub.stop();
    assert.equal(store.tdx.clientSecret, 'good');
    assert.equal(store.tdx.clientId, 'me2');
  });

  it('停用來源、更新間隔不能低於下限', async () => {
    const st = (await (
      await admin('/admin/api/connectors/bus-live', { method: 'PUT', body: JSON.stringify({ enabled: false, intervalSec: 1 }) })
    ).json()) as any;
    hub.stop();
    const c = st.connectors.find((x: { id: string }) => x.id === 'bus-live');
    assert.equal(c.enabled, false);
    assert.equal(c.intervalSec, 10);
    const s = (await (await fetch(`${base}/api/traffic/snapshot`)).json()) as any;
    assert.ok(!s.vehicles.some((v: { mode: string }) => v.mode === 'bus'));
  });

  it('壞的請求回傳清楚的錯誤', async () => {
    assert.equal((await admin('/admin/api/connectors/nope/run', { method: 'POST' })).status, 404);
    const bad = await fetch(`${base}/admin/api/origins`, {
      method: 'PUT',
      headers: { authorization: 'Bearer admin-secret' },
      body: 'not json',
    });
    assert.equal(bad.status, 400);
  });

  it('限定允許的網站（CORS）', async () => {
    await admin('/admin/api/origins', { method: 'PUT', body: JSON.stringify({ allowedOrigins: ['https://andyzeng02.github.io'] }) });
    const ok = await fetch(`${base}/api/health`, { headers: { origin: 'https://andyzeng02.github.io' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://andyzeng02.github.io');
    const other = await fetch(`${base}/api/health`, { headers: { origin: 'https://example.com' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
  });
});

describe('設定檔', () => {
  it('第一次啟動自動產生管理者權杖並存檔', () => {
    const dir = mkdtempSync(join(tmpdir(), 'twsim-config-'));
    try {
      const s = new ConfigStore(dir, {});
      assert.equal(s.generatedToken, true);
      assert.ok(s.adminToken.length >= 20);
      const again = new ConfigStore(dir, {});
      assert.equal(again.generatedToken, false);
      assert.equal(again.adminToken, s.adminToken);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('環境變數優先', () => {
    const dir = mkdtempSync(join(tmpdir(), 'twsim-config-'));
    try {
      const s = new ConfigStore(dir, { TDX_CLIENT_ID: 'a', TDX_CLIENT_SECRET: 'b', PORT: '9000', ADMIN_TOKEN: 't' });
      assert.deepEqual(s.tdx, { clientId: 'a', clientSecret: 'b' });
      assert.equal(s.tdxFromEnv, true);
      assert.equal(s.port, 9000);
      assert.equal(s.generatedToken, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('TDX 連線', () => {
  it('網路錯誤換成看得懂的說明', async () => {
    const down: Fetch = async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    };
    const c = new TdxClient(() => ({ clientId: 'a', clientSecret: 'b' }), down, 0);
    await assert.rejects(c.getToken(), /連不上 TDX 伺服器（ENOTFOUND）/);
  });
});
