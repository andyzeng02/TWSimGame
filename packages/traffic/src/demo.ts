/**
 * 示範資料：沒有連上交通資料伺服器時，畫面仍然看得到「會動的捷運」。
 *
 * 車站座標是約略值，列車依固定班距在站與站之間移動，**不是即時資料**；
 * 畫面上會標示「示範資料」。同一個時間點產生的結果完全相同（不用亂數）。
 */
import { LINE_COLORS } from './tdx';
import type { Arrival, LngLat, Station, TrafficSnapshot, TransitLine, Vehicle } from './types';

interface DemoLine {
  id: string;
  name: string;
  /** 班距（秒） */
  headway: number;
  stations: [string, number, number][];
}

/** 高雄捷運紅線、橘線（車站座標為約略值） */
const DEMO_LINES: DemoLine[] = [
  {
    id: 'R',
    name: '紅線',
    headway: 360,
    stations: [
      ['小港', 120.3539, 22.5648],
      ['高雄國際機場', 120.3415, 22.5701],
      ['草衙', 120.3285, 22.5811],
      ['前鎮高中', 120.3218, 22.5886],
      ['凱旋', 120.3176, 22.5967],
      ['獅甲', 120.3077, 22.6047],
      ['三多商圈', 120.3048, 22.6141],
      ['中央公園', 120.3013, 22.6243],
      ['美麗島', 120.3020, 22.6316],
      ['高雄車站', 120.3023, 22.6394],
      ['後驛', 120.3036, 22.6490],
      ['凹子底', 120.3034, 22.6567],
      ['巨蛋', 120.3027, 22.6665],
      ['生態園區', 120.3070, 22.6763],
      ['左營', 120.3076, 22.6874],
      ['世運', 120.3013, 22.7024],
      ['油廠國小', 120.3065, 22.7178],
      ['楠梓科技園區', 120.3150, 22.7253],
      ['後勁', 120.3195, 22.7327],
      ['都會公園', 120.3172, 22.7410],
      ['青埔', 120.3135, 22.7533],
      ['橋頭糖廠', 120.3058, 22.7573],
      ['橋頭火車站', 120.3093, 22.7618],
      ['南岡山', 120.2970, 22.7930],
    ],
  },
  {
    id: 'O',
    name: '橘線',
    headway: 480,
    stations: [
      ['西子灣', 120.2737, 22.6213],
      ['鹽埕埔', 120.2836, 22.6236],
      ['市議會', 120.2949, 22.6297],
      ['美麗島', 120.3020, 22.6316],
      ['信義國小', 120.3105, 22.6305],
      ['文化中心', 120.3173, 22.6303],
      ['五塊厝', 120.3274, 22.6292],
      ['技擊館', 120.3349, 22.6264],
      ['衛武營', 120.3405, 22.6253],
      ['鳳山西站', 120.3489, 22.6252],
      ['鳳山', 120.3570, 22.6273],
      ['大東', 120.3628, 22.6248],
      ['鳳山國中', 120.3710, 22.6229],
      ['大寮', 120.3896, 22.6215],
    ],
  },
];

/** 平均行駛速度（公里／小時）與每站停靠秒數 */
const SPEED_KMH = 38;
const DWELL_S = 30;

export const DEMO_ATTRIBUTION = '示範資料（非即時，車站位置約略）';

function km(a: LngLat, b: LngLat): number {
  const dx = (b[0] - a[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dy = (b[1] - a[1]) * 110.574;
  return Math.hypot(dx, dy);
}

interface Timed {
  /** 抵達每站的時間（從起站發車起算，秒） */
  arrive: number[];
  coords: LngLat[];
  names: string[];
  total: number;
}

function timetable(line: DemoLine, reverse: boolean): Timed {
  const st = reverse ? [...line.stations].reverse() : line.stations;
  const coords = st.map(([, lng, lat]) => [lng, lat] as LngLat);
  const arrive = [0];
  for (let i = 1; i < coords.length; i++) {
    const run = (km(coords[i - 1], coords[i]) / SPEED_KMH) * 3600;
    arrive.push(arrive[i - 1] + DWELL_S + run);
  }
  return { arrive, coords, names: st.map(([n]) => n), total: arrive[arrive.length - 1] };
}

/** 發車後 age 秒的位置（在站上停靠時就在車站） */
function locate(t: Timed, age: number): { at: LngLat; bearing: number; next: string; atStation: boolean } {
  const { arrive, coords, names } = t;
  for (let i = 1; i < coords.length; i++) {
    const depart = arrive[i - 1] + DWELL_S;
    if (age < arrive[i - 1] + DWELL_S && age >= arrive[i - 1]) {
      return { at: coords[i - 1], bearing: bearing(coords[i - 1], coords[i]), next: names[i - 1], atStation: true };
    }
    if (age < arrive[i]) {
      const f = (age - depart) / (arrive[i] - depart);
      const [a, b] = [coords[i - 1], coords[i]];
      return { at: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], bearing: bearing(a, b), next: names[i], atStation: false };
    }
  }
  const n = coords.length - 1;
  return { at: coords[n], bearing: bearing(coords[n - 1], coords[n]), next: names[n], atStation: true };
}

function bearing(a: LngLat, b: LngLat): number {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = b[1] - a[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** 某個時間點（毫秒）的示範交通資料 */
export function demoSnapshot(nowMs: number): TrafficSnapshot {
  const t = nowMs / 1000;
  const vehicles: Vehicle[] = [];
  const lines: TransitLine[] = [];
  const stations = new Map<string, Station>();

  for (const line of DEMO_LINES) {
    const color = LINE_COLORS[line.id];
    lines.push({
      id: `metro:${line.id}`,
      mode: 'metro',
      name: line.name,
      color,
      path: [line.stations.map(([, lng, lat]) => [lng, lat] as LngLat)],
    });
    for (const reverse of [false, true]) {
      const tt = timetable(line, reverse);
      const toward = tt.names[tt.names.length - 1];
      // 最近一班的發車時間在 t − (t mod 班距)；往前推到還在路上的每一班
      const newest = t % line.headway;
      for (let age = newest, k = 0; age < tt.total; age += line.headway, k++) {
        const p = locate(tt, age);
        const trip = Math.floor((t - age) / line.headway);
        vehicles.push({
          id: `demo:${line.id}:${reverse ? 'b' : 'a'}:${trip}`,
          mode: 'metro',
          line: line.name,
          label: `往${toward}`,
          at: p.at,
          bearing: p.bearing,
          status: p.atStation ? `停靠${p.next}` : `下一站 ${p.next}`,
          color,
        });
      }
      // 每站往這個方向的下一班
      tt.names.forEach((name, i) => {
        if (i === tt.names.length - 1) return;
        const wait = (((tt.arrive[i] - t) % line.headway) + line.headway) % line.headway;
        const id = `metro:${name}`;
        const s = stations.get(id) ?? { id, mode: 'metro' as const, name, at: tt.coords[i], arrivals: [] as Arrival[] };
        s.arrivals!.push({ line: line.name, toward, minutes: Math.floor(wait / 60) });
        stations.set(id, s);
      });
    }
  }
  for (const s of stations.values()) s.arrivals!.sort((a, b) => a.minutes - b.minutes);

  const updatedAt = new Date(nowMs).toISOString();
  return {
    updatedAt,
    source: 'demo',
    vehicles,
    stations: [...stations.values()],
    lines,
    roads: [],
    feeds: [{ id: 'demo', name: '示範資料', enabled: true, ok: true, lastOk: updatedAt, count: vehicles.length }],
    attribution: DEMO_ATTRIBUTION,
  };
}
