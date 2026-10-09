# 底圖樣式

- `base.json`：圖層結構，複製自 [OpenFreeMap styles](https://github.com/hyperknot/openfreemap-styles) 的 liberty 樣式（MIT 授權），
  只把 `__TILEJSON_DOMAIN__` 換成 `tiles.openfreemap.org`。地圖資料 © OpenStreetMap 貢獻者。
- `index.ts`：`buildStyle()`，把 `../config.ts` 的 `PALETTE` 套到各圖層，產生插畫風底圖。

調配色、字級：改 `../config.ts` 的 `PALETTE`。
改圖層對應（哪個圖層用哪個顏色、要不要顯示）：改 `index.ts`。
自架圖磚（ROADMAP 4.1）時：改 `base.json` 的 `sources`、`sprite`、`glyphs` 網址。
