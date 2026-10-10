# 台灣微縮模擬：高雄 3D 地景

以真實地形與 OpenStreetMap 地景呈現的 3D 高雄：海岸、河流、湖泊、山區、市區建築，以及 38 個行政區。
**即時交通**：在 3D 地景上看公車、捷運、輕軌、臺鐵與道路路況（資料來自交通部 TDX），附資料串接的管理後台。
另有災害應變劇本「地震 72 小時」（目前暫停開發，仍可遊玩）。

> 本遊戲為虛構情境，非地震預測；數值為遊戲調校用，不代表真實災情。

## 線上版

推送到 `main` 後會自動部署到 GitHub Pages：https://andyzeng02.github.io/TWSimGame/
（第一次使用前要在 GitHub → Settings → Pages 把 Source 設成「GitHub Actions」；設定檔在 `.github/workflows/pages.yml`）

瀏覽統計用 [GoatCounter](https://www.goatcounter.com)（不用 cookie，本機開發不計入），數據看 https://andyzeng02.goatcounter.com 。

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

## 即時交通（Windows）

即時交通需要另外執行「交通資料伺服器」，它負責保管 TDX 金鑰並定時抓資料。沒有伺服器時，交通模式會顯示示範資料（約略位置的捷運）。

1. 到 [TDX 運輸資料流通服務](https://tdx.transportdata.tw/register) 註冊免費會員，在「會員中心 → 資料服務 → API 金鑰」取得 Client ID 與 Client Secret。
2. 開兩個 PowerShell 視窗：

   ```powershell
   # 視窗 1：交通資料伺服器（第一次啟動會印出「管理者權杖」，請記下來）
   cd E:\ClaudeCode\TWSimGame
   npm run server

   # 視窗 2：網頁版
   cd E:\ClaudeCode\TWSimGame
   npm run dev
   ```

3. 瀏覽器開 http://localhost:5173/admin.html ，伺服器網址填 `http://localhost:8787`、貼上管理者權杖登入，
   在「TDX 帳號」填入 Client ID／Secret，按「測試連線」再「儲存並重新抓取」。
4. 開 http://localhost:5173/?mode=traffic&traffic=http://localhost:8787 （或在地圖按「即時交通」，面板裡的「交通資料伺服器」填網址）。

- 管理後台可以開關每個資料來源、調整更新間隔、立即更新、看錯誤紀錄。
- 忘記權杖：看 `apps\server\data\config.json` 的 `adminToken`。這個檔案有金鑰，不會進版控。
- 線上版（GitHub Pages）也能連你電腦上的伺服器：用 Chrome 或 Edge 開線上版的交通模式，伺服器網址填 `http://localhost:8787`。

## 行政區資料

`data/world/kaohsiung.json` 已由國土測繪中心的界線檔產生（真實 38 區外框）。資料更新時重新執行，
步驟見 [pipeline/README.md](pipeline/README.md)：

```powershell
npm run build-world -- --boundaries "pipeline\raw\鄉(鎮、市、區)界線1140318\TOWN_MOI_1140318.shp" --population "pipeline\raw\opendata11508M030.csv" --shelters "pipeline\raw\避難收容處所點位檔案v9.csv" --faults pipeline\data\faults-gsmma-2025.geojson
```

## 怎麼玩

- 交通模式：工具列「即時交通」或 T 鍵。左側可開關捷運、輕軌、臺鐵、公車、路況、公共自行車；點車輛看路線與車速，點車站看下一班車，點路段看平均車速。

- 觀景模式：點任一區，鏡頭會飛過去並顯示面積與人口；「重設視角」回到開場鏡頭。
- 「地標導覽」：依序飛過 85 大樓、旗津、壽山、蓮池潭、澄清湖、佛光山、美濃、茂林、藤枝與玉山方向；再按一次或動一下地圖就停止。
- 「時段」可切換清晨、白天、黃昏、夜晚，或「自動」依台灣現在時間變化。
- 「截圖」把目前畫面存成圖片（附標題與資料來源）；手機上會直接開分享選單。
- 手機或較舊的電腦會自動進入省電模式；網址加 `?quality=high` 可強制高畫質，`?quality=low` 強制省電。
- 拉近到山區（zoom 11 以上）會出現等高線，每 250 公尺一條粗線並標高度；山峰標名稱與高度。
- 指揮模式：空白鍵或「開始」讓時間開始走，每 1.2 秒一小時（可切 2×、4×）。
- 滑鼠左鍵拖曳平移、右鍵拖曳旋轉與俯仰、滾輪縮放。
- 點地圖上的區塊或區名：右側顯示該區狀況與可執行的行動。
- 每個行動花指揮點數，點數每小時回復 2 點，永遠不夠用，取捨就是玩法。
- 左側可切換災情圖層（受困、醫療、物資、秩序、震度、純地圖）、山體陰影、3D 建築與街道（觀景模式的工具列也有）。
- 第一次進指揮模式會有教學引導，之後可按「教學」重看。
- 結算畫面會畫出 72 小時的受困與死亡變化，並列出你每一小時下的決策。
- 指揮面板可選難度：輕度（規模約 6.6）、標準（6.8）、嚴重（7.0）；網址加 `?difficulty=easy`／`normal`／`hard` 可直接指定。
- 網址加 `?seed=123` 可以重玩同一場地震（同時指定難度才會完全相同）。
- 「關於」頁與結算畫面有「意見回饋」，會開一則預先填好遊戲資訊的 GitHub Issue。

## 專案結構

| 路徑 | 內容 |
| --- | --- |
| `packages/sim-core` | 模擬核心（與畫面無關，可無畫面執行） |
| `packages/rules-game` | 地震 72 小時規則、機器人玩家、批次跑分 |
| `packages/traffic` | 即時交通格式、TDX 資料轉換、示範資料 |
| `apps/server` | 交通資料伺服器（TDX 串接、管理 API） |
| `packages/geo` | 地理工具：Shapefile、TWD97 座標、多邊形、CSV |
| `apps/web` | 網頁版（Vite + MapLibre 3D 地景地圖）、管理後台 `admin.html` |
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
- 即時交通：交通部 TDX 運輸資料流通服務（政府資料開放授權條款）

OpenFreeMap 免費、免金鑰、可商用；正式上架前建議自架圖磚，設定在 `apps/web/src/map/config.ts`。
