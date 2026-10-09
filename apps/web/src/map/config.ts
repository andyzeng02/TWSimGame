/**
 * 地圖設定（MapLibre GL）。
 *
 * 底圖：OpenFreeMap 的向量圖磚（OpenStreetMap 資料、OpenMapTiles 格式），
 *   內含海岸、河流、湖泊、森林、草地、道路、3D 建築等圖層。免費、免金鑰、可商用；
 *   正式上架時可依 https://openfreemap.org 的說明自架，改 style/base.json 裡的網址即可。
 * 樣式：自有樣式檔 style/base.json（圖層結構）＋ 下方 PALETTE（插畫風配色與字級）。
 * 地形：AWS Terrain Tiles（Terrarium 編碼高程），可商用，需標示來源。
 */

/**
 * 插畫風配色：柔和、低彩度的平塗色塊，地形層次靠山體陰影表現。
 * 調整畫面風格只改這裡；圖層對應寫在 style/index.ts。
 */
export const PALETTE = {
  /** 陸地底色 */
  land: '#f2ecdc',
  /** 海、湖、河 */
  water: '#84bbe4',
  waterLabel: '#2f5f86',
  river: '#78b0dc',
  /** 綠地：森林最深，草地、公園較淺 */
  wood: '#a9c995',
  grass: '#c9dcaa',
  park: '#bfd8a6',
  farmland: '#e6e0bd',
  sand: '#efe2bb',
  wetland: '#bcd6c4',
  /** 市區 */
  residential: '#ebe1cf',
  school: '#ebe5c6',
  hospital: '#f1dcd6',
  cemetery: '#d7dcbf',
  airport: '#e4dfd2',
  /** 道路：主色＋外框 */
  road: {
    motorway: ['#f0bd84', '#d49f68'],
    trunk: ['#f6d79a', '#d8b679'],
    secondary: ['#fbe9b8', '#dcc896'],
    minor: ['#fffdf7', '#d9d1c0'],
    path: '#fffaf0',
  },
  rail: '#a99f91',
  /** 建築（平面與 3D） */
  building: '#e4d9c6',
  buildingOutline: '#d2c5af',
  building3d: '#ede3d1',
  /** 文字 */
  label: '#4a4033',
  labelMinor: '#6f6455',
  labelHalo: '#fbf7ee',
  /** 地名字級（[縮放, 字級] 成對） */
  labelSize: {
    city: [8, 14, 12, 22],
    town: [9, 12, 14, 18],
    village: [10, 11, 14, 15],
  },
  /** 等高線（主曲線每 250 公尺，較粗並標高度） */
  contour: { minor: '#9c8f72', major: '#7d6f52', label: '#6b5d42' },
  /** 山峰點與名稱 */
  peak: { dot: '#5b6b46', label: '#3f4a30' },
  /** 山體陰影 */
  hillshade: {
    shadow: '#5d6b58',
    highlight: '#fffaf0',
    accent: '#7f8f70',
    exaggeration: 0.55,
  },
};

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

/**
 * 等高線（ROADMAP 1.2）：縮放 → [細線間距, 粗線間距]（公尺）。
 * 拉遠時加大間距，避免山區線條糊成一片；zoom 13 以上是 50／250 公尺。
 */
export const CONTOUR = {
  thresholds: { 11: [200, 1000], 12: [100, 500], 13: [50, 250] } as Record<number, [number, number]>,
  /** 低於這個縮放不畫等高線 */
  minzoom: 11,
};

/** 主要河川（ROADMAP 1.3）：加粗並提早顯示名稱。OSM 上的名稱可能有別名，一併列入 */
export const MAJOR_RIVERS = ['高屏溪', '二仁溪', '楠梓仙溪', '旗山溪', '荖濃溪', '愛河'];

/** 湖泊名稱（ROADMAP 1.3）：底圖不一定有湖名，自己標 [經度, 緯度] */
export const LAKES: { name: string; at: [number, number] }[] = [
  { name: '蓮池潭', at: [120.2953, 22.6808] },
  { name: '澄清湖', at: [120.3575, 22.6555] },
  { name: '美濃湖', at: [120.5563, 22.9004] },
];

/** 地標導覽（ROADMAP 1.4）：依序飛覽的鏡頭。座標為約略值，看畫面再微調 */
export const LANDMARKS: { name: string; center: [number, number]; zoom: number; pitch: number; bearing: number }[] = [
  { name: '85 大樓與市中心', center: [120.3005, 22.6117], zoom: 15.2, pitch: 65, bearing: 35 },
  { name: '旗津半島', center: [120.2735, 22.6045], zoom: 13.4, pitch: 58, bearing: 20 },
  { name: '壽山', center: [120.2655, 22.6390], zoom: 13.3, pitch: 62, bearing: 110 },
  { name: '蓮池潭', center: [120.2953, 22.6808], zoom: 14.6, pitch: 60, bearing: 0 },
  { name: '澄清湖', center: [120.3575, 22.6555], zoom: 14.2, pitch: 58, bearing: 330 },
  { name: '佛光山', center: [120.4425, 22.7560], zoom: 14.4, pitch: 62, bearing: 250 },
  { name: '美濃', center: [120.5450, 22.8980], zoom: 13.2, pitch: 60, bearing: 40 },
  { name: '茂林山區', center: [120.6640, 22.8870], zoom: 12.6, pitch: 70, bearing: 60 },
  { name: '藤枝', center: [120.7620, 23.0600], zoom: 12.6, pitch: 70, bearing: 20 },
  { name: '遠眺玉山', center: [120.8300, 23.2700], zoom: 10.6, pitch: 75, bearing: 35 },
];

/** 地標導覽的節奏（毫秒）：飛行時間、每站停留 */
export const TOUR = { flyMs: 5000, holdMs: 3000 };
