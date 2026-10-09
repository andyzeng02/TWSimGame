/**
 * 地圖設定（MapLibre GL）。
 *
 * 底圖：OpenFreeMap 的向量圖磚（OpenStreetMap 資料、OpenMapTiles 格式），
 *   內含海岸、河流、湖泊、森林、草地、道路、3D 建築等圖層。免費、免金鑰、可商用；
 *   正式上架時可依 https://openfreemap.org 的說明自架，只要改 STYLE_URL。
 * 地形：AWS Terrain Tiles（Terrarium 編碼高程），可商用，需標示來源。
 */

/** 底圖樣式。可換成 'bright'、'positron'，或自架的樣式網址 */
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const DEM_ATTRIBUTION = '高程 © Mapzen Terrain Tiles（AWS Open Data）';

export const MAP_CONFIG = {
  /** 地形高度誇張倍率（1 = 真實比例） */
  exaggeration: 1.5,
  /** 開場鏡頭：從高雄市區上空往東北看向山區 */
  start: {
    center: [120.42, 22.78] as [number, number],
    zoom: 9.6,
    pitch: 62,
    bearing: 28,
  },
  /** 點選區塊時飛過去的鏡頭 */
  focus: { pitch: 60, maxZoom: 13.5 },
  /** 可平移的範圍（高雄外圍留一點邊） */
  bounds: [
    [119.8, 22.1],
    [121.4, 23.8],
  ] as [[number, number], [number, number]],
  /** 中文字型交給瀏覽器本機字型繪製（不用下載 CJK 字型檔） */
  localFont: "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', sans-serif",
};

/** 天空與遠景霧氣（MapLibre v5 sky 規格） */
export const SKY = {
  'sky-color': '#8ec5ef',
  'horizon-color': '#e6eef4',
  'fog-color': '#e3eaee',
  'sky-horizon-blend': 0.6,
  'horizon-fog-blend': 0.7,
  'fog-ground-blend': 0.45,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
};
