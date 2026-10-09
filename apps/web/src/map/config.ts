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
  /** 行政區界線與區名（遊戲圖層） */
  district: { line: '#4a4136', casing: '#ffffff', label: '#2b2620', halo: 'rgba(255,255,255,0.92)' },
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
  /**
   * 省電模式（ROADMAP 1.6）：手機、核心數少的筆電自動開啟；網址加 ?quality=low／high 可強制切換。
   * 降低繪圖解析度、等高線晚一點出現、圖磚快取小一點。
   */
  lowPower: { pixelRatio: 1.25, contourMinzoom: 12, maxTileCacheSize: 120 },
  /** 中文字型交給瀏覽器本機字型繪製（不用下載 CJK 字型檔） */
  localFont: "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', sans-serif",
};

export type Palette = typeof PALETTE;

/** 夜間配色：深藍底、道路與 3D 建築偏暖色，像城市燈光 */
export const NIGHT_PALETTE: Palette = {
  land: '#1e2938',
  water: '#0e1b2d',
  waterLabel: '#9fbada',
  river: '#18324f',
  wood: '#203330',
  grass: '#253833',
  park: '#233830',
  farmland: '#29333d',
  sand: '#36362f',
  wetland: '#203439',
  residential: '#283142',
  school: '#2a3343',
  hospital: '#33303f',
  cemetery: '#253232',
  airport: '#2a3140',
  road: {
    motorway: ['#e8b25c', '#6f5428'],
    trunk: ['#d6a862', '#5f4c2e'],
    secondary: ['#a99070', '#463f33'],
    minor: ['#566070', '#262d3a'],
    path: '#464e5d',
  },
  rail: '#69707f',
  building: '#2d3545',
  buildingOutline: '#394253',
  building3d: '#f0c27a',
  label: '#ebe5d8',
  labelMinor: '#b7b1a5',
  labelHalo: '#131b27',
  labelSize: PALETTE.labelSize,
  contour: { minor: '#46566b', major: '#6a7b91', label: '#a8b6c8' },
  peak: { dot: '#c8d2de', label: '#dfe6ee' },
  district: { line: '#c9d3df', casing: '#0b1220', label: '#f2ede3', halo: 'rgba(10,16,26,0.9)' },
  hillshade: {
    shadow: '#04070c',
    highlight: '#3a4a60',
    accent: '#0a111d',
    exaggeration: 0.5,
  },
};

/** 把配色裡每個 #rrggbb 往 color 混合 amount（0–1），做出清晨、黃昏的暖色調 */
function tinted(p: Palette, color: string, amount: number): Palette {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [tr, tg, tb] = rgb(color);
  const mix = (v: unknown): unknown => {
    if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) {
      const [r, g, b] = rgb(v);
      const m = (a: number, t: number) => Math.round(a + (t - a) * amount).toString(16).padStart(2, '0');
      return `#${m(r, tr)}${m(g, tg)}${m(b, tb)}`;
    }
    if (Array.isArray(v)) return v.map(mix);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mix(x)]));
    return v;
  };
  return mix(p) as Palette;
}

type SkySpec = Record<string, unknown>;

/** 天空與遠景霧氣（MapLibre v5 sky 規格）；離地拉高後才看得到大氣層 */
const sky = (skyColor: string, horizon: string, fog: string): SkySpec => ({
  'sky-color': skyColor,
  'horizon-color': horizon,
  'fog-color': fog,
  'sky-horizon-blend': 0.6,
  'horizon-fog-blend': 0.7,
  'fog-ground-blend': 0.45,
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 10, 1, 12, 0],
});

export type TimeKey = 'dawn' | 'day' | 'dusk' | 'night';

/**
 * 時段（ROADMAP 1.5）：天空、霧、太陽方向、光線、配色。
 * sun.azimuth：太陽方位（度，0 = 北、90 = 東）；sun.polar：離天頂的角度（越大太陽越低）。
 * hours：「自動」模式下對應的台灣時間 [起, 迄)。
 */
export const TIMES: Record<TimeKey, {
  label: string;
  hours: [number, number];
  /** 這個時段用的配色 */
  palette: Palette;
  sky: SkySpec;
  sun: { azimuth: number; polar: number };
  light: { color: string; intensity: number };
  /** 山體陰影的光源方向；白天用製圖慣例的西北光，地形最好讀 */
  hillshadeDirection: number;
}> = {
  dawn: {
    label: '清晨',
    hours: [5, 7],
    palette: tinted(PALETTE, '#f2b9a0', 0.16),
    sky: sky('#9fb8de', '#f6d6c4', '#ecdcd2'),
    sun: { azimuth: 80, polar: 78 },
    light: { color: '#ffd9b8', intensity: 0.45 },
    hillshadeDirection: 80,
  },
  day: {
    label: '白天',
    hours: [7, 17],
    palette: PALETTE,
    sky: sky('#8ec5ef', '#e6eef4', '#e3eaee'),
    sun: { azimuth: 210, polar: 40 },
    light: { color: '#ffffff', intensity: 0.5 },
    hillshadeDirection: 315,
  },
  dusk: {
    label: '黃昏',
    hours: [17, 19],
    palette: tinted(PALETTE, '#e8925a', 0.24),
    sky: sky('#6f86b8', '#f3b98a', '#e9cdb6'),
    sun: { azimuth: 285, polar: 80 },
    light: { color: '#ffc58f', intensity: 0.45 },
    hillshadeDirection: 285,
  },
  night: {
    label: '夜晚',
    hours: [19, 29],
    palette: NIGHT_PALETTE,
    sky: sky('#0b1424', '#22314a', '#1b2638'),
    sun: { azimuth: 200, polar: 30 },
    light: { color: '#9fb4d8', intensity: 0.25 },
    hillshadeDirection: 315,
  },
};

/** 開場時段：'auto' 依台灣現在時間，或指定 TimeKey */
export const DEFAULT_TIME: TimeKey | 'auto' = 'day';

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
