# 架構說明

最後更新：2026-10-10（加入即時交通）

## 一句話

政府開放資料經資料管線變成「世界檔」，模擬核心在世界檔上跑劇本規則，網頁版用 MapLibre 把真實地形、OpenStreetMap 地景和模擬結果畫在一起。
即時交通由交通資料伺服器向 TDX 定時抓取、整理後提供給網頁版的交通模式。

## 即時交通的資料流

```
 交通部 TDX API ──(Client ID／Secret，只在伺服器)──▶ apps/server
   公車 GPS、捷運／輕軌到站、臺鐵列車、市區路況、公共自行車      │ hub.ts 定時抓取（connectors.ts 列出每個來源）
                                                              │ packages/traffic 轉成統一格式 TrafficSnapshot
                                                              ▼
                             GET /api/traffic/snapshot ──▶ apps/web 交通模式（traffic/feed.ts → ui/trafficPanel.ts → MapView）
                             /admin/api/*（管理者權杖）◀── apps/web/admin.html 管理後台
```

沒有設定伺服器、連不上、或伺服器還沒有 TDX 資料時，網頁版改用 `packages/traffic` 的示範資料（約略位置的捷運紅、橘線，依班距移動），畫面標示「示範」。

## 分層與資料流

```
 政府開放資料（SHP / CSV）                 網路圖磚（執行時下載）
        │                                   ├─ OpenFreeMap 向量地圖（OSM）
        ▼                                   └─ AWS Terrain Tiles 高程
 pipeline/build-world.ts  ──用──▶ packages/geo                │
        │                                                     │
        ▼                                                     │
 data/world/kaohsiung.json（世界檔）                           │
        │                                                     │
        ├──────────────▶ packages/sim-core ◀── packages/rules-game
        │                 （狀態、tick、事件）    （地震 72 小時、機器人）
        │                        │
        ▼                        ▼
 apps/web ── map/MapView（MapLibre）◀───────────────────────────┘
          ── ui/Hud、game.ts（遊戲介面與時間推進）
```

依賴方向只能由上往下、由外往內。`sim-core` 與 `geo` 是最底層，不依賴任何其他套件。

## 模組

| 路徑 | 職責 | 依賴 | 執行環境 |
| --- | --- | --- | --- |
| `packages/sim-core` | 世界與狀態型別、tick 迴圈、事件佇列、擴散、可重現亂數、重播、世界檔檢查 | 無 | 瀏覽器、Node |
| `packages/geo` | Shapefile/DBF 讀取、TWD97 TM2 轉換、多邊形工具、CSV | 無 | 瀏覽器、Node |
| `packages/rules-game` | 地震 72 小時規則、遊戲數值、機器人玩家、批次跑分 | sim-core | 瀏覽器、Node |
| `packages/traffic` | 即時交通統一格式、TDX 回應轉換、示範資料 | 無 | 瀏覽器、Node |
| `apps/server` | 交通資料伺服器：TDX 連線、定時抓取、公開 API 與管理 API | traffic | Node |
| `pipeline` | 政府開放資料 → 世界檔 | geo、sim-core | Node |
| `apps/web` | 3D 地景地圖、遊戲介面、交通模式、管理後台（`admin.html`） | sim-core、rules-game、traffic、maplibre-gl | 瀏覽器 |
| `tools` | 輔助腳本（產生草稿世界） | sim-core | Node |

## 世界檔（data/world/*.json）

格式定義在 `packages/sim-core/src/types.ts` 的 `World`。

| 欄位 | 內容 |
| --- | --- |
| `meta` | id、名稱、版本、資料來源說明 |
| `regions[]` | 每區：行政區代碼、名稱、代表點、面積、人口、其他屬性、外框多邊形 |
| `edges[]` | 相鄰區之間的連線（模擬用：傷患轉送、通行率） |
| `faults[]` | 斷層線（地震劇本的震源） |
| `facilities[]` | 選用。設施點：種類（`hospital`、`shelter`）、名稱、座標、所在區、容量 |

`meta.sources` 記錄每份來源資料的用途、提供單位、檔名、版本與授權（資料管線自動產生，版本從檔名的民國日期讀出；`draft: true` 表示暫用約略值），`meta.builtAt` 是產生日期。畫面上的「關於」頁（`ui/about.ts`）會列出這些來源，加上 `map/config.ts` 的 `MAP_SOURCES`（地圖用的線上服務與程式庫）。

| 檔案 | 狀態 |
| --- | --- |
| `kaohsiung.json` | 正式世界檔。38 區外框來自國土測繪中心 TOWN_MOI_1140318；人口來自戶政司 115 年 8 月；斷層依 2025 分布圖數化；避難收容處所 504 處；尚無醫院檔（畫面改用 OSM 醫院點、病床依人口估算） |
| `kaohsiung.sample.json` | 草稿世界（約略值）。測試與資料管線的備用來源 |

網頁版與批次跑分會優先用 `kaohsiung.json`，沒有時才用草稿。

## 地圖（apps/web/src/map）

底圖樣式是專案自有的（階段 1.1）：

| 檔案 | 內容 |
| --- | --- |
| `map/style/base.json` | 圖層結構：OpenFreeMap liberty 樣式的副本（MIT 授權），圖磚、字型、圖示仍指向 OpenFreeMap |
| `map/style/index.ts` | `buildStyle()`：把配色套到各圖層；去掉寫實陰影底圖與公園虛線；補畫農地；城鎮名稱去黑點、加大 |
| `map/config.ts` 的 `PALETTE` | 插畫風配色與字級（陸地、水、綠地、農地、市區、道路、建築、文字、山體陰影）。調風格只改這裡 |

圖層由下往上：

1. 自有樣式底圖：海、陸地、森林、草地、農地、河流（主要河川 `waterway_major` 加粗）、湖泊、道路
2. 山體陰影（hillshade，DEM）
3. 等高線 `contour-lines`（zoom 11 起；`maplibre-contour` 在 worker 裡從同一份 DEM 即時計算，間距在 `config.ts` 的 `CONTOUR`）
4. 3D 建築（底圖內建，zoom 14 以上）
5. 災情著色 `districts-fill`（feature-state；觀景模式隱藏）
6. 區界 `districts-casing` + `districts-line`
7. 山與水的名稱：主要河川 `waterway_major_label`、湖泊 `lake_name`（`config.ts` 的 `LAKES`）、山峰 `mountain_peak_dot` / `mountain_peak_label`（名稱＋高度）
8. 底圖的地名標籤（已改成中文）、等高線高度 `contour-labels`
9. 區名 `district-labels`、斷層 `faults`、醫院與避難所 `facility-dots` / `facility-labels`（世界檔沒有醫院時改用 OSM 醫院點 `osm-hospitals`；指揮模式才顯示）、搜救隊 `teams`

時段：`MapView.setTimeOfDay()` 依 `config.ts` 的 `TIMES` 換天空、光線（`setLight`）、山體陰影方向與配色（清晨、黃昏是白天配色混暖色；夜晚用 `NIGHT_PALETTE`）。只改 paint 屬性、不重建樣式；改完要清掉地形貼圖快取（`freeRtt`），樣式也關掉 paint 漸變，否則地表會殘留舊顏色。

省電模式：觸控裝置或 CPU 核心數 ≤ 4 時降低繪圖解析度、縮小圖磚快取、等高線晚一點出現（`MAP_CONFIG.lowPower`）。

截圖：`MapView.capture()` 在繪製當下複製畫面；`ui/screenshot.ts` 加上標題列與資料來源，手機開分享選單，電腦下載 PNG。

載入畫面：`ui/loading.ts` 用世界檔的行政區外框畫高雄剪影，依載入進度填色。

遊戲紀錄：`Game.history` 記下每小時實際執行的行動與全市數字（第 0 筆是地震剛發生時），結算畫面用它畫變化圖與決策時間軸。教學看完與否記在瀏覽器 `localStorage`（`twsim.tutorial.done`），存不了時下次會再出現，不影響遊戲。

震波：`MapView.playShockwave(中心, 強度)`，由 `Hud` 在事件紀錄出現新的 `quake`／`aftershock` 時呼叫（中心取震源斷層的中點）。動畫每一格改 GeoJSON 資料而不是 paint，3D 地形上才會正確更新；設定在 `config.ts` 的 `SHOCKWAVE`。

地標導覽：`MapView.startTour()` 依 `config.ts` 的 `LANDMARKS` 依序 `flyTo`，節奏在 `TOUR`；使用者動地圖就自動停止。

地形用 `setTerrain` 套在整張地圖上，所有圖層會自動貼在地表。高程圖磚含海底地形，透過自訂協定 `flatsea://` 在瀏覽器裡把負高程改成 0（`MAP_CONFIG.flattenSea`），海面才會是平的；等高線也只畫 0 公尺以上。天空與遠景霧氣用 `setSky`。

交通模式：`traffic-roads`（路況著色）、`traffic-lines`（軌道路線）、`traffic-stations`／`traffic-bikes`（車站、公共自行車站）、`traffic-vehicles`（車輛）。壅塞程度在 `packages/traffic` 算好，地圖只依 `level` 上色；車輛在兩次更新之間從舊位置滑到新位置（`TRAFFIC.animateMaxMs`），距離超過 `TRAFFIC.snapKm` 直接跳過去。顏色與更新頻率在 `config.ts` 的 `TRAFFIC`。

`MapView` 對外只提供這些方法，不含任何遊戲規則：
`select`、`onSelect`、`setSeverity`、`setTeams`、`setSceneMode`、`setHillshade`、`setBuildings`、`setRoads`、`resetView`、`startTour`、`stopTour`、`onTourStop`、`setTimeOfDay`、`capture`、`setFacilities`、`playShockwave`、`setTrafficMode`、`setTrafficHidden`、`setTraffic`、`onTrafficPick`、`showPopup`、`closePopup`。

## 交通資料伺服器（apps/server）

| 檔案 | 內容 |
| --- | --- |
| `src/main.ts` | 進入點（`npm run server`，預設 port 8787） |
| `src/config.ts` | 設定檔 `apps/server/data/config.json`（不進版控）；環境變數 `PORT`、`ADMIN_TOKEN`、`TDX_CLIENT_ID`、`TDX_CLIENT_SECRET`、`ALLOWED_ORIGINS`、`TRAFFIC_DATA_DIR` 優先 |
| `src/tdx.ts` | TDX 權杖快取、所有請求排隊（間隔 ≥ 250 毫秒）、錯誤訊息中文化 |
| `src/connectors.ts` | 資料來源清單：TDX 路徑、預設與最短更新間隔、預設是否啟用 |
| `src/hub.ts` | 定時執行來源（失敗 60 秒後重試）、保存原始回應、合併成 `TrafficSnapshot`（有新資料才重算） |
| `src/http.ts` | 公開 API（`/api/health`、`/api/traffic/snapshot`）與管理 API（`/admin/api/*`，Bearer 權杖）；CORS；回應超過 1 KB 用 gzip |

第一次啟動自動產生管理者權杖並印在畫面上。金鑰只在後台顯示頭尾（`mask`）。

## 模擬（sim-core + rules-game）

- 1 tick = 1 小時。每個 tick 的順序固定：玩家行動 → 到期事件 → 擴散（spread）→ 區內更新（local）→ 檢查結束。
- 狀態是「一個變數一個陣列」（`vars['trapped'][區索引]`），劇本可自由增加變數。
- 只用 `ctx.rng`，同一個種子加上同一串行動，結果必定相同，可存檔、重播、批次測試。
- 遊戲數值全部在 `rules-game/src/earthquake/config.ts`。難度（`DIFFICULTIES`）也在這裡，只覆寫部分數值；`Game` 依玩家選的難度建立規則，`npm run batch` 會逐一跑三種難度。
- 世界檔的 `facilities` 會影響模擬：病床依序取區屬性 `hospitalBeds` → 醫院設施的病床加總（`hospitalBedsByRegion`）→ 依人口估算；區內有登記避難收容處所時，避難所開設時間用 `shelterOpenTicksRegistered`。

## 外部服務

| 服務 | 用途 | 授權 / 費用 | 風險 |
| --- | --- | --- | --- |
| OpenFreeMap | 向量圖磚、字型、圖示；樣式副本（MIT） | 免費、可商用，需標示 OSM | 公共服務，無 SLA；正式上架前改自架 |
| AWS Terrain Tiles | 高程 | Open Data，需標示 | 同上 |
| 國土測繪中心 | 行政區界線 | 政府資料開放授權條款 | 每年更新，需重跑管線 |
| 內政部戶政司 | 村里人口 | 政府資料開放授權條款 | 每月更新，需重跑管線 |
| 內政部消防署 | 避難收容處所點位 | 政府資料開放授權條款 | 不定期更新 |
| 地質調查及礦業管理中心 | 活動斷層（依 2025 分布圖數化） | 標示來源 | 位置約略；有向量檔時替換 |
| GitHub Pages | 線上版網頁（`main` 自動部署） | 公開 repo 免費 | 網址公開；打包內容任何人可讀，不可放金鑰 |
| 交通部 TDX 運輸資料流通服務 | 即時交通（公車、捷運、輕軌、臺鐵、市區路況、公共自行車），由 `apps/server` 呼叫 | 政府資料開放授權條款；免費會員有每秒與每日呼叫上限 | 需要帳號與金鑰；金鑰只能放伺服器 |
| GoatCounter | 線上版瀏覽統計（`apps/web/index.html`） | 非商業免費、不用 cookie | 外部腳本；被擋時遊戲照常運作，只是不計數 |

## 已知技術債

- `MapView` 的遊戲圖層（區界、區名、災情著色）定義寫在程式裡；底圖樣式已抽出（`map/style/`）。
- 地圖完全依賴線上圖磚，離線或 Steam 版需要自架或打包圖磚。
- 交通 API 每次回傳整份資料（含路段線形），路段多時量偏大；見 ROADMAP T.8。
- 交通資料伺服器還沒有部署到雲端，線上版目前只會顯示示範資料（ROADMAP T.6）。
- 醫院病床數尚未接真實資料（管線已支援 `--hospitals`）。
- 活動斷層是依圖數化的約略位置，拿到官方向量檔後替換。
