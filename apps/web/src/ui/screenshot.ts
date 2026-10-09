/**
 * 一鍵截圖分享（ROADMAP 1.6）：把地圖畫面加上標題列與資料來源，
 * 手機上能分享就直接開分享選單，否則下載成 PNG。
 */

const CREDIT = '地圖資料 © OpenStreetMap 貢獻者｜底圖 OpenFreeMap｜高程 Mapzen Terrain Tiles（AWS Open Data）';

export async function shareScreenshot(map: HTMLCanvasElement, subtitle: string) {
  const out = compose(map, subtitle);
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
  if (!blob) throw new Error('截圖失敗');
  const name = `kaohsiung-3d-${stamp()}.png`;
  const file = new File([blob], name, { type: 'image/png' });

  // 手機（支援檔案分享的瀏覽器）：開系統分享選單
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '高雄 3D 地景' });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // 使用者取消
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function compose(map: HTMLCanvasElement, subtitle: string) {
  const { width, height } = map;
  const unit = Math.max(1, Math.round(width / 1280));
  const band = 56 * unit;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height + band;
  const g = out.getContext('2d')!;
  g.drawImage(map, 0, 0);

  g.fillStyle = '#f6f2ea';
  g.fillRect(0, height, width, band);
  g.fillStyle = '#d6cfc1';
  g.fillRect(0, height, width, unit);

  const font = "'Noto Sans TC', 'Microsoft JhengHei', 'PingFang TC', sans-serif";
  g.textBaseline = 'middle';
  g.fillStyle = '#2a2723';
  g.font = `700 ${20 * unit}px ${font}`;
  const title = '高雄 3D 地景';
  g.fillText(title, 18 * unit, height + band / 2);
  const titleW = g.measureText(title).width;
  g.fillStyle = '#6e675d';
  g.font = `${14 * unit}px ${font}`;
  g.fillText(`台灣微縮模擬｜${subtitle}`, 18 * unit + titleW + 12 * unit, height + band / 2);

  g.textAlign = 'right';
  g.font = `${11 * unit}px ${font}`;
  g.fillText(CREDIT, width - 18 * unit, height + band / 2);
  return out;
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
