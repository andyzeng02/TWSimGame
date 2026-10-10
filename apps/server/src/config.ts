/**
 * 伺服器設定：存在 data/config.json（不進版控，裡面有 TDX 金鑰與管理者權杖）。
 *
 * 環境變數優先於設定檔：
 *   PORT、ADMIN_TOKEN、TDX_CLIENT_ID、TDX_CLIENT_SECRET、TRAFFIC_DATA_DIR、ALLOWED_ORIGINS（逗號分隔）
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ConnectorSetting {
  enabled: boolean;
  intervalSec: number;
}

export interface ServerConfig {
  port: number;
  adminToken: string;
  tdx: { clientId: string; clientSecret: string };
  /** 允許哪些網站呼叫 API（CORS）；["*"] = 全部 */
  allowedOrigins: string[];
  connectors: Record<string, ConnectorSetting>;
}

export const DEFAULT_PORT = 8787;

export function defaultDataDir(): string {
  return process.env.TRAFFIC_DATA_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '../data');
}

export class ConfigStore {
  readonly path: string;
  config: ServerConfig;
  /** 第一次啟動時自動產生的管理者權杖（main 會印出來） */
  generatedToken = false;

  constructor(dir = defaultDataDir(), private env: NodeJS.ProcessEnv = process.env) {
    this.path = join(dir, 'config.json');
    const saved = existsSync(this.path) ? (JSON.parse(readFileSync(this.path, 'utf8')) as Partial<ServerConfig>) : {};
    this.config = {
      port: Number(saved.port) || DEFAULT_PORT,
      adminToken: saved.adminToken ?? '',
      tdx: { clientId: saved.tdx?.clientId ?? '', clientSecret: saved.tdx?.clientSecret ?? '' },
      allowedOrigins: saved.allowedOrigins?.length ? saved.allowedOrigins : ['*'],
      connectors: saved.connectors ?? {},
    };
    if (!this.config.adminToken && !env.ADMIN_TOKEN) {
      this.config.adminToken = randomBytes(18).toString('base64url');
      this.generatedToken = true;
      this.save();
    }
  }

  /** 實際生效的值（環境變數優先） */
  get port(): number {
    return Number(this.env.PORT) || this.config.port;
  }
  get adminToken(): string {
    return this.env.ADMIN_TOKEN || this.config.adminToken;
  }
  get tdx(): { clientId: string; clientSecret: string } {
    return {
      clientId: this.env.TDX_CLIENT_ID || this.config.tdx.clientId,
      clientSecret: this.env.TDX_CLIENT_SECRET || this.config.tdx.clientSecret,
    };
  }
  /** TDX 帳號是否由環境變數提供（後台就不能改） */
  get tdxFromEnv(): boolean {
    return Boolean(this.env.TDX_CLIENT_ID && this.env.TDX_CLIENT_SECRET);
  }
  get allowedOrigins(): string[] {
    const env = this.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
    return env?.length ? env : this.config.allowedOrigins;
  }

  save() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.config, null, 2) + '\n', 'utf8');
  }
}

/** 金鑰只顯示頭尾，給後台看「有沒有設定」用 */
export function mask(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '•'.repeat(secret.length);
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}
