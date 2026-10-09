/**
 * TWD97 / TM2（EPSG:3826，台灣本島）與經緯度互轉。
 * GRS80 橢球、中央經線 121°、尺度 0.9999、東偏 250,000 m。
 * 公式：Snyder, Map Projections — A Working Manual (1987), §8。
 */

const a = 6378137;
const f = 1 / 298.257222101;
const k0 = 0.9999;
const lon0 = (121 * Math.PI) / 180;
const FE = 250000;
const FN = 0;

const e2 = f * (2 - f);
const e4 = e2 * e2;
const e6 = e4 * e2;
const ep2 = e2 / (1 - e2);
const M0c = 1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256;
const M2c = (3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024;
const M4c = (15 * e4) / 256 + (45 * e6) / 1024;
const M6c = (35 * e6) / 3072;

const meridianArc = (phi: number) =>
  a * (M0c * phi - M2c * Math.sin(2 * phi) + M4c * Math.sin(4 * phi) - M6c * Math.sin(6 * phi));

/** 經緯度（度）→ TM2（公尺） */
export function lonLatToTm2(lon: number, lat: number): [number, number] {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const N = a / Math.sqrt(1 - e2 * s * s);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * c * c;
  const A = (lam - lon0) * c;
  const M = meridianArc(phi);
  const x =
    FE + k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120);
  const y =
    FN +
    k0 *
      (M +
        N *
          Math.tan(phi) *
          ((A * A) / 2 +
            ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
            ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return [x, y];
}

/** TM2（公尺）→ 經緯度（度） */
export function tm2ToLonLat(x: number, y: number): [number, number] {
  const M = (y - FN) / k0;
  const mu = M / (a * M0c);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(phi1);
  const c = Math.cos(phi1);
  const C1 = ep2 * c * c;
  const T1 = Math.tan(phi1) ** 2;
  const N1 = a / Math.sqrt(1 - e2 * s * s);
  const R1 = (a * (1 - e2)) / (1 - e2 * s * s) ** 1.5;
  const D = (x - FE) / (N1 * k0);
  const phi =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lam =
    lon0 +
    (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) /
      c;
  return [(lam * 180) / Math.PI, (phi * 180) / Math.PI];
}
