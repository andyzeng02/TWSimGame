/**
 * 交通資料伺服器進入點：npm run server
 *
 * 第一次啟動會在 apps/server/data/config.json 產生管理者權杖並印在畫面上，
 * 用它登入管理後台（網頁版的 admin.html）設定 TDX 帳號。
 */
import { ConfigStore } from './config';
import { Hub } from './hub';
import { createApi } from './http';
import { TdxClient } from './tdx';

const store = new ConfigStore();
const tdx = new TdxClient(() => store.tdx);
const hub = new Hub(store, tdx);
const server = createApi(store, hub, tdx);

server.listen(store.port, () => {
  const base = `http://localhost:${store.port}`;
  console.log('');
  console.log(`交通資料伺服器已啟動：${base}`);
  console.log(`  即時交通資料：${base}/api/traffic/snapshot`);
  console.log(`  管理後台：先執行 npm run dev，再開 http://localhost:5173/admin.html`);
  console.log(`  設定檔：${store.path}`);
  if (store.generatedToken) {
    console.log('');
    console.log(`  已產生管理者權杖（登入後台用，也存在設定檔裡）：${store.adminToken}`);
  }
  console.log('');
  hub.start();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    hub.stop();
    server.close(() => process.exit(0));
  });
}
