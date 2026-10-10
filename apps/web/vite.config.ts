import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // 部署到子路徑（例如 GitHub Pages）時改這裡
  base: './',
  server: {
    port: 5173,
    // 允許讀取 repo 根目錄的 data/world/*.json
    fs: { allow: ['../..'] },
  },
  build: {
    // 兩個頁面：地圖（index.html）與交通資料管理後台（admin.html）
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
