import { addProtocol, Map as MLMap, NavigationControl, ScaleControl } from 'maplibre-gl';
import mlcontour from 'maplibre-contour';
import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSource,
  LayerSpecification,
  MapGeoJSONFeature,
  SkySpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { World } from '@twsim/sim-core';
import {
  CONTOUR,
  DEM_ATTRIBUTION,
  DEM_TILES,
  LANDMARKS,
  MAP_CONFIG,
  PALETTE,
  TIMES,
  TOUR,
  type Palette,
  type TimeKey,
} from './config';
import { buildStyle } from './style';

/**
 * 高雄 3D 地景地圖（MapLibre GL）。
 *
 * - 底圖：OpenStreetMap 向量地圖（海岸、河流、湖泊、森林、道路、3D 建築）。
 * - 地形：真實高程，連續到海平面，不做浮空台座。另加山體陰影。
 * - 遊戲圖層只有：行政區界線、區名、（指揮模式下）災情著色、斷層、搜救隊。
 *
 * 本類別只負責畫面，不含任何遊戲規則。
 */

export type Progress = (message: string, fraction: number) => void;

const SEL = ['boolean', ['feature-state', 'selected'], false] as ExpressionSpecification;
const GAME_LAYERS = ['districts-fill', 'faults', 'teams'];
/** 醫院與避難所（指揮模式才顯示，可用勾選框關掉） */
const FACILITY_LAYERS = ['facility-dots', 'facility-labels', 'osm-hospitals'];

/**
 * 海面拉平：註冊 flatsea:// 協定，下載高程圖磚後把負高程改成 0 再交給 MapLibre。
 * Terrarium 編碼：高度 = R×256 + G + B/256 − 32768，所以 R < 128 就是負值。
 */
let flatSeaReady = false;
function demTiles(): string {
  if (!MAP_CONFIG.flattenSea) return DEM_TILES;
  if (!flatSeaReady) {
    flatSeaReady = true;
    addProtocol('flatsea', async (params, abort) => {
      const res = await fetch(params.url.replace('flatsea://', 'https://'), { signal: abort.signal });
      if (!res.ok) throw new Error(`高程圖磚下載失敗：${res.status}`);
      const bmp = await createImageBitmap(await res.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const g = canvas.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(bmp, 0, 0);
      const img = g.getImageData(0, 0, bmp.width, bmp.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 128) {
          d[i] = 128;
          d[i + 1] = 0;
          d[i + 2] = 0;
        }
      }
      g.putImageData(img, 0, 0);
      const out = await canvas.convertToBlob({ type: 'image/png' });
      return { data: await out.arrayBuffer() };
    });
  }
  return DEM_TILES.replace('https://', 'flatsea://');
}

/** 等高線：在瀏覽器裡從 DEM 圖磚即時算出（maplibre-contour，在背景 worker 執行） */
let contourDem: InstanceType<typeof mlcontour.DemSource> | null = null;
function contourSource() {
  if (!contourDem) {
    contourDem = new mlcontour.DemSource({ url: DEM_TILES, encoding: 'terrarium', maxzoom: 13, worker: true });
    contourDem.setupMaplibre({ addProtocol: addProtocol as never });
  }
  return contourDem;
}

export class MapView {
  readonly map: MLMap;
  attribution = '';
  warnings: string[] = [];

  private selected: number | null = null;
  private handlers: ((i: number | null) => void)[] = [];
  private regionBounds: [[number, number], [number, number]][] = [];
  /** 地標導覽的代號；每次開始或停止就加一，舊的導覽看到代號變了就結束 */
  private tourId = 0;
  private touring = false;

  /** 省電模式：手機或低階裝置 */
  readonly lowPower = detectLowPower();

  private constructor(container: HTMLElement, private world: World) {
    const { start, bounds, localFont, lowPower } = MAP_CONFIG;
    contourSource();
    this.map = new MLMap({
      container,
      ...(this.lowPower
        ? { pixelRatio: Math.min(devicePixelRatio, lowPower.pixelRatio), maxTileCacheSize: lowPower.maxTileCacheSize }
        : {}),
      style: buildStyle(),
      center: start.center,
      zoom: start.zoom,
      pitch: start.pitch,
      bearing: start.bearing,
      maxPitch: 80,
      maxBounds: bounds,
      localIdeographFontFamily: localFont,
      attributionControl: { compact: true },
    });
    this.map.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right');
    this.map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
  }

  static async create(container: HTMLElement, world: World, onProgress: Progress = () => {}): Promise<MapView> {
    const view = new MapView(container, world);
    onProgress('下載底圖樣式…', 0.1);
    await new Promise<void>((resolve, reject) => {
      view.map.once('load', () => resolve());
      view.map.once('error', (e) => reject(new Error(`地圖載入失敗（請確認網路）：${e.error?.message ?? ''}`)));
    });
    onProgress('建立地形與圖層…', 0.5);
    view.setupScene();
    view.setupGameLayers();
    view.setTimeOfDay('day');
    view.setupInteraction();
    onProgress('下載地形與地圖圖磚…', 0.7);
    // 等第一批圖磚畫完再收起載入畫面（最多等 10 秒）
    await Promise.race([new Promise<void>((r) => view.map.once('idle', () => r())), new Promise((r) => setTimeout(r, 10000))]);
    onProgress('完成', 1);
    return view;
  }

  // ---------- 對外 API ----------

  onSelect(handler: (i: number | null) => void) {
    this.handlers.push(handler);
  }

  select(i: number | null, fly = true) {
    if (this.selected !== null) this.map.setFeatureState({ source: 'districts', id: this.selected }, { selected: false });
    this.selected = i;
    if (i !== null) {
      this.map.setFeatureState({ source: 'districts', id: i }, { selected: true });
      if (fly && this.regionBounds[i]) {
        this.map.fitBounds(this.regionBounds[i], {
          padding: { top: 140, bottom: 80, left: 320, right: 360 },
          pitch: MAP_CONFIG.focus.pitch,
          bearing: this.map.getBearing(),
          maxZoom: MAP_CONFIG.focus.maxZoom,
          duration: 1400,
        });
      }
    }
    for (const h of this.handlers) h(i);
  }

  /** 每區嚴重度 0（平靜）– 1（危急）；null = 不著色，只看地景 */
  setSeverity(values: number[] | null) {
    this.world.regions.forEach((_, i) => {
      const t = values ? Math.max(0, Math.min(1, values[i] ?? 0)) : 0;
      this.map.setFeatureState({ source: 'districts', id: i }, { sev: t, alpha: values ? 0.12 + 0.43 * t : 0 });
    });
  }

  /** 保留給遊戲用的介面；地景版不畫區塊之間的連線 */
  setRoadStatus(_status: number[]) {}

  setTeams(counts: number[]) {
    const features = this.world.regions
      .map((r, i) => ({ r, n: counts[i] ?? 0 }))
      .filter((x) => x.n > 0)
      .map(({ r, n }) => ({
        type: 'Feature' as const,
        properties: { n },
        geometry: { type: 'Point' as const, coordinates: r.centroid },
      }));
    (this.map.getSource('teams') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  }

  setHillshade(on: boolean) {
    if (this.map.getLayer('hillshade')) this.map.setLayoutProperty('hillshade', 'visibility', on ? 'visible' : 'none');
  }

  setBuildings(on: boolean) {
    for (const l of this.map.getStyle().layers) {
      if (l.type === 'fill-extrusion') this.map.setLayoutProperty(l.id, 'visibility', on ? 'visible' : 'none');
    }
  }

  /** 觀景模式：隱藏災情著色、斷層、搜救隊、醫院與避難所，只留地景、區界、區名 */
  setSceneMode(scene: boolean) {
    this.scene = scene;
    for (const id of GAME_LAYERS) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', scene ? 'none' : 'visible');
    this.syncFacilities();
  }

  /** 醫院與避難所圖層開關（只在指揮模式有效） */
  setFacilities(on: boolean) {
    this.facilitiesOn = on;
    this.syncFacilities();
  }

  private scene = true;
  private facilitiesOn = true;

  private syncFacilities() {
    const show = !this.scene && this.facilitiesOn;
    for (const id of FACILITY_LAYERS) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
  }

  /**
   * 時段（ROADMAP 1.5）：換天空、光線、山體陰影方向與配色（清晨、黃昏偏暖，夜晚換夜間配色）。
   * 只改圖層的 paint 屬性，不重建樣式，所以地形與遊戲圖層都保留。
   */
  setTimeOfDay(key: TimeKey) {
    const t = TIMES[key];
    const map = this.map;
    this.applyPalette(t.palette);
    map.setSky(t.sky as unknown as SkySpecification);
    map.setLight({ anchor: 'map', position: [1.5, t.sun.azimuth, t.sun.polar], color: t.light.color, intensity: t.light.intensity });
    if (map.getLayer('hillshade')) map.setPaintProperty('hillshade', 'hillshade-illumination-direction', t.hillshadeDirection);
  }

  private palette: Palette | null = null;

  private applyPalette(p: Palette) {
    if (this.palette === p) return;
    const map = this.map;
    // 底圖：用同一份樣式產生器算出新顏色，逐一套到現有圖層
    if (this.palette) {
      for (const layer of buildStyle(p).layers) {
        if (!map.getLayer(layer.id)) continue;
        for (const [prop, value] of Object.entries(layer.paint ?? {})) {
          map.setPaintProperty(layer.id, prop, value);
        }
      }
    }
    this.palette = p;
    const set = (id: string, prop: string, value: unknown) => {
      if (map.getLayer(id)) map.setPaintProperty(id, prop, value);
    };
    set('hillshade', 'hillshade-shadow-color', p.hillshade.shadow);
    set('hillshade', 'hillshade-highlight-color', p.hillshade.highlight);
    set('hillshade', 'hillshade-accent-color', p.hillshade.accent);
    set('hillshade', 'hillshade-exaggeration', p.hillshade.exaggeration);
    const major = ['==', ['get', 'level'], 1];
    set('contour-lines', 'line-color', ['case', major, p.contour.major, p.contour.minor]);
    set('contour-labels', 'text-color', p.contour.label);
    set('contour-labels', 'text-halo-color', p.labelHalo);
    set('districts-casing', 'line-color', p.district.casing);
    set('districts-line', 'line-color', ['case', SEL, '#1f5fe0', p.district.line]);
    set('district-labels', 'text-color', p.district.label);
    set('district-labels', 'text-halo-color', p.district.halo);
    const F = p.facility;
    set('facility-dots', 'circle-color', ['match', ['get', 'kind'], 'hospital', F.hospital, 'shelter', F.shelter, '#888888']);
    set('facility-dots', 'circle-stroke-color', F.stroke);
    set('osm-hospitals', 'circle-color', F.hospital);
    set('osm-hospitals', 'circle-stroke-color', F.stroke);
    set('facility-labels', 'text-color', F.label);
    set('facility-labels', 'text-halo-color', p.labelHalo);
    // 開了 3D 地形時，MapLibre 會把底圖先畫成貼圖再貼到地表；只改 paint 不會清掉舊貼圖，
    // 不清的話會留下一塊塊舊顏色。這是內部 API，找不到就略過（最壞情況是等圖磚重載才更新）
    (map as unknown as { terrain?: { tileManager?: { freeRtt?: () => void } } }).terrain?.tileManager?.freeRtt?.();
    map.triggerRepaint();
  }

  /** 回到開場鏡頭 */
  resetView() {
    this.stopTour();
    const { start } = MAP_CONFIG;
    this.map.flyTo({ ...start, duration: 1800 });
  }

  /** 擷取目前畫面（在繪製當下複製，不需要 preserveDrawingBuffer，平常不影響效能） */
  capture(): Promise<HTMLCanvasElement> {
    return new Promise((resolve) => {
      this.map.once('render', () => {
        const src = this.map.getCanvas();
        const copy = document.createElement('canvas');
        copy.width = src.width;
        copy.height = src.height;
        copy.getContext('2d')!.drawImage(src, 0, 0);
        resolve(copy);
      });
      this.map.triggerRepaint();
    });
  }

  get isTouring() {
    return this.touring;
  }

  /** 地標導覽：依序飛到 config 的 LANDMARKS；onStep 收到目前地標名稱，結束時收到 null */
  async startTour(onStep: (name: string | null) => void) {
    const id = ++this.tourId;
    this.touring = true;
    const alive = () => id === this.tourId;
    for (const lm of LANDMARKS) {
      if (!alive()) return;
      onStep(lm.name);
      // 正常是等飛行結束；保險起見最多等飛行時間再多 1 秒
      const arrived = Promise.race([
        new Promise((r) => this.map.once('moveend', r)),
        new Promise((r) => setTimeout(r, TOUR.flyMs + 1000)),
      ]);
      this.map.flyTo({ center: lm.center, zoom: lm.zoom, pitch: lm.pitch, bearing: lm.bearing, duration: TOUR.flyMs, essential: true });
      await arrived;
      await new Promise((r) => setTimeout(r, TOUR.holdMs));
    }
    if (!alive()) return;
    this.touring = false;
    onStep(null);
  }

  /** 停止導覽（使用者自己拖曳、縮放地圖時也會自動停止） */
  stopTour() {
    if (!this.touring) return;
    this.tourId++;
    this.touring = false;
    this.map.stop();
    for (const h of this.tourStopHandlers) h();
  }

  onTourStop(handler: () => void) {
    this.tourStopHandlers.push(handler);
  }

  private tourStopHandlers: (() => void)[] = [];

  // ---------- 建立 ----------

  private setupScene() {
    const map = this.map;
    const layers = map.getStyle().layers;

    // 地名改用中文（台灣的 OSM name 即中文）
    for (const l of layers) {
      if (l.type !== 'symbol') continue;
      const field = map.getLayoutProperty(l.id, 'text-field');
      if (field && JSON.stringify(field).includes('name')) {
        map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name'], ['get', 'name_en']]);
      }
    }

    // 地形（兩個來源分開，地形與陰影的快取互不干擾）
    const dem = { type: 'raster-dem' as const, tiles: [demTiles()], tileSize: 256, encoding: 'terrarium' as const, maxzoom: 15 };
    map.addSource('terrain-dem', { ...dem, attribution: DEM_ATTRIBUTION });
    map.addSource('hillshade-dem', dem);
    map.setTerrain({ source: 'terrain-dem', exaggeration: MAP_CONFIG.exaggeration });

    // 山體陰影放在道路與建築底下
    const before = layers.find(
      (l) => (l.type === 'line' && 'source-layer' in l && l['source-layer'] === 'transportation') || l.type === 'fill-extrusion',
    )?.id;
    map.addLayer(
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'hillshade-dem',
        paint: {
          'hillshade-exaggeration': PALETTE.hillshade.exaggeration,
          'hillshade-shadow-color': PALETTE.hillshade.shadow,
          'hillshade-highlight-color': PALETTE.hillshade.highlight,
          'hillshade-accent-color': PALETTE.hillshade.accent,
          'hillshade-illumination-direction': 315,
        },
      },
      before,
    );

    // 等高線（ROADMAP 1.2）：細線＋每 250 公尺粗線，粗線標高度
    const C = PALETTE.contour;
    const major = ['==', ['get', 'level'], 1] as ExpressionSpecification;
    map.addSource('contours', {
      type: 'vector',
      tiles: [
        contourSource().contourProtocolUrl({
          thresholds: CONTOUR.thresholds,
          elevationKey: 'ele',
          levelKey: 'level',
          contourLayer: 'contours',
        }),
      ],
      maxzoom: 15,
    });
    map.addLayer(
      {
        id: 'contour-lines',
        type: 'line',
        source: 'contours',
        'source-layer': 'contours',
        minzoom: this.lowPower ? MAP_CONFIG.lowPower.contourMinzoom : CONTOUR.minzoom,
        // 只畫陸地（海底等深線不畫）
        filter: ['>', ['get', 'ele'], 0] as FilterSpecification,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['case', major, C.major, C.minor],
          'line-width': ['case', major, 1.1, 0.5],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], CONTOUR.minzoom, 0.3, 13, 0.65],
        },
      },
      before,
    );
    map.addLayer({
      id: 'contour-labels',
      type: 'symbol',
      source: 'contours',
      'source-layer': 'contours',
      minzoom: 12,
      filter: ['all', major, ['>', ['get', 'ele'], 0]] as FilterSpecification,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 320,
        'text-field': ['concat', ['to-string', ['get', 'ele']], ' m'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
      },
      paint: { 'text-color': C.label, 'text-halo-color': PALETTE.labelHalo, 'text-halo-width': 1.2 },
    });

  }

  private setupGameLayers() {
    const map = this.map;
    const regions = this.world.regions;
    const hasShapes = regions.every((r) => r.polygon && r.polygon.length);
    if (!hasShapes) this.warnings.push('目前是草稿世界，沒有行政區界線。執行 npm run build-world 產生真實外框。');

    const districts = {
      type: 'FeatureCollection' as const,
      features: hasShapes
        ? regions.map((r, i) => ({
            type: 'Feature' as const,
            id: i,
            properties: { name: r.name },
            geometry: {
              type: 'MultiPolygon' as const,
              coordinates: r.polygon!.map((ring) => [[...ring, ring[0]]]),
            },
          }))
        : [],
    };
    this.regionBounds = regions.map((r) => {
      const pts = r.polygon?.flat() ?? [r.centroid];
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      return [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ];
    });
    const labels = {
      type: 'FeatureCollection' as const,
      features: regions.map((r, i) => ({
        type: 'Feature' as const,
        id: i,
        properties: { name: r.name, area: r.areaKm2 },
        geometry: { type: 'Point' as const, coordinates: r.centroid },
      })),
    };
    const faults = {
      type: 'FeatureCollection' as const,
      features: this.world.faults.map((f) => ({
        type: 'Feature' as const,
        properties: { name: f.name },
        geometry: { type: 'LineString' as const, coordinates: f.line },
      })),
    };

    map.addSource('districts', { type: 'geojson', data: districts });
    map.addSource('district-labels', { type: 'geojson', data: labels });
    map.addSource('faults', { type: 'geojson', data: faults });
    map.addSource('teams', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    const add = (layer: LayerSpecification, beforeId?: string) => map.addLayer(layer, beforeId);

    add(
      {
        id: 'districts-fill',
        type: 'fill',
        source: 'districts',
        paint: {
          'fill-color': [
            'case',
            SEL,
            '#3b78e7',
            ['interpolate', ['linear'], ['coalesce', ['feature-state', 'sev'], 0], 0, '#7fb069', 0.5, '#f0b43c', 1, '#d2412c'],
          ],
          'fill-opacity': ['case', SEL, 0.22, ['coalesce', ['feature-state', 'alpha'], 0]],
        },
      },
      firstSymbol,
    );
    // 區界：白色襯底 + 深色細線，在任何底色上都看得清楚
    add(
      {
        id: 'districts-casing',
        type: 'line',
        source: 'districts',
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': PALETTE.district.casing,
          'line-opacity': 0.55,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.2, 13, 5],
        },
      },
      firstSymbol,
    );
    add(
      {
        id: 'districts-line',
        type: 'line',
        source: 'districts',
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['case', SEL, '#1f5fe0', PALETTE.district.line],
          'line-opacity': 0.85,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, ['case', SEL, 2.6, 0.9], 13, ['case', SEL, 4.5, 2]],
        },
      },
      firstSymbol,
    );
    add({
      id: 'faults',
      type: 'line',
      source: 'faults',
      layout: { visibility: 'none' },
      paint: { 'line-color': '#c0281e', 'line-width': 2.2, 'line-opacity': 0.85, 'line-dasharray': [2, 1.5] },
    });
    add({
      id: 'district-labels',
      type: 'symbol',
      source: 'district-labels',
      // 拉遠時只顯示面積較大的區，避免市區擠成一團
      filter: ['any', ['>=', ['zoom'], 10.5], ['>=', ['get', 'area'], 25]] as FilterSpecification,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 12, 13, 17],
        'text-letter-spacing': 0.08,
        'text-allow-overlap': false,
        'symbol-sort-key': ['-', ['get', 'area']],
      },
      paint: { 'text-color': PALETTE.district.label, 'text-halo-color': PALETTE.district.halo, 'text-halo-width': 1.8 },
    });
    this.setupFacilityLayers();
    add({
      id: 'teams',
      type: 'circle',
      source: 'teams',
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': ['+', 6, ['*', 1.5, ['get', 'n']]],
        'circle-color': '#2f6fdf',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
        'circle-pitch-alignment': 'map',
      },
    });
  }

  /**
   * 醫院與避難所（ROADMAP 2.3）：世界檔有 facilities 就畫它；
   * 世界檔沒有醫院資料時，改用 OpenStreetMap 圖磚裡的醫院點，至少看得到位置。
   */
  private setupFacilityLayers() {
    const map = this.map;
    const F = PALETTE.facility;
    const facilities = this.world.facilities ?? [];
    map.addSource('facilities', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: facilities.map((f) => ({
          type: 'Feature' as const,
          properties: { kind: f.kind, name: f.name, capacity: f.capacity ?? null },
          geometry: { type: 'Point' as const, coordinates: f.at },
        })),
      },
    });
    const color = ['match', ['get', 'kind'], 'hospital', F.hospital, 'shelter', F.shelter, '#888888'] as ExpressionSpecification;
    const hidden = { visibility: 'none' as const };
    map.addLayer({
      id: 'facility-dots',
      type: 'circle',
      source: 'facilities',
      minzoom: 10,
      layout: hidden,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['match', ['get', 'kind'], 'hospital', 3.5, 2.5], 15, ['match', ['get', 'kind'], 'hospital', 8, 6]],
        'circle-color': color,
        'circle-stroke-color': F.stroke,
        'circle-stroke-width': 1.2,
        'circle-pitch-alignment': 'viewport',
      },
    });
    map.addLayer({
      id: 'facility-labels',
      type: 'symbol',
      source: 'facilities',
      minzoom: 13.5,
      layout: {
        ...hidden,
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.7],
        'text-optional': true,
      },
      paint: { 'text-color': F.label, 'text-halo-color': PALETTE.labelHalo, 'text-halo-width': 1.4 },
    });
    if (!facilities.some((f) => f.kind === 'hospital')) {
      map.addLayer({
        id: 'osm-hospitals',
        type: 'circle',
        source: 'openmaptiles',
        'source-layer': 'poi',
        minzoom: 11,
        filter: ['==', ['get', 'class'], 'hospital'] as FilterSpecification,
        layout: hidden,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 7],
          'circle-color': F.hospital,
          'circle-stroke-color': F.stroke,
          'circle-stroke-width': 1.2,
          'circle-pitch-alignment': 'viewport',
        },
      });
    }
  }

  private setupInteraction() {
    const map = this.map;
    // 使用者自己動地圖（拖曳、縮放、旋轉）就停止導覽
    map.on('movestart', (e) => {
      if (e.originalEvent) this.stopTour();
    });
    const pick = (features: MapGeoJSONFeature[]) => (features.length ? Number(features[0].id) : null);
    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['district-labels', 'districts-fill'] });
      const i = pick(hit);
      this.select(i, i !== null && i !== this.selected);
    });
    map.on('mousemove', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['district-labels', 'districts-fill'] });
      map.getCanvas().style.cursor = hit.length ? 'pointer' : '';
    });
  }
}

/** 判斷是否用省電模式：網址 ?quality=low／high 優先，否則看是不是觸控裝置或 CPU 核心數少 */
function detectLowPower(): boolean {
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'low') return true;
  if (q === 'high') return false;
  return matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
}
