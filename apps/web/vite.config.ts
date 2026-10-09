import { defineConfig } from 'vite';

export default defineConfig({
  // 部署到子路徑（例如 GitHub Pages）時改這裡
  base: './',
  server: {
    port: 5173,
    // 允許讀取 repo 根目錄的 data/world/*.json
    fs: { allow: ['../..'] },
  },
});
