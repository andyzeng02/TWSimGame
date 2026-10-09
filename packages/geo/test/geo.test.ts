import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  areaKm2,
  interiorPoint,
  lonLatToTm2,
  parseCsv,
  pointInRing,
  readDbf,
  readShp,
  signedAreaKm2,
  simplifyRing,
  tm2ToLonLat,
  type Ring,
  type XY,
} from '../src/index';
import { writeDbf, writeShp } from './writers';

const square = (x: number, y: number, s: number): Ring => [
  [x, y],
  [x, y + s],
  [x + s, y + s],
  [x + s, y],
]; // 順時針（Shapefile 外圈方向）

describe('shapefile', () => {
  it('讀回多邊形（含多個 part）與線', () => {
    const shp = writeShp(5, [[square(120, 22, 0.1), square(120.5, 22, 0.1)], [square(121, 23, 0.2)]]);
    const f = readShp(shp);
    assert.equal(f.records.length, 2);
    assert.equal(f.records[0].type, 5);
    assert.equal(f.records[0].parts.length, 2);
    assert.deepEqual(f.records[1].parts[0][2], [121.2, 23.2]);
    const line = readShp(writeShp(3, [[[[120, 22], [120.1, 22.1], [120.2, 22.3]]]]));
    assert.equal(line.records[0].type, 3);
    assert.equal(line.records[0].parts[0].length, 3);
  });

  it('DBF：UTF-8 與 Big5 中文欄位值都讀得出來', () => {
    const rows = [
      { COUNTYNAME: '高雄市', TOWNNAME: '三民區', POP: 330000 },
      { COUNTYNAME: '臺南市', TOWNNAME: '東區', POP: 180000 },
    ];
    for (const enc of ['utf-8', 'big5'] as const) {
      const dbf = readDbf(writeDbf(rows, enc), enc === 'utf-8' ? 'UTF-8' : undefined);
      assert.deepEqual(
        dbf.fields.map((f) => f.name),
        ['COUNTYNAME', 'TOWNNAME', 'POP'],
      );
      assert.equal(dbf.rows[0].TOWNNAME, '三民區', enc);
      assert.equal(dbf.rows[1].COUNTYNAME, '臺南市', enc);
      assert.equal(dbf.rows[0].POP, 330000);
    }
  });
});

describe('TWD97 TM2', () => {
  it('中央經線 121° 的東距為 250,000 m', () => {
    const [x] = lonLatToTm2(121, 23.5);
    assert.ok(Math.abs(x - 250000) < 1e-6);
  });
  it('往返誤差小於 1 公分', () => {
    for (const [lon, lat] of [
      [120.3, 22.6],
      [120.7, 23.2],
      [121.5, 25.0],
      [120.0, 21.9],
    ]) {
      const [x, y] = lonLatToTm2(lon, lat);
      const [lon2, lat2] = tm2ToLonLat(x, y);
      assert.ok(Math.abs(lon - lon2) < 1e-7 && Math.abs(lat - lat2) < 1e-7, `${lon},${lat}`);
    }
  });
  it('北距合理（北緯 22.6° 約 250 萬公尺）', () => {
    const [, y] = lonLatToTm2(120.3, 22.6);
    assert.ok(y > 2_490_000 && y < 2_510_000, String(y));
  });
});

describe('polygon', () => {
  it('面積：0.1° 見方在北緯 22° 約 115 km²', () => {
    const a = areaKm2([square(120, 22, 0.1)]);
    assert.ok(Math.abs(a - 11.132 * 10.32) < 2, String(a));
    assert.ok(signedAreaKm2(square(120, 22, 0.1)) < 0); // 順時針為負
  });
  it('點在多邊形內', () => {
    const r = square(0, 0, 1);
    assert.ok(pointInRing([0.5, 0.5], r));
    assert.ok(!pointInRing([1.5, 0.5], r));
  });
  it('代表點落在 L 形內部（重心會落在外面的形狀）', () => {
    const L: Ring = [
      [0, 0],
      [0, 1],
      [0.2, 1],
      [0.2, 0.2],
      [1, 0.2],
      [1, 0],
    ];
    const p = interiorPoint([L]);
    assert.ok(pointInRing(p, L), String(p));
  });
  it('簡化：直線上的多餘點被移除，形狀保留', () => {
    const r: Ring = [];
    for (let i = 0; i <= 50; i++) r.push([120 + i * 0.002, 22]);
    for (let i = 0; i <= 50; i++) r.push([120.1, 22 + i * 0.002]);
    r.push([120, 22.1]);
    const s = simplifyRing(r, 0.05);
    assert.ok(s.length <= 6, String(s.length));
    assert.ok(Math.abs(areaKm2([s]) - areaKm2([r])) < 0.5);
  });
});

describe('csv', () => {
  it('引號、逗號、BOM', () => {
    const rows = parseCsv('﻿a,b\n"高雄市,三民區",1\r\n"x""y",2\n');
    assert.deepEqual(rows, [
      ['a', 'b'],
      ['高雄市,三民區', '1'],
      ['x"y', '2'],
    ]);
  });
});
