import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lonLatToTm2, pointInRings, type XY } from '@twsim/geo';
import { buildWorld, describeSources, InputError, readFacilities, readFeatures, rocDateIn } from '../build-world';
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

describe('資料來源（ROADMAP 2.4）', () => {
  it('從檔名讀出民國日期', () => {
    assert.equal(rocDateIn('pipeline/raw/TOWN_MOI_1140318.shp'), '2025-03-18');
    assert.equal(rocDateIn('C:\\data\\pop_1130930.csv'), '2024-09-30');
    assert.equal(rocDateIn('faults.shp'), undefined);
    assert.equal(rocDateIn('x_1141399.shp'), undefined, '不合理的月份');
  });

  it('只給界線時，人口與斷層標成草稿；檔案只留檔名', () => {
    const s = describeSources({ boundaries: '/home/me/secret/TOWN_MOI_1140318.shp' });
    assert.deepEqual(
      s.map((x) => [x.role, x.draft ?? false]),
      [
        ['行政區界線', false],
        ['人口', true],
        ['活動斷層', true],
      ],
    );
    assert.equal(s[0].file, 'TOWN_MOI_1140318.shp');
    assert.equal(s[0].version, '2025-03-18');
    assert.ok(!JSON.stringify(s).includes('secret'), '不能留下本機路徑');
  });

  it('有人口、斷層、床數檔時列出各自來源', () => {
    const s = describeSources({ boundaries: 'b.shp', population: 'p.csv', faults: 'f.shp', beds: 'beds.csv' });
    assert.deepEqual(
      s.map((x) => x.role),
      ['行政區界線', '人口', '活動斷層', '醫院病床'],
    );
    assert.ok(s.every((x) => !x.draft));
  });

  it('寫進世界檔的 meta', () => {
    const sources = describeSources({ boundaries: 'b.shp' });
    const w = buildWorld({ boundaries: fakeBoundaries(), sourceNote: '', sources, builtAt: '2026-10-09' });
    assert.equal(w.meta.builtAt, '2026-10-09');
    assert.deepEqual(w.meta.sources, sources);
  });
});

describe('設施點（ROADMAP 2.3）', () => {
  const world = buildWorld({ boundaries: fakeBoundaries(), sourceNote: '' });
  const idx = (name: string) => world.regions.findIndex((r) => r.name === name);

  it('讀避難收容處所：經緯度、容量、只留高雄、海岸邊的點歸到最近的區', () => {
    const csv = [
      '序號,縣市及鄉鎮市區,避難收容處所名稱,經度,緯度,預計收容人數',
      '1,高雄市三民區,三民國小,120.32,22.67,"1,200"',
      '2,高雄市旗津區,旗津活動中心,120.2705,22.6005,300',
      '3,臺南市東區,大學國小,120.25,23.05,500',
      '4,高雄市苓雅區,沒有座標,,,100',
    ].join('\n');
    const logs: string[] = [];
    const f = readFacilities(csv, 'shelter', world.regions, { log: (m) => logs.push(m) });
    assert.deepEqual(
      f.map((x) => [x.name, world.regions[x.region].name, x.capacity]),
      [
        ['三民國小', '三民區', 1200],
        ['旗津活動中心', '旗津區', 300],
      ],
    );
    assert.ok(f.every((x) => x.kind === 'shelter'));
    assert.ok(logs.some((m) => m.includes('1 筆沒有座標')));
  });

  it('讀醫院：TWD97 座標自動轉換，沒有容量欄也可以', () => {
    const [x, y] = lonLatToTm2(120.32, 22.62);
    const csv = ['醫院名稱,TWD97X,TWD97Y', `苓雅醫院,${x},${y}`].join('\n');
    const f = readFacilities(csv, 'hospital', world.regions);
    assert.equal(f.length, 1);
    assert.equal(f[0].region, idx('苓雅區'));
    assert.equal(f[0].capacity, undefined);
    assert.ok(Math.abs(f[0].at[0] - 120.32) < 1e-4 && Math.abs(f[0].at[1] - 22.62) < 1e-4);
  });

  it('找不到經緯度欄時列出實際欄位', () => {
    assert.throws(() => readFacilities('名稱,地址\n甲,某路1號', 'shelter', world.regions), /實際欄位：名稱, 地址/);
  });

  it('寫進世界檔並通過檢查', () => {
    const w = buildWorld({
      boundaries: fakeBoundaries(),
      sourceNote: '',
      sheltersCsv: '名稱,經度,緯度\n三民國小,120.32,22.67',
      hospitalsCsv: '名稱,經度,緯度,病床數\n苓雅醫院,120.32,22.62,450',
    });
    assert.deepEqual(
      w.facilities?.map((f) => [f.kind, f.name, f.capacity]),
      [
        ['hospital', '苓雅醫院', 450],
        ['shelter', '三民國小', undefined],
      ],
    );
  });
});
