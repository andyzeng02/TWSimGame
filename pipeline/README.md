# 資料管線（M0）

把政府開放資料轉成遊戲用的世界檔 `data/world/kaohsiung.json`（含 38 區的真實外框）。
跑完之後，網頁版和 `npm run batch` 會自動改用這份正式資料，不再用草稿世界。

Node 版，不需要安裝 Python。

## 最少步驟：只換真實行政區外框

1. 下載「鄉鎮市區界線（TWD97經緯度）」SHP 壓縮檔（內政部國土測繪中心）：
   - 資料集頁面：[政府資料開放平臺 #7441](https://data.gov.tw/dataset/7441)
   - 直接下載：<http://data.moi.gov.tw/MoiOD/System/DownloadFile.aspx?DATA=CD02C824-45C5-48C8-B631-98B205A2E35A>
2. 解壓縮到 `pipeline\raw\`，會看到 `TOWN_MOI_xxxxxxx.shp`、`.dbf`、`.shx`、`.prj`、`.cpg` 等檔。
3. 在 repo 根目錄執行（檔名換成你實際的）：

```powershell
npm run build-world -- --boundaries pipeline\raw\TOWN_MOI_1140318.shp
```

沒有人口檔與斷層檔時，會暫用草稿世界的約略人口與示意斷層，遊戲照樣能玩。

## 完整步驟：加上真實人口與斷層

| 資料 | 去哪找 | 參數 |
| --- | --- | --- |
| 鄉鎮市區界線 | 上面的連結 | `--boundaries` |
| 人口統計 | [政府資料開放平台](https://data.gov.tw/) 搜尋「村里戶數、單一年齡人口」或「鄉鎮市區人口數」（內政部戶政司），CSV | `--population` |
| 活動斷層 | 搜尋「活動斷層」（經濟部地質調查及礦業管理中心），SHP | `--faults` |
| 醫院床數（選用） | 搜尋「醫療機構」「病床數」（衛福部），自行整理成 `district,beds` 兩欄 | `--beds` |
| 避難收容處所（選用） | 搜尋「避難收容處所」（內政部消防署），CSV，需有「經度」「緯度」欄；全國檔也可以，只會留下高雄的點 | `--shelters` |
| 醫院點位（選用） | 任何含「名稱、經度、緯度」欄的醫院 CSV（有「病床數」欄會一併讀入）；沒提供時，地圖改用 OpenStreetMap 的醫院點 | `--hospitals` |

```powershell
npm run build-world -- `
  --boundaries pipeline\raw\TOWN_MOI_1140318.shp `
  --population pipeline\raw\population.csv `
  --faults pipeline\raw\faults.shp `
  --shelters pipeline\raw\shelters.csv
```

- 座標是經緯度或 TWD97 TM2（公尺）都可以，程式會自動判斷。
- 中文編碼 UTF-8 或 Big5 都可以。
- 找不到欄位時，錯誤訊息會列出檔案裡實際的欄位名稱，再用參數指定：
  `--county-col` `--town-col` `--code-col` `--pop-district-col` `--pop-value-col` `--fault-name-col`

## 程式做了什麼

1. 只留高雄市；旗津區在行政上包含東沙、南沙，這些離島外框不放進地圖。
2. 外框簡化到約 30 公尺精度（檔案小、畫面順）；略過內洞與 0.02 km² 以下的碎片。
3. 代表點取「區內離邊界最遠的點」，用來放區名與搜救隊標記。
4. 共用邊界頂點的兩區視為相鄰；被水隔開的區（例如旗津）自動接到最近的區，確保全部連通。
5. 斷層：保留高雄附近的斷層線；旗山斷層的 id 為 `chishan`（地震劇本預設震源）。
6. 在 `meta.sources` 記錄每份資料的來源、檔名、版本（從檔名裡的民國日期讀出，例如 `TOWN_MOI_1140318` → 2025-03-18）與授權；只留檔名，不會寫進你電腦上的路徑。網頁的「關於」頁會列出來。
7. 避難收容處所、醫院：讀名稱、經緯度（或 TWD97 座標）、容量，依位置歸到所在的區；外框簡化後海岸邊差幾十公尺的點，歸到 2 公里內最近的區；高雄以外的點略過。
8. 最後用 sim-core 的 `validateWorld` 檢查，不合格就不寫檔。

## 授權

上述資料多採「政府資料開放授權條款」，可商用，但需標示來源。
正式上架前請在遊戲的「關於」頁列出資料來源。
