import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lonLatToTm2, pointInRings, type XY } from '@twsim/geo';
import { buildWorld, InputError, readFeatures } from '../build-world';
import { writeDbf, writeShp } from '../../packages/geo/test/writers';

/** 以經緯度描述的方塊，輸出成 TM2 公尺座標（模擬國土測繪中心的 TM2 版本） */
const sq = (lon: number, lat: number, s: number): XY[] =>
  (
    [
      [lon, lat],
      [lon, lat + s],
      [lon + s, lat + s],
      [lon + s, lat],
    ] as XY[]
  ).map(([x, y]) => lonLatToTm2(x, y));

/**
 * 假高雄：三民區、苓雅區相鄰；旗津區與其他區隔水（並含一個遠方離島）；
 * 另有一筆臺南市資料應被濾掉；苓雅區有一個內洞。
 */
function fakeBoundaries() {
  const hole = sq(120.31, 22.61, 0.005).reverse();
  const shp = writeShp(5, [
    [sq(120.3, 22.65, 0.05)],
    [sq(120.3, 22.6, 0.05), hole],
    [sq(120.25, 22.58, 0.02), sq(116.7, 20.7, 0.05)],
    [sq(120.2, 23.0, 0.1)],
  ]);
  const dbf = writeDbf(
    [
      { COUNTYNAME: '高雄市', TOWNNAME: '三民區', TOWNCODE: '64000050' },
      { COUNTYNAME: '高雄市', TOWNNAME: '苓雅區', TOWNCODE: '64000080' },
      { COUNTYNAME: '高雄市', TOWNNAME: '旗津區', TOWNCODE: '64000100' },
      { COUNTYNAME: '臺南市', TOWNNAME: '東區', TOWNCODE: '67000010' },
    ],
    'big5',
  );
  return readFeatures({ shp, dbf });
}

const POP_CSV = [
  'statistic_yyymm,site_id,village,people_total',
  '統計年月,區域別,村里名稱,人口數',
  '11408,高雄市三民區,德智里,"1,200"',
  '11408,高雄市三民區,德仁里,800',
  '11408,高雄市苓雅區,城北里,1500',
  '11408,高雄市旗津區,中洲里,600',
  '11408,臺南市東區,大學里,9999',
].join('\n');

function fakeFaults() {
  const shp = writeShp(3, [[[lonLatToTm2(120.45, 22.9), lonLatToTm2(120.36, 22.7)]], [[lonLatToTm2(121.6, 24.5), lonLatToTm2(121.7, 24.6)]]]);
  const dbf = writeDbf([{ NAME: '旗山斷層' }, { NAME: '遠方斷層' }], 'utf-8');
  return readFeatures({ shp, dbf, cpg: 'UTF-8' });
}

describe('build-world', () => {
  const logs: string[] = [];
  const world = buildWorld(
    { boundaries: fakeBoundaries(), populationCsv: POP_CSV, faults: fakeFaults(), sourceNote: 'test' },
    { log: (m) => logs.push(m) },
  );

  it('只留高雄市，依代碼排序，TM2 已轉回經緯度', () => {
    assert.deepEqual(
      world.regions.map((r) => r.name),
      ['三民區', '苓雅區', '旗津區'],
    );
    const [lon, lat] = world.regions[0].centroid;
    assert.ok(lon > 120.29 && lon < 120.36 && lat > 22.64 && lat < 22.71, `${lon},${lat}`);
  });

  it('代表點落在區塊內', () => {
    for (const r of world.regions) assert.ok(pointInRings(r.centroid, r.polygon!), r.name);
  });

  it('略過遠方離島與內洞', () => {
    assert.equal(world.regions[2].polygon!.length, 1);
    assert.equal(world.regions[1].polygon!.length, 1);
    assert.ok(logs.some((l) => l.includes('離島')));
  });

  it('面積合理（0.05° 見方約 29 km²）', () => {
    assert.ok(Math.abs(world.regions[0].areaKm2 - 29.6) < 1.5, String(world.regions[0].areaKm2));
  });

  it('共用邊界 → 相鄰；被水隔開的旗津 → 自動補道路，全部連通', () => {
    const adj = world.edges.find((e) => e.from === 0 && e.to === 1);
    assert.equal(adj?.kind, 'adjacent');
    assert.ok(world.edges.some((e) => (e.from === 2 || e.to === 2) && e.kind === 'road'));
  });

  it('人口：村里加總、千分位逗號、排除外縣市、略過說明列', () => {
    assert.deepEqual(
      world.regions.map((r) => r.population),
      [2000, 1500, 600],
    );
  });

  it('斷層：只留附近的、旗山斷層對應到 chishan', () => {
    assert.deepEqual(
      world.faults.map((f) => f.id),
      ['chishan'],
    );
    assert.ok(Math.abs(world.faults[0].line[0][0] - 120.45) < 1e-4);
  });

  it('找不到縣市欄位時給出清楚錯誤', () => {
    const shp = writeShp(5, [[sq(120.3, 22.6, 0.05)]]);
    const dbf = writeDbf([{ FOO: 'x' }], 'utf-8');
    assert.throws(() => buildWorld({ boundaries: readFeatures({ shp, dbf }), sourceNote: '' }), InputError);
  });

  it('沒有人口與斷層檔時，改用提供的約略值', () => {
    const w = buildWorld({
      boundaries: fakeBoundaries(),
      sourceNote: '',
      fallbackPopulation: new Map([['三民區', 330000], ['苓雅區', 160000], ['旗津區', 28000]]),
      fallbackFaults: [{ id: 'chishan', name: '旗山斷層（示意）', line: [[120.4, 22.9], [120.36, 22.7]] }],
    });
    assert.deepEqual(w.regions.map((r) => r.population), [330000, 160000, 28000]);
    assert.equal(w.faults[0].id, 'chishan');
  });

  it('GeoJSON 輸入（經緯度、逆時針外圈）也能用', () => {
    const ring = [
      [120.3, 22.6],
      [120.35, 22.6],
      [120.35, 22.65],
      [120.3, 22.65],
      [120.3, 22.6],
    ];
    const gj = JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { COUNTYNAME: '高雄市', TOWNNAME: '前鎮區' }, geometry: { type: 'Polygon', coordinates: [ring] } }],
    });
    const w = buildWorld({ boundaries: readFeatures({ geojson: gj }), sourceNote: '' });
    assert.equal(w.regions[0].name, '前鎮區');
    assert.ok(w.regions[0].areaKm2 > 25);
  });
});
