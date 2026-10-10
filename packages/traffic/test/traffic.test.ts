import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bikeStations,
  carFootprints,
  busVehicles,
  congestion,
  demoSnapshot,
  metroArrivals,
  metroLines,
  metroStations,
  parseWktLines,
  railLines,
  railStations,
  railTrains,
  roadSegments,
  trainsNearStations,
  type LngLat,
} from '../src/index';

// 以下樣本依 TDX 文件的欄位格式縮減而成

describe('WKT', () => {
  it('讀 LINESTRING 與 MULTILINESTRING', () => {
    assert.deepEqual(parseWktLines('LINESTRING(120.1 22.6, 120.2 22.7)'), [
      [
        [120.1, 22.6],
        [120.2, 22.7],
      ],
    ]);
    const multi = parseWktLines('MULTILINESTRING ((120 22, 120.1 22.1), (121 23, 121.1 23.1, 121.2 23.2))');
    assert.equal(multi.length, 2);
    assert.equal(multi[1].length, 3);
  });
  it('看不懂的格式回傳空陣列', () => {
    assert.deepEqual(parseWktLines('POINT(120 22)'), []);
    assert.deepEqual(parseWktLines(''), []);
  });
});

describe('公車', () => {
  it('轉換 A1 定時資料，略過沒有座標的車', () => {
    const v = busVehicles([
      {
        PlateNumb: 'KKA-0001',
        RouteName: { Zh_tw: '紅33', En: 'R33' },
        Direction: 1,
        BusPosition: { PositionLon: 120.31, PositionLat: 22.63 },
        Azimuth: 90,
        Speed: 25,
        GPSTime: '2026-10-10T10:00:00+08:00',
      },
      { PlateNumb: 'KKA-0002', RouteName: { Zh_tw: '0北' }, BusPosition: { PositionLon: 0, PositionLat: 0 } },
      { PlateNumb: '-1', BusPosition: { PositionLon: 120.3, PositionLat: 22.6 } },
    ]);
    assert.equal(v.length, 1);
    assert.deepEqual(v[0].at, [120.31, 22.63]);
    assert.equal(v[0].line, '紅33');
    assert.equal(v[0].status, '返程');
    assert.equal(v[0].bearing, 90);
  });
  it('接受包在物件裡的回應，壞資料不會讓整批失敗', () => {
    assert.equal(busVehicles({ BusA1Data: [{ PlateNumb: 'A', BusPosition: { PositionLon: '120.3', PositionLat: '22.6' } }] }).length, 1);
    assert.deepEqual(busVehicles(null), []);
    assert.deepEqual(busVehicles([1, 'x', null]), []);
  });
});

describe('捷運', () => {
  const stations = metroStations(
    [
      { StationID: 'R10', StationName: { Zh_tw: '美麗島' }, StationPosition: { PositionLon: 120.302, PositionLat: 22.6316 } },
      { StationID: 'R11', StationName: { Zh_tw: '高雄車站' }, StationPosition: { PositionLon: 120.3023, PositionLat: 22.6394 } },
    ],
    'metro',
  );
  const lines = metroLines(
    [{ LineID: 'R', Geometry: 'LINESTRING(120.35 22.56, 120.30 22.63, 120.29 22.79)' }],
    'metro',
    [{ LineID: 'R', LineName: { Zh_tw: '紅線' }, LineColor: '#E20B65' }],
  );
  const arrivals = metroArrivals(
    [
      { LineID: 'R', LineName: { Zh_tw: '紅線' }, StationID: 'R10', DestinationStationName: { Zh_tw: '小港' }, EstimateTime: 0 },
      { LineID: 'R', LineName: { Zh_tw: '紅線' }, StationID: 'R10', TripHeadSign: '往南岡山', EstimateTime: 4 },
      { LineID: 'R', LineName: { Zh_tw: '紅線' }, StationID: 'R11', TripHeadSign: '往小港', EstimateTime: -1 },
    ],
    'metro',
  );

  it('車站與路線', () => {
    assert.equal(stations.length, 2);
    assert.equal(stations[0].id, 'metro:R10');
    assert.equal(lines[0].name, '紅線');
    assert.equal(lines[0].color, '#E20B65');
  });
  it('到站資訊依分鐘排序，負值略過', () => {
    const a = arrivals.get('metro:R10')!;
    assert.deepEqual(
      a.map((x) => [x.toward, x.minutes]),
      [
        ['小港', 0],
        ['南岡山', 4],
      ],
    );
    assert.equal(arrivals.has('metro:R11'), false);
  });
  it('1 分鐘內到站的列車畫在車站上', () => {
    const trains = trainsNearStations(stations, arrivals, lines);
    assert.equal(trains.length, 1);
    assert.equal(trains[0].label, '往小港');
    assert.equal(trains[0].color, '#E20B65');
    assert.deepEqual(trains[0].at, stations[0].at);
  });
  it('沒有官方顏色時用預設顏色', () => {
    const l = metroLines([{ LineID: 'O', Geometry: 'LINESTRING(120.27 22.62, 120.39 22.62)' }], 'metro');
    assert.equal(l[0].color, '#f8981d');
  });
});

describe('臺鐵', () => {
  const stations = railStations({
    Stations: [
      { StationID: '4400', StationName: { Zh_tw: '高雄' }, StationPosition: { PositionLon: 120.302, PositionLat: 22.639 } },
      { StationID: '1000', StationName: { Zh_tw: '臺北' }, StationPosition: { PositionLon: 121.517, PositionLat: 25.047 } },
    ],
  });
  it('只留高雄附近的車站', () => {
    assert.deepEqual(
      stations.map((s) => s.name),
      ['高雄'],
    );
  });
  it('列車畫在所在車站，附誤點資訊', () => {
    const trains = railTrains(
      {
        TrainLiveBoards: [
          { TrainNo: '123', TrainTypeName: { Zh_tw: '自強' }, StationID: '4400', TrainStationStatus: 1, DelayTime: 3 },
          { TrainNo: '456', StationID: '1000', TrainStationStatus: 0, DelayTime: 0 },
        ],
      },
      stations,
    );
    assert.equal(trains.length, 1);
    assert.equal(trains[0].label, '123 次');
    assert.equal(trains[0].status, '高雄在站上，晚 3 分');
  });
});

describe('道路', () => {
  it('速度換算壅塞程度；沒有速度時用 TDX 等級', () => {
    assert.equal(congestion(45, undefined), 1);
    assert.equal(congestion(20, undefined), 2);
    assert.equal(congestion(8, undefined), 3);
    assert.equal(congestion(undefined, '2'), 2);
    assert.equal(congestion(-99, '5'), 3);
    assert.equal(congestion(undefined, -1), 0);
  });
  it('線形、名稱、即時路況合併', () => {
    const segs = roadSegments(
      {
        SectionShapes: [
          { SectionID: 'S1', Geometry: 'LINESTRING(120.30 22.62, 120.31 22.62)' },
          { SectionID: 'S2', Geometry: 'LINESTRING(120.30 22.63, 120.31 22.63)' },
          { SectionID: 'S3', Geometry: 'bad' },
        ],
      },
      { LiveTraffics: [{ SectionID: 'S1', TravelSpeed: 12, CongestionLevel: '1' }] },
      { Sections: [{ SectionID: 'S1', SectionName: '中山一路(五福路-民族路)' }] },
    );
    assert.equal(segs.length, 2);
    assert.equal(segs[0].name, '中山一路(五福路-民族路)');
    assert.equal(segs[0].level, 3);
    assert.equal(segs[0].speedKmh, 12);
    assert.equal(segs[1].level, 0);
  });
});

describe('公共自行車', () => {
  it('站點加上即時車位', () => {
    const s = bikeStations(
      [
        { StationUID: 'KHH1', StationName: { Zh_tw: 'YouBike2.0_捷運美麗島站' }, StationPosition: { PositionLon: 120.302, PositionLat: 22.631 } },
        { StationUID: 'KHH2', StationName: { Zh_tw: '中央公園' }, StationPosition: { PositionLon: 120.301, PositionLat: 22.624 } },
      ],
      [{ StationUID: 'KHH1', AvailableRentBikes: 5, AvailableReturnBikes: 7 }],
    );
    assert.equal(s[0].name, '捷運美麗島站');
    assert.deepEqual(s[0].bikes, { rent: 5, ret: 7 });
    assert.equal(s[1].bikes, undefined);
  });
});

describe('示範資料', () => {
  it('同一時間結果相同，時間往前列車會移動', () => {
    const t = Date.UTC(2026, 9, 10, 2, 0, 0);
    assert.deepEqual(demoSnapshot(t), demoSnapshot(t));
    const a = demoSnapshot(t);
    const b = demoSnapshot(t + 20_000);
    assert.equal(a.source, 'demo');
    assert.ok(a.vehicles.length >= 10, `列車數 ${a.vehicles.length}`);
    const moved = a.vehicles.filter((v) => {
      const w = b.vehicles.find((x) => x.id === v.id);
      return w && (w.at[0] !== v.at[0] || w.at[1] !== v.at[1]);
    });
    assert.ok(moved.length > 0);
  });
  it('列車都在高雄範圍內，車站有下一班資訊', () => {
    const s = demoSnapshot(Date.UTC(2026, 9, 10, 5, 30, 0));
    for (const v of s.vehicles) {
      assert.ok(v.at[0] > 120.2 && v.at[0] < 120.45 && v.at[1] > 22.5 && v.at[1] < 22.85, v.id);
    }
    const mlld = s.stations.find((x) => x.name === '美麗島')!;
    // 美麗島是轉乘站：紅線兩個方向＋橘線兩個方向
    assert.equal(mlld.arrivals!.length, 4);
    for (const a of mlld.arrivals!) assert.ok(a.minutes >= 0 && a.minutes < 9);
  });
});

describe('臺鐵路線', () => {
  it('只保留高雄範圍內的線段，出界就切斷', () => {
    const lines = railLines({
      Shapes: [
        { LineID: 'WL', LineName: { Zh_tw: '縱貫線' }, Geometry: 'LINESTRING(120.30 22.62, 120.31 22.70, 121.5 25.0)' },
        { LineID: 'X', Geometry: 'LINESTRING(121.5 25.0, 121.6 25.1)' },
      ],
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].name, '縱貫線');
    assert.deepEqual(lines[0].path, [
      [
        [120.3, 22.62],
        [120.31, 22.7],
      ],
    ]);
  });
});

describe('3D 車廂外框', () => {
  const spec = { cars: 3, lengthM: 20, widthM: 3, gapM: 1 };
  const m = (a: LngLat, b: LngLat) => Math.hypot((b[0] - a[0]) * 111_320 * Math.cos((a[1] * Math.PI) / 180), (b[1] - a[1]) * 110_574);

  it('沒有軌道：沿行進方向往後排成直線，大小正確', () => {
    const cars = carFootprints([120.3, 22.6], 0, spec);
    assert.equal(cars.length, 3);
    for (const c of cars) {
      assert.equal(c.ring.length, 5);
      assert.deepEqual(c.ring[0], c.ring[4]);
      assert.ok(Math.abs(m(c.ring[0], c.ring[1]) - 3) < 0.01, '寬 3 公尺');
      assert.ok(Math.abs(m(c.ring[1], c.ring[2]) - 20) < 0.01, '長 20 公尺');
    }
    // 往北行駛，車廂往南排：第 3 節最南
    assert.ok(cars[2].ring[2][1] < cars[0].ring[2][1]);
    assert.ok(Math.abs(cars[2].ring[2][1] - (22.6 - 62 / 110_574)) < 1e-7, '總長 3×20＋2×1');
  });

  it('放大倍數讓車廂等比例變大', () => {
    const big = carFootprints([120.3, 22.6], 90, spec, 4);
    assert.ok(Math.abs(m(big[0].ring[1], big[0].ring[2]) - 80) < 0.05);
  });

  it('有軌道：車頭吸附到軌道，車廂沿彎道往後排', () => {
    // 軌道從南往北再轉東；車頭在東段上、往東開
    const track: LngLat[] = [
      [120.3, 22.598],
      [120.3, 22.6],
      [120.302, 22.6],
    ];
    const cars = carFootprints([120.3008, 22.60005], 90, { cars: 3, lengthM: 40, widthM: 3, gapM: 0 }, 1, [track]);
    // 車頭吸附到 y = 22.6 的線上（中心點）
    const center = (r: LngLat[]) => [(r[0][0] + r[1][0]) / 2, (r[0][1] + r[1][1]) / 2] as LngLat;
    assert.ok(Math.abs(center(cars[0].ring)[1] - 22.6) < 1e-7);
    // 第 3 節已經轉到南北向那段：在轉角（120.3）的西邊不會超過、而且比轉角更南
    const rear = cars[2].ring;
    const rearCenter: LngLat = [(rear[2][0] + rear[3][0]) / 2, (rear[2][1] + rear[3][1]) / 2];
    assert.ok(Math.abs(rearCenter[0] - 120.3) < 1e-6, `${rearCenter}`);
    assert.ok(rearCenter[1] < 22.6);
  });

  it('離軌道太遠就不吸附', () => {
    const track: LngLat[] = [
      [120.3, 22.6],
      [120.31, 22.6],
    ];
    const cars = carFootprints([120.305, 22.61], 0, spec, 1, [track], 150);
    const c = cars[0].ring;
    assert.ok(Math.abs((c[0][1] + c[1][1]) / 2 - 22.61) < 1e-7);
  });

  it('車頭在軌道終點、方向朝外也能排滿', () => {
    const track: LngLat[] = [
      [120.3, 22.6],
      [120.301, 22.6],
    ];
    const cars = carFootprints([120.3, 22.6], 270, spec, 1, [track]);
    assert.equal(cars.length, 3);
    for (const c of cars) for (const p of c.ring) assert.ok(Number.isFinite(p[0]) && Number.isFinite(p[1]));
  });
});

describe('示範公車與分段車廂', () => {
  it('示範資料有公車，公車在路上移動、沒有官方顏色', () => {
    const t = Date.UTC(2026, 9, 10, 3, 0, 0);
    const buses = demoSnapshot(t).vehicles.filter((v) => v.mode === 'bus');
    assert.ok(buses.length >= 6, `公車 ${buses.length} 台`);
    for (const b of buses) {
      assert.equal(b.color, undefined);
      assert.ok(b.bearing !== undefined);
    }
    // 示範公車不畫路線、不加站牌
    const s = demoSnapshot(t);
    assert.ok(s.lines.every((l) => l.mode !== 'bus'));
    assert.ok(s.stations.every((x) => x.mode !== 'bus'));
  });
  it('各節長度不同：公車車頭段＋車身段', () => {
    const parts = carFootprints([120.3, 22.6], 0, { cars: 1, lengthM: 12, widthM: 2.5, gapM: 0, sectionsM: [2, 10] });
    assert.equal(parts.length, 2);
    const len = (r: LngLat[]) => (r[1][1] - r[2][1]) * 110_574;
    assert.ok(Math.abs(len(parts[0].ring) - 2) < 0.01);
    assert.ok(Math.abs(len(parts[1].ring) - 10) < 0.01);
    // 車身段緊接在車頭段後面
    assert.ok(Math.abs(parts[0].ring[2][1] - parts[1].ring[1][1]) < 1e-9);
  });
});

describe('示範輕軌', () => {
  it('環狀輕軌有路線、車站與兩個方向的列車', () => {
    const s = demoSnapshot(Date.UTC(2026, 9, 10, 4, 0, 0));
    const line = s.lines.find((l) => l.mode === 'lightrail')!;
    assert.equal(line.name, '環狀輕軌');
    assert.equal(line.color, '#7cc142');
    // 環狀：路線頭尾相接
    assert.deepEqual(line.path[0][0], line.path[0][line.path[0].length - 1]);
    const trains = s.vehicles.filter((v) => v.mode === 'lightrail');
    assert.ok(trains.length >= 4, `輕軌 ${trains.length} 列`);
    assert.deepEqual([...new Set(trains.map((v) => v.label))].sort(), ['逆行', '順行']);
    const st = s.stations.filter((x) => x.mode === 'lightrail');
    assert.equal(st.length, 22);
    assert.ok(st.every((x) => x.arrivals!.length === 2));
  });
});
