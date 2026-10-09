import { Map as MLMap, NavigationControl, ScaleControl } from 'maplibre-gl';
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
import { DEM_ATTRIBUTION, DEM_TILES, MAP_CONFIG, PALETTE, SKY } from './config';
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

export class MapView {
  readonly map: MLMap;
  attribution = '';
  warnings: string[] = [];

  private selected: number | null = null;
  private handlers: ((i: number | null) => void)[] = [];
  private regionBounds: [[number, number], [number, number]][] = [];

  private constructor(container: HTMLElement, private world: World) {
    const { start, bounds, localFont } = MAP_CONFIG;
    this.map = new MLMap({
      container,
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

  /** 觀景模式：隱藏災情著色、斷層、搜救隊，只留地景、區界、區名 */
  setSceneMode(scene: boolean) {
    for (const id of GAME_LAYERS) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', scene ? 'none' : 'visible');
  }

  /** 回到開場鏡頭 */
  resetView() {
    const { start } = MAP_CONFIG;
    this.map.flyTo({ ...start, duration: 1800 });
  }

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
    const dem = { type: 'raster-dem' as const, tiles: [DEM_TILES], tileSize: 256, encoding: 'terrarium' as const, maxzoom: 15 };
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

    map.setSky(SKY as unknown as SkySpecification);
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
          'line-color': '#ffffff',
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
          'line-color': ['case', SEL, '#1f5fe0', '#4a4136'],
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
      paint: { 'text-color': '#2b2620', 'text-halo-color': 'rgba(255,255,255,0.92)', 'text-halo-width': 1.8 },
    });
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

  private setupInteraction() {
    const map = this.map;
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
