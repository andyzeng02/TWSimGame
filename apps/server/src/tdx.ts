/**
 * TDX 運輸資料流通服務的連線：取得存取權杖（client credentials）、排隊呼叫 API。
 *
 * - 權杖快取到過期前 1 分鐘。
 * - 所有請求排隊，間隔至少 minGapMs，避免超過 TDX 的每秒呼叫上限。
 * - fetch 可以替換（測試用）。
 */

export const TDX_AUTH_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
export const TDX_API_BASE = 'https://tdx.transportdata.tw/api/basic';

export type Fetch = typeof fetch;

export class TdxError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class TdxClient {
  private token: { value: string; expires: number } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;
  /** 累計呼叫次數（後台顯示） */
  calls = 0;

  constructor(
    private credentials: () => { clientId: string; clientSecret: string },
    private fetchImpl: Fetch = fetch,
    private minGapMs = 250,
  ) {}

  get configured(): boolean {
    const c = this.credentials();
    return Boolean(c.clientId && c.clientSecret);
  }

  /** 帳號換了就丟掉舊權杖 */
  resetToken() {
    this.token = null;
  }

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expires) return this.token.value;
    const { clientId, clientSecret } = this.credentials();
    if (!clientId || !clientSecret) throw new TdxError('尚未設定 TDX 帳號（Client ID／Client Secret）');
    const res = await this.fetchSafe(TDX_AUTH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    });
    if (!res.ok) {
      throw new TdxError(res.status === 400 || res.status === 401 ? 'TDX 帳號驗證失敗，請檢查 Client ID 與 Client Secret' : `TDX 驗證服務錯誤（HTTP ${res.status}）`, res.status);
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new TdxError('TDX 驗證服務沒有回傳權杖');
    this.token = { value: body.access_token, expires: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 };
    return this.token.value;
  }

  /** 呼叫 TDX API。path 例：/v2/Bus/RealTimeByFrequency/City/Kaohsiung */
  get(path: string): Promise<unknown> {
    const run = async () => {
      const wait = this.lastCall + this.minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCall = Date.now();
      this.calls++;
      const token = await this.getToken();
      const url = `${TDX_API_BASE}${path}${path.includes('?') ? '&' : '?'}%24format=JSON`;
      const res = await this.fetchSafe(url, { headers: { authorization: `Bearer ${token}`, 'accept-encoding': 'gzip' } });
      if (res.status === 401) this.resetToken();
      if (!res.ok) {
        const reason = res.status === 429 ? '超過 TDX 呼叫次數限制，請把更新間隔調長' : res.status === 401 ? '權杖失效，下次會重新取得' : `HTTP ${res.status}`;
        throw new TdxError(`${path}：${reason}`, res.status);
      }
      return res.json();
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** 網路層的錯誤（DNS、連線被拒、逾時）換成看得懂的說明 */
  private async fetchSafe(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      const name = (e as { name?: string }).name;
      const detail = name === 'TimeoutError' ? '逾時 30 秒' : (cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : String(e)));
      throw new TdxError(`連不上 TDX 伺服器（${detail}），請確認這台電腦能上網`);
    }
  }
}
