/**
 * HTTP API（只用 Node 內建的 http，不另外裝框架）。
 *
 * 公開：
 *   GET  /api/health                     伺服器是否正常
 *   GET  /api/traffic/snapshot           前端用的即時交通資料（TrafficSnapshot）
 *
 * 管理（需要 Authorization: Bearer <管理者權杖>）：
 *   GET  /admin/api/state                設定（金鑰遮蔽）、各來源狀態、紀錄
 *   PUT  /admin/api/tdx                  { clientId, clientSecret } 設定 TDX 帳號
 *   POST /admin/api/tdx/test             測試 TDX 帳號能不能取得權杖
 *   PUT  /admin/api/connectors/:id       { enabled?, intervalSec? }
 *   POST /admin/api/connectors/:id/run   立即更新一次
 *   PUT  /admin/api/origins              { allowedOrigins: string[] }
 */
import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { mask, type ConfigStore } from './config';
import { CONNECTOR_BY_ID, CONNECTORS } from './connectors';
import type { Hub } from './hub';
import type { TdxClient } from './tdx';

const MAX_BODY = 64 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createApi(store: ConfigStore, hub: Hub, tdx: TdxClient): Server {
  return createServer((req, res) => {
    handle(req, res).catch((e: unknown) => {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      send(req, res, status, { error: e instanceof Error ? e.message : String(e) });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    cors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const route = `${req.method} ${path}`;

    if (route === 'GET /api/health') return send(req, res, 200, { ok: true, tdxConfigured: tdx.configured });
    if (route === 'GET /api/traffic/snapshot') return send(req, res, 200, hub.snapshot());

    if (path.startsWith('/admin/api/')) {
      authorize(req);
      if (route === 'GET /admin/api/state') return send(req, res, 200, adminState());
      if (route === 'PUT /admin/api/tdx') {
        if (store.tdxFromEnv) throw new HttpError(409, 'TDX 帳號由環境變數設定，請改環境變數');
        const body = await readJson(req);
        const clientId = String(body.clientId ?? '').trim();
        const secret = typeof body.clientSecret === 'string' ? body.clientSecret.trim() : undefined;
        store.config.tdx.clientId = clientId;
        // 沒送 clientSecret（只改 ID）就保留原本的
        if (secret !== undefined && secret !== '') store.config.tdx.clientSecret = secret;
        if (!clientId) store.config.tdx.clientSecret = '';
        store.save();
        hub.info(clientId ? 'TDX 帳號已更新，重新抓取全部來源' : 'TDX 帳號已清除');
        hub.restartAll();
        return send(req, res, 200, adminState());
      }
      if (route === 'POST /admin/api/tdx/test') {
        tdx.resetToken();
        try {
          await tdx.getToken();
          hub.info('TDX 帳號測試成功');
          return send(req, res, 200, { ok: true, message: '成功取得 TDX 權杖' });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          hub.error(`TDX 帳號測試失敗：${message}`);
          return send(req, res, 200, { ok: false, message });
        }
      }
      if (route === 'PUT /admin/api/origins') {
        const body = await readJson(req);
        const list = Array.isArray(body.allowedOrigins) ? body.allowedOrigins.map(String).map((s) => s.trim()).filter(Boolean) : [];
        store.config.allowedOrigins = list.length ? list : ['*'];
        store.save();
        hub.info(`允許來源更新為：${store.config.allowedOrigins.join('、')}`);
        return send(req, res, 200, adminState());
      }
      const m = /^\/admin\/api\/connectors\/([\w-]+)(\/run)?$/.exec(path);
      if (m && CONNECTOR_BY_ID.has(m[1])) {
        const id = m[1];
        if (req.method === 'PUT' && !m[2]) {
          const body = await readJson(req);
          hub.updateSetting(id, {
            enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
            intervalSec: Number.isFinite(Number(body.intervalSec)) && body.intervalSec !== undefined ? Number(body.intervalSec) : undefined,
          });
          return send(req, res, 200, adminState());
        }
        if (req.method === 'POST' && m[2]) {
          await hub.run(id);
          return send(req, res, 200, adminState());
        }
      }
    }
    throw new HttpError(404, `找不到：${route}`);
  }

  function adminState() {
    const tdxCred = store.tdx;
    return {
      server: { startedAt, tdxCalls: tdx.calls, allowedOrigins: store.allowedOrigins },
      tdx: { clientId: tdxCred.clientId, clientSecret: mask(tdxCred.clientSecret), configured: tdx.configured, fromEnv: store.tdxFromEnv },
      connectors: CONNECTORS.map((def) => {
        const st = hub.state.get(def.id)!;
        return {
          id: def.id,
          name: def.name,
          group: def.group,
          description: def.description,
          paths: def.paths,
          minIntervalSec: def.minIntervalSec,
          ...hub.setting(def.id),
          lastRun: st.lastRun,
          lastOk: st.lastOk,
          nextRun: st.nextRun,
          error: st.error,
          count: st.count,
          durationMs: st.durationMs,
          running: st.running,
        };
      }),
      snapshot: summarize(),
      log: hub.log.slice(-80).reverse(),
    };
  }

  function summarize() {
    const s = hub.snapshot();
    const byMode: Record<string, number> = {};
    for (const v of s.vehicles) byMode[v.mode] = (byMode[v.mode] ?? 0) + 1;
    return { source: s.source, updatedAt: s.updatedAt, vehicles: byMode, stations: s.stations.length, lines: s.lines.length, roads: s.roads.length };
  }

  function authorize(req: IncomingMessage) {
    const given = Buffer.from(/^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '');
    const want = Buffer.from(store.adminToken);
    if (!want.length || given.length !== want.length || !timingSafeEqual(given, want)) {
      throw new HttpError(401, '管理者權杖錯誤');
    }
  }

  function cors(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    const allowed = store.allowedOrigins;
    if (allowed.includes('*')) res.setHeader('access-control-allow-origin', '*');
    else if (origin && allowed.includes(origin)) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
    }
    res.setHeader('access-control-allow-methods', 'GET, PUT, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'authorization, content-type');
    // 讓公開網址（https）的網頁可以連本機伺服器（Chrome 的私人網路存取檢查）
    if (req.headers['access-control-request-private-network']) res.setHeader('access-control-allow-private-network', 'true');
  }
}

const startedAt = new Date().toISOString();

function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown) {
  let data: Buffer = Buffer.from(JSON.stringify(body));
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (data.length > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
    data = gzipSync(data);
    headers['content-encoding'] = 'gzip';
  }
  res.writeHead(status, headers).end(data);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, '資料太大');
    chunks.push(c as Buffer);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // 落到下面
  }
  throw new HttpError(400, '請送 JSON 物件');
}
