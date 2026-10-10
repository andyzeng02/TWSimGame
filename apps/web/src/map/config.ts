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
  /** 設施點：醫院、避難所 */
  facility: { hospital: '#d2483f', shelter: '#2e8b62', stroke: '#ffffff', label: '#3a332a' },
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
  /**
   * 海面拉平：高程圖磚含海底地形，3D 時海面會凹進海溝、還有資料接縫的直線。
   * 開啟後低於海平面一律當 0 公尺（地圖只在瀏覽器裡改，不影響原始資料）。
   */
  flattenSea: true,
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
  facility: { hospital: '#ff7a6e', shelter: '#5fd0a0', stroke: '#141c28', label: '#ebe5d8' },
  district: { line: '#c9d3df', casing: '#0b1220', label: '#f2ede3', halo: 'rgba(10,16,26,0.9)' },
  hillshade: {
    shadow: '#04070c',
    highlight: '#3a4a60',
    accent: '#0a111d',
    exaggeration: 0.5,
  },
};

/** 把設定裡每個 #rrggbb 顏色（含巢狀物件、陣列）換成 f 算出的顏色；其他值不變 */
function mapColors<T>(v: T, f: (rgb: number[]) => number[]): T {
  const walk = (x: unknown): unknown => {
    if (typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x)) {
      const rgb = [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
      const hex = (c: number) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0');
      return `#${f(rgb).map(hex).join('')}`;
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)]));
    return x;
  };
  return walk(v) as T;
}

/** 把配色裡每個顏色往 color 混合 amount（0–1），做出清晨、黃昏的暖色調 */
function tinted(p: Palette, color: string, amount: number): Palette {
  const target = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return mapColors(p, (rgb) => rgb.map((c, i) => c + (target[i] - c) * amount));
}

/**
 * 陰天、雨天的色調：降低彩度（往同亮度的灰色混）、整體變暗，再帶一點冷色。
 * 不管白天或夜晚都適用（夜晚不會因為混灰色而變亮）。
 */
export function overcast<T>(v: T, look: { desaturate: number; darken: number; cool: number }): T {
  const cool = [118, 138, 160];
  return mapColors(v, ([r, g, b]) => {
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return [r, g, b].map((c, i) => {
      const grey = (c + (lum - c) * look.desaturate) * (1 - look.darken);
      return grey + (cool[i] * (1 - look.darken) - grey) * look.cool;
    });
  });
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

export type WeatherKey = 'clear' | 'cloudy' | 'rain';

/** 雲的外型與數量（多雲、下雨各一組） */
export interface CloudSpec {
  /** 雲朵數量（分布在 MAP_CONFIG.bounds 範圍） */
  count: number;
  /** 每朵雲的寬度範圍（公里） */
  sizeKm: [number, number];
  /** 雲底高度（公尺，從地面算）；雲頂高度範圍 */
  baseM: number;
  topM: [number, number];
  /** 雲朵不透明度 */
  opacity: number;
  /** 雲色往灰色混的比例（雨雲較暗） */
  shade: number;
  /** 地面雲影的濃度（0–1） */
  shadow: number;
}

/** 雨絲（畫在地圖上方的一層畫布，螢幕座標） */
export interface RainSpec {
  /** 每 100×100 像素的雨絲數 */
  density: number;
  /** 雨絲長度（像素）、落下速度（像素／秒） */
  lengthPx: [number, number];
  speedPx: [number, number];
  /** 斜度：每往下 1 像素往右偏幾像素（風） */
  slant: number;
  /** 顏色與不透明度 */
  color: string;
  alpha: number;
  /** 整個畫面蓋一層薄薄的灰藍色（雨中空氣較暗，雨絲也比較看得到） */
  veil: string;
}

/**
 * 天氣：晴、多雲、下雨。和時段疊加（任何時段都可以下雨）。
 * look：地面、天空、光線的色調（overcast）；fog：霧從多近開始（0 = 鏡頭附近、1 = 地平線，越小霧越濃）；
 * light、hillshade：光線強度、山體陰影的倍率（陰天是散射光，陰影較淡）。
 */
export const WEATHERS: Record<WeatherKey, {
  label: string;
  look: { desaturate: number; darken: number; cool: number } | null;
  fog: { ground: number; horizon: number } | null;
  light: number;
  hillshade: number;
  clouds: CloudSpec | null;
  rain: RainSpec | null;
}> = {
  clear: { label: '晴', look: null, fog: null, light: 1, hillshade: 1, clouds: null, rain: null },
  cloudy: {
    label: '多雲',
    look: { desaturate: 0.18, darken: 0.04, cool: 0.04 },
    fog: { ground: 0.36, horizon: 0.6 },
    light: 0.85,
    hillshade: 0.85,
    clouds: { count: 85, sizeKm: [4, 10], baseM: 1500, topM: [3200, 4800], opacity: 0.94, shade: 0.04, shadow: 0.17 },
    rain: null,
  },
  rain: {
    label: '下雨',
    look: { desaturate: 0.42, darken: 0.2, cool: 0.1 },
    fog: { ground: 0.16, horizon: 0.4 },
    light: 0.62,
    hillshade: 0.65,
    clouds: { count: 120, sizeKm: [8, 16], baseM: 1000, topM: [2600, 3600], opacity: 0.97, shade: 0.65, shadow: 0.26 },
    rain: { density: 5, lengthPx: [12, 34], speedPx: [700, 1300], slant: 0.18, color: '#eef4fa', alpha: 0.55, veil: 'rgba(52, 66, 84, 0.16)' },
  },
};

/** 雲的共同設定：各時段的雲色、飄移、拉近時淡出 */
export const CLOUDS = {
  color: { dawn: '#fde6da', day: '#ffffff', dusk: '#f8d2b4', night: '#4a556d' } as Record<TimeKey, string>,
  shadowColor: '#24303c',
  /** 夜晚沒有陽光，不畫雲影 */
  shadowAtNight: false,
  /** 雲影最遠偏離雲的距離（公里；太陽低時影子拉長，限制在這個距離內） */
  shadowMaxOffsetKm: 4,
  /** 雲朵外形：圓用幾邊形近似（少一點邊，有低多邊形的插畫感） */
  segments: 14,
  /** 拉近時雲朵淡出（只留雲影），不擋住市區：[開始淡出, 完全消失] 的縮放 */
  fadeZoom: [10.8, 12.6] as [number, number],
  /** 飄移速度（公里／秒，畫面效果，不是真實風速）與方向（度，往哪吹；0 = 北、90 = 東） */
  driftKmPerS: 0.5,
  driftToward: 60,
  /** 更新間隔（毫秒）；省電模式較慢 */
  frameMs: 200,
  lowPowerFrameMs: 1000,
  /** 固定種子：每次開啟雲的分布都一樣，截圖可重現 */
  seed: 20261010,
};

/** 開場天氣 */
export const DEFAULT_WEATHER: WeatherKey = 'clear';

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

/** 震波動畫（ROADMAP 3.2）：從斷層中點往外擴散的圓環 */
export const SHOCKWAVE = {
  /** 最大半徑（公里），乘上強度（主震 1、餘震約 0.6） */
  radiusKm: 70,
  /** 一圈擴散所需時間（毫秒） */
  durationMs: 3200,
  /** 圈數與間隔 */
  rings: 3,
  gapMs: 450,
  color: '#e0482f',
  /** 主震時鏡頭輕微晃動（系統設定「減少動態效果」時不晃） */
  shake: true,
};

/** 地標導覽的節奏（毫秒）：飛行時間、每站停留 */
export const TOUR = { flyMs: 5000, holdMs: 3000 };

/** 地圖用到的線上服務與程式庫（「關於」頁列出；新增服務時同步更新 docs/ARCHITECTURE.md 與 README） */
/** 一種車的 3D 外型設定（公尺）；minScale、boost 沒給就用 TRAFFIC.model 的預設 */
export interface VehicleModel {
  cars: number;
  lengthM: number;
  widthM: number;
  gapM: number;
  heightM: number;
  maxScale: number;
  minScale?: number;
  sectionsM?: number[];
  boost?: { width: number; height: number };
  /** 窗帶位置（整體高度的比例）；沒給就用 TRAFFIC.model.windowBand */
  windowBand?: [number, number];
}

/**
 * 即時交通（交通模式）：顏色、更新頻率、動畫。
 * 資料來自交通資料伺服器（apps/server）；沒有連上時用示範資料。
 */
export const TRAFFIC = {
  /** 向伺服器要資料的間隔（毫秒） */
  pollMs: 10_000,
  /** 示範資料的更新間隔（毫秒；越短列車移動越平順） */
  demoTickMs: 1000,
  /** 車輛從舊位置滑到新位置的動畫時間上限（毫秒） */
  animateMaxMs: 10_000,
  /** 移動超過這個距離（公里）就直接跳過去，不做滑動動畫 */
  snapKm: 3,
  /** 進交通模式時，鏡頭拉遠於 minZoom 就飛到市區 */
  view: { center: [120.305, 22.632] as [number, number], zoom: 12.2, pitch: 50, bearing: -10, minZoom: 11 },
  /** 伺服器網址的預設值（也可用網址 ?traffic=…，或交通面板裡的設定） */
  defaultApi: (import.meta.env.VITE_TRAFFIC_API as string | undefined) ?? '',
  /** 各運具的預設顏色（路線有官方顏色時用官方顏色） */
  modeColor: {
    metro: '#e2231a',
    lightrail: '#7cc142',
    rail: '#3a5fa8',
    bus: '#1d8a8a',
    bike: '#e8a317',
  },
  /**
   * 3D 車輛：拉近到 minZoom 以上，車輛畫成立體車廂（車身與車頂是路線顏色、中間一圈窗帶）；
   * 更遠就畫圓點。真實大小在城市尺度幾乎看不到，所以拉遠時放大：
   * 放大倍數 = 2^(refZoom − 目前縮放)，介於 1 到各車種的 maxScale 之間。
   * 另外車寬、車高再乘上 boost，做成比例較胖的「微縮模型」樣子，斜看時才看得出立體。
   * 車廂規格（公尺）是約略值：捷運 3 節、輕軌 5 節模組、臺鐵 8 節、公車 1 節。
   */
  model: {
    minZoom: 11,
    refZoom: 16.6,
    boost: { width: 2.8, height: 2.6 },
    cars: <Record<'metro' | 'lightrail' | 'rail' | 'bus', VehicleModel>>{
      metro: { cars: 3, lengthM: 23, widthM: 3.2, gapM: 1.5, heightM: 3.8, maxScale: 12 },
      // 輕軌：5 節低底盤模組，模組間連接緊密，車窗大（從較低處開始）
      lightrail: { cars: 5, lengthM: 6.8, widthM: 2.65, gapM: 0.25, heightM: 3.5, maxScale: 12, windowBand: [0.38, 0.82] },
      rail: { cars: 8, lengthM: 20, widthM: 3.2, gapM: 1.5, heightM: 4.1, maxScale: 10 },
      // 公車分兩段：車頭（大擋風玻璃）＋車身；比例比列車細長，近看也至少放大 minScale 倍
      bus: {
        cars: 1, lengthM: 12, widthM: 2.5, gapM: 0, heightM: 3.2, maxScale: 6, minScale: 2.5,
        sectionsM: [2.4, 9.6], boost: { width: 1.7, height: 1.9 },
      },
    },
    /** 公車外觀：深色底盤、側窗帶、車頭擋風玻璃（從較低處開始）、白色車頂；高度用整體高度的比例 */
    bus: {
      skirt: '#3a3f46',
      skirtTop: 0.16,
      windowBand: [0.46, 0.86] as [number, number],
      windshieldBottom: 0.3,
      /** 車頂顏色；null = 跟車身同色（從上往下看才認得出公車） */
      roof: null as string | null,
    },
    /** 窗帶在整體高度中的位置（下緣、上緣比例） */
    windowBand: [0.5, 0.82] as [number, number],
    window: '#e4edf2',
    /** 車頭窗帶顏色（看得出行進方向） */
    leadWindow: '#ffffff',
    /** 吸附軌道的最大距離（公尺，會乘上放大倍數） */
    snapM: 150,
  },
  /** 路段壅塞程度顏色：0 不明、1 順暢、2 車多、3 壅塞 */
  congestion: ['#9aa3ad', '#3fae5a', '#f0a830', '#d63d2e'] as [string, string, string, string],
  /** 公共自行車：可借數量 ≤ 這個值顯示「快沒車」顏色 */
  bikeLow: 2,
  bikeColor: { empty: '#c94a3a', low: '#e8a317', ok: '#3fae5a' },
};

export const MAP_SOURCES: { role: string; name: string; license: string; url: string }[] = [
  { role: '地圖資料', name: 'OpenStreetMap 貢獻者', license: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright' },
  { role: '向量圖磚', name: 'OpenFreeMap（OpenMapTiles 格式）', license: '免費使用，需標示 OpenStreetMap', url: 'https://openfreemap.org' },
  { role: '底圖樣式', name: 'OpenFreeMap liberty 樣式（本專案改為插畫風配色）', license: 'MIT', url: 'https://github.com/hyperknot/openfreemap-styles' },
  { role: '地形高程', name: 'Mapzen Terrain Tiles（AWS Open Data）', license: '各來源授權，需標示', url: 'https://registry.opendata.aws/terrain-tiles/' },
  { role: '地圖引擎', name: 'MapLibre GL JS', license: 'BSD-3-Clause', url: 'https://maplibre.org' },
  { role: '等高線', name: 'maplibre-contour', license: 'BSD-3-Clause', url: 'https://github.com/onthegomap/maplibre-contour' },
  { role: '即時交通', name: '交通部 TDX 運輸資料流通服務（公車、捷運、輕軌、臺鐵、路況、公共自行車）', license: '政府資料開放授權條款－第 1 版', url: 'https://tdx.transportdata.tw' },
  { role: '瀏覽統計', name: 'GoatCounter（不使用 cookie、不追蹤個人）', license: '—', url: 'https://www.goatcounter.com' },
];
