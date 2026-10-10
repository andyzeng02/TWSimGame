import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bikeStations,
  busVehicles,
  congestion,
  demoSnapshot,
  metroArrivals,
  metroLines,
  metroStations,
  parseWktLines,
  railStations,
  railTrains,
  roadSegments,
  trainsNearStations,
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
