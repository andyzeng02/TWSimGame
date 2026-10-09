/**
 * 最小的 Shapefile（.shp）與 dBASE（.dbf）讀取器。
 * 支援：Polygon（5/15/25）、PolyLine（3/13/23）、Point（1/11/21）。Z/M 值忽略。
 * 只依賴 DataView 與 TextDecoder，瀏覽器與 Node 都能用。
 */

export type XY = [number, number];

export interface ShpRecord {
  /** 0 = 空、1 = 點、3 = 線、5 = 多邊形（Z/M 版本已歸一） */
  type: 0 | 1 | 3 | 5;
  /** 每個 part 一串座標；點為單一 part 單一點 */
  parts: XY[][];
}

export interface ShpFile {
  shapeType: number;
  bbox: [number, number, number, number];
  records: ShpRecord[];
}

const baseType = (t: number): 0 | 1 | 3 | 5 => {
  const b = t % 10;
  if (t === 0) return 0;
  if (b === 1) return 1;
  if (b === 3) return 3;
  if (b === 5) return 5;
  throw new Error(`不支援的 Shapefile 幾何型別：${t}`);
};

export function readShp(buf: ArrayBuffer | Uint8Array): ShpFile {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getInt32(0, false) !== 9994) throw new Error('不是 Shapefile（檔頭代碼不是 9994）');
  const fileBytes = dv.getInt32(24, false) * 2;
  const shapeType = dv.getInt32(32, true);
  const bbox: [number, number, number, number] = [
    dv.getFloat64(36, true),
    dv.getFloat64(44, true),
    dv.getFloat64(52, true),
    dv.getFloat64(60, true),
  ];
  const end = Math.min(fileBytes, bytes.byteLength);
  const records: ShpRecord[] = [];
  let off = 100;
  while (off + 8 <= end) {
    const contentBytes = dv.getInt32(off + 4, false) * 2;
    const c = off + 8;
    const t = dv.getInt32(c, true);
    const type = baseType(t);
    if (type === 0) {
      records.push({ type: 0, parts: [] });
    } else if (type === 1) {
      records.push({ type: 1, parts: [[[dv.getFloat64(c + 4, true), dv.getFloat64(c + 12, true)]]] });
    } else {
      const numParts = dv.getInt32(c + 36, true);
      const numPoints = dv.getInt32(c + 40, true);
      const starts: number[] = [];
      for (let i = 0; i < numParts; i++) starts.push(dv.getInt32(c + 44 + i * 4, true));
      const p0 = c + 44 + numParts * 4;
      const parts: XY[][] = [];
      for (let i = 0; i < numParts; i++) {
        const s = starts[i];
        const e = i + 1 < numParts ? starts[i + 1] : numPoints;
        const pts: XY[] = [];
        for (let k = s; k < e; k++) pts.push([dv.getFloat64(p0 + k * 16, true), dv.getFloat64(p0 + k * 16 + 8, true)]);
        parts.push(pts);
      }
      records.push({ type, parts });
    }
    off = c + contentBytes;
  }
  return { shapeType, bbox, records };
}

export interface DbfField {
  name: string;
  type: string;
  length: number;
  decimals: number;
}

export interface DbfFile {
  fields: DbfField[];
  rows: Record<string, string | number | null>[];
}

/** 由 .cpg 內容決定編碼；沒有 .cpg 時先試 UTF-8，失敗再用 Big5 */
export function pickEncoding(cpg: string | undefined, sample: Uint8Array): string {
  const c = (cpg ?? '').trim().toLowerCase();
  if (c.includes('utf')) return 'utf-8';
  if (c.includes('big5') || c.includes('950')) return 'big5';
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return 'utf-8';
  } catch {
    return 'big5';
  }
}

export function readDbf(buf: ArrayBuffer | Uint8Array, cpg?: string): DbfFile {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numRecords = dv.getUint32(4, true);
  const headerLength = dv.getUint16(8, true);
  const recordLength = dv.getUint16(10, true);
  const encoding = pickEncoding(cpg, bytes.subarray(headerLength, Math.min(bytes.length, headerLength + recordLength * 200)));
  const dec = new TextDecoder(encoding);

  const fields: DbfField[] = [];
  for (let off = 32; off + 32 <= headerLength && bytes[off] !== 0x0d; off += 32) {
    const raw = bytes.subarray(off, off + 11);
    const zero = raw.indexOf(0);
    fields.push({
      name: dec.decode(zero >= 0 ? raw.subarray(0, zero) : raw).trim(),
      type: String.fromCharCode(bytes[off + 11]),
      length: bytes[off + 16],
      decimals: bytes[off + 17],
    });
  }

  const rows: Record<string, string | number | null>[] = [];
  for (let r = 0; r < numRecords; r++) {
    const start = headerLength + r * recordLength;
    if (start + recordLength > bytes.length) break;
    let p = start + 1; // 第 1 byte 是刪除旗標
    const row: Record<string, string | number | null> = {};
    for (const f of fields) {
      const text = dec.decode(bytes.subarray(p, p + f.length)).replace(/\0/g, '').trim();
      p += f.length;
      if (f.type === 'N' || f.type === 'F') row[f.name] = text === '' ? null : Number(text);
      else row[f.name] = text;
    }
    if (bytes[start] !== 0x2a) rows.push(row); // 0x2A = 已刪除
  }
  return { fields, rows };
}

/** 判斷座標是否為經緯度（否則多半是 TWD97 TM2 公尺座標） */
export function looksLikeLonLat(bbox: [number, number, number, number]): boolean {
  return Math.abs(bbox[0]) <= 180 && Math.abs(bbox[2]) <= 180 && Math.abs(bbox[1]) <= 90 && Math.abs(bbox[3]) <= 90;
}
