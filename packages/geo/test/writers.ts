/** 測試用：產生最小的 .shp / .dbf 位元組 */
import type { XY } from '../src/index';

export function writeShp(shapeType: 3 | 5, records: XY[][][]): Uint8Array {
  const contents = records.map((parts) => {
    const pts = parts.flatMap((p) => (shapeType === 5 ? [...p, p[0]] : p)); // 多邊形要封閉
    const size = 44 + parts.length * 4 + pts.length * 16;
    const b = new DataView(new ArrayBuffer(size));
    b.setInt32(0, shapeType, true);
    b.setInt32(36, parts.length, true);
    b.setInt32(40, pts.length, true);
    let start = 0;
    parts.forEach((p, i) => {
      b.setInt32(44 + i * 4, start, true);
      start += shapeType === 5 ? p.length + 1 : p.length;
    });
    pts.forEach(([x, y], i) => {
      b.setFloat64(44 + parts.length * 4 + i * 16, x, true);
      b.setFloat64(44 + parts.length * 4 + i * 16 + 8, y, true);
    });
    return new Uint8Array(b.buffer);
  });
  const total = 100 + contents.reduce((s, c) => s + 8 + c.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setInt32(0, 9994, false);
  dv.setInt32(24, total / 2, false);
  dv.setInt32(28, 1000, true);
  dv.setInt32(32, shapeType, true);
  let off = 100;
  contents.forEach((c, i) => {
    dv.setInt32(off, i + 1, false);
    dv.setInt32(off + 4, c.length / 2, false);
    out.set(c, off + 8);
    off += 8 + c.length;
  });
  return out;
}

// Big5 編碼表（只含測試用到的字）
const BIG5: Record<string, number[]> = {
  高: [0xb0, 0xaa],
  雄: [0xb6, 0xaf],
  市: [0xa5, 0xab],
  三: [0xa4, 0x54],
  民: [0xa5, 0xc1],
  區: [0xb0, 0xcf],
  臺: [0xbb, 0x4f],
  南: [0xab, 0x6e],
  東: [0xaa, 0x46],
  苓: [0xad, 0x64],
  雅: [0xb6, 0xae],
  旗: [0xba, 0x58],
  津: [0xac, 0x7a],
};

function encode(text: string, enc: 'utf-8' | 'big5'): number[] {
  if (enc === 'utf-8') return Array.from(new TextEncoder().encode(text));
  return [...text].flatMap((ch) => BIG5[ch] ?? [ch.charCodeAt(0)]);
}

export function writeDbf(rows: Record<string, string | number>[], enc: 'utf-8' | 'big5'): Uint8Array {
  const names = Object.keys(rows[0]);
  const fields = names.map((n) => ({
    name: n,
    type: typeof rows[0][n] === 'number' ? 'N' : 'C',
    length: typeof rows[0][n] === 'number' ? 12 : 30,
  }));
  const headerLength = 32 + fields.length * 32 + 1;
  const recordLength = 1 + fields.reduce((s, f) => s + f.length, 0);
  const out = new Uint8Array(headerLength + rows.length * recordLength + 1).fill(0x20);
  const dv = new DataView(out.buffer);
  out.fill(0, 0, headerLength);
  out[0] = 3;
  dv.setUint32(4, rows.length, true);
  dv.setUint16(8, headerLength, true);
  dv.setUint16(10, recordLength, true);
  fields.forEach((f, i) => {
    const o = 32 + i * 32;
    out.set(new TextEncoder().encode(f.name), o);
    out[o + 11] = f.type.charCodeAt(0);
    out[o + 16] = f.length;
  });
  out[headerLength - 1] = 0x0d;
  rows.forEach((row, r) => {
    let p = headerLength + r * recordLength + 1;
    for (const f of fields) {
      const v = row[f.name];
      const bytes = f.type === 'N' ? encode(String(v).padStart(f.length), 'utf-8') : encode(String(v), enc);
      out.set(bytes.slice(0, f.length), p);
      p += f.length;
    }
  });
  out[out.length - 1] = 0x1a;
  return out;
}
