# 台灣微縮模擬：高雄 3D 地景

以真實地形與 OpenStreetMap 地景呈現的 3D 高雄：海岸、河流、湖泊、山區、市區建築，以及 38 個行政區。
內含災害應變劇本「地震 72 小時」：大地震之後，你有 72 個遊戲小時調度搜救、醫療、物資與道路搶修。

> 本遊戲為虛構情境，非地震預測；數值為遊戲調校用，不代表真實災情。

## 線上版

推送到 `main` 後會自動部署到 GitHub Pages：https://andyzeng02.github.io/TWSimGame/
（第一次使用前要在 GitHub → Settings → Pages 把 Source 設成「GitHub Actions」；設定檔在 `.github/workflows/pages.yml`）

## 快速開始（Windows）

需要 [Node.js 22 以上](https://nodejs.org/)。

```powershell
cd E:\ClaudeCode\TWSimGame
npm install
npm test          # 確認環境正常（應全部通過）
npm run dev       # 瀏覽器開 http://localhost:5173
```

開啟後先進入「觀景模式」：可自由旋轉、縮放高雄的 3D 地景（真實地形、海岸、河流、湖泊、山區，拉近可看到 3D 建築）。
按「地震 72 小時」或 H 鍵切換到遊戲。需要網路（地圖圖磚即時下載）。

## 行政區資料

`data/world/kaohsiung.json` 已由國土測繪中心的界線檔產生（真實 38 區外框）。資料更新時重新執行，
步驟見 [pipeline/README.md](pipeline/README.md)：

```powershell
npm run build-world -- --boundaries pipeline\raw\TOWN_MOI_1140318.shp
```

## 怎麼玩

- 觀景模式：點任一區，鏡頭會飛過去並顯示面積與人口；「重設視角」回到開場鏡頭。
- 指揮模式：空白鍵或「開始」讓時間開始走，每 1.2 秒一小時（可切 2×、4×）。
- 滑鼠左鍵拖曳平移、右鍵拖曳旋轉與俯仰、滾輪縮放。
- 點地圖上的區塊或區名：右側顯示該區狀況與可執行的行動。
- 每個行動花指揮點數，點數每小時回復 2 點，永遠不夠用，取捨就是玩法。
- 左側可切換災情圖層（受困、醫療、物資、秩序、震度、純地圖）、山體陰影與 3D 建築。
- 網址加 `?seed=123` 可以重玩同一場地震。

## 專案結構

| 路徑 | 內容 |
| --- | --- |
| `packages/sim-core` | 模擬核心（與畫面無關，可無畫面執行） |
| `packages/rules-game` | 地震 72 小時規則、機器人玩家、批次跑分 |
| `packages/geo` | 地理工具：Shapefile、TWD97 座標、多邊形、CSV |
| `apps/web` | 網頁版（Vite + MapLibre 3D 地景地圖） |
| `pipeline` | 資料管線：政府開放資料 → 世界檔 |
| `data/world` | 世界檔 |
| `tools` | 輔助腳本 |
| `docs` | 架構說明、開發路線圖、技術決策紀錄 |

- 開發規則與指令：[CLAUDE.md](CLAUDE.md)
- 架構：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- 接下來要做什麼：[docs/ROADMAP.md](docs/ROADMAP.md)
- 為什麼這樣做：[docs/DECISIONS.md](docs/DECISIONS.md)

## 地圖資料來源

- 底圖：OpenFreeMap（© OpenMapTiles、© OpenStreetMap 貢獻者）
- 高程：Mapzen Terrain Tiles（AWS Open Data，含 SRTM 等來源）
- 行政區界線：內政部國土測繪中心「鄉鎮市區界線」（政府資料開放授權條款）

OpenFreeMap 免費、免金鑰、可商用；正式上架前建議自架圖磚，設定在 `apps/web/src/map/config.ts`。
