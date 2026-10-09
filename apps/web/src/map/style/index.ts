import type { FilterSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { PALETTE } from '../config';
import base from './base.json';

/**
 * 自有底圖樣式：以 base.json（OpenFreeMap liberty 樣式的副本，MIT 授權）為圖層結構，
 * 套上 config.ts 的 PALETTE，得到插畫風底圖。
 *
 * 只改顏色、字級與少數圖層的顯示；不新增遊戲圖層（那些在 MapView.setupGameLayers）。
 */
export function buildStyle(): StyleSpecification {
  const style = structuredClone(base) as unknown as StyleSpecification;
  const P = PALETTE;
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
      const color = roadColor(id);
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
  }

  style.layers = layers;
  delete style.sources.ne2_shaded;
  return style;
}

/** 依圖層名稱判斷道路等級，回傳主色或外框色；不是道路回傳 undefined */
function roadColor(id: string): string | undefined {
  const R = PALETTE.road;
  if (id.includes('rail')) return PALETTE.rail;
  const casing = id.endsWith('_casing') ? 1 : 0;
  if (id.includes('path_pedestrian')) return casing ? R.minor[1] : R.path;
  if (id.includes('motorway')) return R.motorway[casing];
  if (id.includes('trunk_primary') || /_link(_casing)?$/.test(id)) return R.trunk[casing];
  if (id.includes('secondary_tertiary')) return R.secondary[casing];
  if (id.includes('minor') || id.includes('street') || id.includes('service_track')) return R.minor[casing];
  return undefined;
}
