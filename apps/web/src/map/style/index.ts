import type { FilterSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { LAKES, MAJOR_RIVERS, PALETTE, type Palette } from '../config';
import base from './base.json';

/**
 * 自有底圖樣式：以 base.json（OpenFreeMap liberty 樣式的副本，MIT 授權）為圖層結構，
 * 套上 config.ts 的配色（白天 PALETTE、夜間 NIGHT_PALETTE），得到插畫風底圖。
 *
 * 只改顏色、字級與少數圖層的顯示；不新增遊戲圖層（那些在 MapView.setupGameLayers）。
 */
export function buildStyle(P: Palette = PALETTE): StyleSpecification {
  const style = structuredClone(base) as unknown as StyleSpecification;
  const layers: LayerSpecification[] = [];

  for (const layer of style.layers) {
    const paint = (layer.paint ??= {}) as Record<string, unknown>;
    const layout = (layer.layout ??= {}) as Record<string, unknown>;
    const id = layer.id;

    // 寫實的陸地陰影底圖、公園虛線框：插畫風不需要
    if (id === 'natural_earth' || id === 'park_outline') continue;

    const fill = (color: string, opacity = 1) => {
      paint['fill-color'] = color;
      paint['fill-opacity'] = opacity;
      delete paint['fill-pattern'];
      delete paint['fill-outline-color'];
    };

    switch (id) {
      case 'background':
        paint['background-color'] = P.land;
        break;
      case 'park':
        fill(P.park, 0.85);
        break;
      case 'landuse_residential':
        fill(P.residential, 0.8);
        break;
      case 'landcover_wood':
        fill(P.wood, 0.85);
        break;
      case 'landcover_grass':
      case 'landuse_pitch':
      case 'landuse_track':
        fill(P.grass, 0.75);
        break;
      case 'landcover_wetland':
        fill(P.wetland, 0.8);
        break;
      case 'landcover_sand':
        fill(P.sand);
        break;
      case 'landuse_cemetery':
        fill(P.cemetery);
        break;
      case 'landuse_hospital':
        fill(P.hospital);
        break;
      case 'landuse_school':
        fill(P.school);
        break;
      case 'aeroway_fill':
        fill(P.airport, 0.8);
        break;
      case 'water':
        fill(P.water);
        break;
      case 'waterway_river':
        paint['line-color'] = P.river;
        paint['line-width'] = ['interpolate', ['exponential', 1.2], ['zoom'], 8, 0.8, 12, 1.8, 20, 8];
        break;
      case 'waterway_other':
      case 'waterway_tunnel':
        paint['line-color'] = P.river;
        break;
      case 'building':
        paint['fill-color'] = P.building;
        paint['fill-outline-color'] = P.buildingOutline;
        break;
      case 'building-3d':
        paint['fill-extrusion-color'] = P.building3d;
        paint['fill-extrusion-opacity'] = 0.9;
        break;
    }

    if (layer.type === 'line' && 'source-layer' in layer && layer['source-layer'] === 'transportation') {
      const color = roadColor(id, P);
      if (color) paint['line-color'] = color;
    }

    if (layer.type === 'symbol') {
      paint['text-halo-color'] = P.labelHalo;
      paint['text-halo-width'] = 1.5;
      paint['text-halo-blur'] = 0.5;
      if (id.startsWith('water')) paint['text-color'] = P.waterLabel;
      else if (id.startsWith('label_')) paint['text-color'] = P.label;
      else paint['text-color'] = P.labelMinor;

      // 城鎮名稱：去掉黑點、加大字級
      const size = { label_city: P.labelSize.city, label_town: P.labelSize.town, label_village: P.labelSize.village }[id];
      if (size) {
        delete layout['icon-image'];
        layout['text-anchor'] = 'center';
        layout['text-size'] = ['interpolate', ['linear'], ['zoom'], ...size];
      }
    }

    layers.push(layer);

    // OpenMapTiles 有農地分類，原樣式沒畫；補在草地之後
    if (id === 'landcover_grass') {
      layers.push({
        id: 'landcover_farmland',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'farmland'] as FilterSpecification,
        paint: { 'fill-color': P.farmland, 'fill-opacity': 0.8, 'fill-antialias': false },
      });
    }

    // 主要河川：比一般河流粗，拉遠也看得到（寬河段另有水域面覆蓋，顯示真實寬度）
    if (id === 'waterway_river') {
      layers.push({
        id: 'waterway_major',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        filter: isMajorRiver,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': P.river,
          'line-width': ['interpolate', ['exponential', 1.3], ['zoom'], 8, 1.6, 11, 3, 14, 6, 18, 14],
        },
      });
    }
  }

  // 山與水的名稱（ROADMAP 1.3），放在城鎮名稱之下
  style.sources['lake-names'] = {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: LAKES.map((l) => ({
        type: 'Feature',
        properties: { name: l.name },
        geometry: { type: 'Point', coordinates: l.at },
      })),
    },
  };
  const at = layers.findIndex((l) => l.id === 'label_other');
  layers.splice(at < 0 ? layers.length : at, 0, ...nameLayers(P));

  style.layers = layers;
  delete style.sources.ne2_shaded;
  // 顏色立即切換：有 3D 地形時，漸變過程中地表貼圖不會跟著重畫，會停在舊顏色
  style.transition = { duration: 0, delay: 0 };
  return style;
}

const isMajorRiver = ['in', ['get', 'name'], ['literal', MAJOR_RIVERS]] as FilterSpecification;

function nameLayers(P: Palette): LayerSpecification[] {
  const halo = { 'text-halo-color': P.labelHalo, 'text-halo-width': 1.6, 'text-halo-blur': 0.5 };
  const isPeak = ['in', ['get', 'class'], ['literal', ['peak', 'volcano']]] as FilterSpecification;
  return [
    {
      id: 'waterway_major_label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      minzoom: 9,
      filter: isMajorRiver,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 9, 12, 14, 16],
        'symbol-placement': 'line',
        'symbol-spacing': 400,
        'text-letter-spacing': 0.3,
        'text-max-angle': 30,
      },
      paint: { 'text-color': P.waterLabel, ...halo },
    },
    {
      id: 'lake_name',
      type: 'symbol',
      source: 'lake-names',
      minzoom: 10,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 15, 16],
        'text-letter-spacing': 0.2,
      },
      paint: { 'text-color': P.waterLabel, ...halo },
    },
    {
      id: 'mountain_peak_dot',
      type: 'circle',
      source: 'openmaptiles',
      'source-layer': 'mountain_peak',
      minzoom: 10,
      filter: isPeak,
      paint: {
        'circle-radius': 3,
        'circle-color': P.peak.dot,
        'circle-stroke-color': P.labelHalo,
        'circle-stroke-width': 1.2,
        'circle-pitch-alignment': 'viewport',
      },
    },
    {
      id: 'mountain_peak_label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'mountain_peak',
      minzoom: 10,
      filter: isPeak,
      layout: {
        // 山名 + 高度（公尺）
        'text-field': [
          'format',
          ['coalesce', ['get', 'name'], ''],
          {},
          '\n',
          {},
          ['concat', ['to-string', ['get', 'ele']], ' m'],
          { 'font-scale': 0.8 },
        ],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 14, 14],
        'text-anchor': 'top',
        'text-offset': [0, 0.5],
        'symbol-sort-key': ['-', ['coalesce', ['get', 'ele'], 0]],
      },
      paint: { 'text-color': P.peak.label, ...halo },
    },
  ];
}

/** 依圖層名稱判斷道路等級，回傳主色或外框色；不是道路回傳 undefined */
function roadColor(id: string, P: Palette): string | undefined {
  const R = P.road;
  if (id.includes('rail')) return P.rail;
  const casing = id.endsWith('_casing') ? 1 : 0;
  if (id.includes('path_pedestrian')) return casing ? R.minor[1] : R.path;
  if (id.includes('motorway')) return R.motorway[casing];
  if (id.includes('trunk_primary') || /_link(_casing)?$/.test(id)) return R.trunk[casing];
  if (id.includes('secondary_tertiary')) return R.secondary[casing];
  if (id.includes('minor') || id.includes('street') || id.includes('service_track')) return R.minor[casing];
  return undefined;
}
