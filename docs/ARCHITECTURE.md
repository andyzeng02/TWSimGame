# 架構說明

最後更新：2026-10-09

## 一句話

政府開放資料經資料管線變成「世界檔」，模擬核心在世界檔上跑劇本規則，網頁版用 MapLibre 把真實地形、OpenStreetMap 地景和模擬結果畫在一起。

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
| `pipeline` | 政府開放資料 → 世界檔 | geo、sim-core | Node |
| `apps/web` | 3D 地景地圖、遊戲介面 | sim-core、rules-game、maplibre-gl | 瀏覽器 |
| `tools` | 輔助腳本（產生草稿世界） | sim-core | Node |

## 世界檔（data/world/*.json）

格式定義在 `packages/sim-core/src/types.ts` 的 `World`。

| 欄位 | 內容 |
| --- | --- |
| `meta` | id、名稱、版本、資料來源說明 |
| `regions[]` | 每區：行政區代碼、名稱、代表點、面積、人口、其他屬性、外框多邊形 |
| `edges[]` | 相鄰區之間的連線（模擬用：傷患轉送、通行率） |
| `faults[]` | 斷層線（地震劇本的震源） |

| 檔案 | 狀態 |
| --- | --- |
| `kaohsiung.json` | 正式世界檔。38 區外框來自國土測繪中心 TOWN_MOI_1140318；人口與斷層暫用約略值 |
| `kaohsiung.sample.json` | 草稿世界（約略值）。測試與資料管線的備用來源 |

網頁版與批次跑分會優先用 `kaohsiung.json`，沒有時才用草稿。

## 地圖（apps/web/src/map）

圖層由下往上：

1. OpenFreeMap liberty 底圖：海、陸地、森林、草地、河流、湖泊、道路
2. 山體陰影（hillshade，DEM）
3. 3D 建築（底圖內建，zoom 14 以上）
4. 災情著色 `districts-fill`（feature-state；觀景模式隱藏）
5. 區界 `districts-casing` + `districts-line`
6. 底圖的地名標籤（已改成中文）
7. 區名 `district-labels`、斷層 `faults`、搜救隊 `teams`

地形用 `setTerrain` 套在整張地圖上，所有圖層會自動貼在地表。天空與遠景霧氣用 `setSky`。

`MapView` 對外只提供這些方法，不含任何遊戲規則：
`select`、`onSelect`、`setSeverity`、`setTeams`、`setSceneMode`、`setHillshade`、`setBuildings`、`resetView`。

## 模擬（sim-core + rules-game）

- 1 tick = 1 小時。每個 tick 的順序固定：玩家行動 → 到期事件 → 擴散（spread）→ 區內更新（local）→ 檢查結束。
- 狀態是「一個變數一個陣列」（`vars['trapped'][區索引]`），劇本可自由增加變數。
- 只用 `ctx.rng`，同一個種子加上同一串行動，結果必定相同，可存檔、重播、批次測試。
- 遊戲數值全部在 `rules-game/src/earthquake/config.ts`。

## 外部服務

| 服務 | 用途 | 授權 / 費用 | 風險 |
| --- | --- | --- | --- |
| OpenFreeMap | 向量底圖、樣式、字型 | 免費、可商用，需標示 OSM | 公共服務，無 SLA；正式上架前改自架 |
| AWS Terrain Tiles | 高程 | Open Data，需標示 | 同上 |
| 國土測繪中心 | 行政區界線 | 政府資料開放授權條款 | 每年更新，需重跑管線 |
| GitHub Pages | 線上版網頁（`main` 自動部署） | 公開 repo 免費 | 網址公開；打包內容任何人可讀，不可放金鑰 |

## 已知技術債

- `ui/Hud.ts` 一個檔案管所有介面（約 260 行），加功能前應拆分。
- `MapView` 的圖層定義寫在程式裡；樣式調整多了以後，應抽成獨立的樣式檔。
- 地圖完全依賴線上圖磚，離線或 Steam 版需要自架或打包圖磚。
- 遊戲數值是用草稿世界調的；換成真實人口後要重調。
- 專案還沒有版本控制（git）。
