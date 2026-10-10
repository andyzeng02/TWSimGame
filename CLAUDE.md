# CLAUDE.md

台灣微縮模擬：以真實地形與 OpenStreetMap 地景呈現的 3D 高雄，加上「地震 72 小時」災害應變劇本。
**目前重點是地景（立體、好看、真實），遊戲性其次。**

開始任何工作前先讀：

- `docs/ROADMAP.md`：要做什麼、做到哪、驗收方式
- `docs/ARCHITECTURE.md`：模組、資料流、地圖圖層
- `docs/DECISIONS.md`：為什麼這樣做（推翻前先看）

## 目錄

```
apps/web/src/
  main.ts            進入點：載入世界檔、建立地圖與介面
  game.ts            遊戲控制：時間推進、行動佇列
  map/MapView.ts     MapLibre 地圖（地形、陰影、區界、區名、災情著色）
  map/config.ts      地圖設定：插畫風配色 PALETTE、高程來源、鏡頭、天空
  map/style/         自有底圖樣式：base.json（圖層結構）＋ buildStyle()（套配色）
  ui/Hud.ts          介面協調：模式切換、指揮面板（數字、時鐘、事件、圖層按鈕）
  ui/sceneBar.ts     觀景模式工具列：時段、地標導覽、重設視角、截圖
  ui/regionPanel.ts  右側行政區面板（觀景：基本資料；指揮：災情與行動）
  ui/endCard.ts      結算畫面（變化圖、決策時間軸）
  ui/tutorial.ts     第一次進指揮模式的教學引導
  ui/feedback.ts     意見回饋連結（預先填好的 GitHub Issue）
  ui/layers.ts       災情圖層：模擬狀態 → 每區 0–1 嚴重度
  ui/loading.ts      載入畫面的高雄剪影
  ui/about.ts        「關於」頁：免責聲明、資料來源與授權
  ui/screenshot.ts   一鍵截圖分享
packages/sim-core    模擬核心（無依賴）
packages/geo         地理工具：Shapefile、TWD97、多邊形、CSV（無依賴）
packages/rules-game  地震 72 小時規則、數值、機器人、批次跑分
pipeline/            政府開放資料 → data/world/kaohsiung.json
data/world/          世界檔
docs/                架構、路線圖、決策紀錄
```

## 硬規則

1. **依賴只能往內**：`sim-core`、`geo` 不 import 任何其他套件，也不碰 DOM 或 Node API。
2. **sim-core 不知道遊戲變數的意義**。「受困」「秩序」等名詞只出現在 rules-game 與 apps/web。
3. **結果可重現**：模擬中只能用 `ctx.rng`，禁止 `Math.random()`、`Date.now()`。
4. **tick 順序固定**：行動 → 到期事件 → spread → local → tick++ → checkEnd。
5. **數值集中**：遊戲數值在 `rules-game/src/earthquake/config.ts`，地圖設定在 `apps/web/src/map/config.ts`。
6. **地圖不含規則**：`MapView` 只接收嚴重度、搜救隊數等「要畫什麼」，不做任何判斷。
7. **地圖只畫區界線**：不要畫區塊之間的連線，也不要做浮空台座（使用者明確不要）。
8. **不提其他作品**：文件、註解、介面文字不要寫其他遊戲或作品的名稱當參考對象（使用者不希望被認為抄襲）；風格用自己的話描述。
9. **外部資料要標示來源**：新增任何圖磚或資料來源，同時更新 `docs/ARCHITECTURE.md` 的外部服務表、README，以及 `map/config.ts` 的 `MAP_SOURCES`（「關於」頁會列出）。

## 指令

```bash
npm install          # 第一次，或新增套件後
npm run dev          # 網頁版 http://localhost:5173
npm test             # 全部測試
npm run typecheck    # 全部套件型別檢查
npm run batch        # 地震劇本批次跑分（改遊戲數值後必跑）
npm run build-world -- --boundaries pipeline/raw/TOWN_MOI_1140318.shp   # 重產世界檔
```

## 完成的定義

- `npm test` 與 `npm run typecheck` 全綠。
- 改到地圖或介面：請使用者開 `npm run dev` 截圖確認（Claude 看不到使用者的瀏覽器畫面）。
- 改到遊戲數值：附上 `npm run batch` 前後的評級分布。
- 在 `docs/ROADMAP.md` 打勾；架構有變就更新 `docs/ARCHITECTURE.md`；重大取捨記到 `docs/DECISIONS.md`。

## 慣例

- TypeScript strict、ESM；套件直接匯出 `src/index.ts`，沒有建置步驟。內部套件路徑對應在 `tsconfig.base.json` 的 `paths`。
- 相對 import 不加副檔名。
- **回覆使用者一律用繁體中文**（包含進度說明與總結）。
- 註解、介面文字用繁體中文；識別字用英文。
- 單位：1 tick = 1 小時；距離公里；物資以天計；秩序、通行率為 0–1。
- 測試放在 `packages/*/test/` 與 `pipeline/test/`，用 `node:test`。
- 遊戲畫面保留免責聲明：「本遊戲為虛構情境，非地震預測」。
- 使用者希望每次多做幾個步驟：能一起完成的 ROADMAP 項目就一次做完，最後一起推送、一起回報。
- 使用者用 Windows（PowerShell），專案在 `E:\ClaudeCode\TWSimGame`；指令與路徑說明要能在 Windows 上照做。
