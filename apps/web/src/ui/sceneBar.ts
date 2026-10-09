import { DEFAULT_TIME, TIMES, type TimeKey } from '../map/config';
import type { MapView } from '../map/MapView';
import { byId } from './format';
import { shareScreenshot } from './screenshot';

/**
 * 觀景模式工具列：時段、地標導覽、重設視角、截圖。
 * （山體陰影、3D 建築的勾選框兩個模式共用，在 Hud 處理）
 */
export class SceneBar {
  constructor(private map: MapView) {
    byId('reset-view').addEventListener('click', () => map.resetView());
    byId('tour').addEventListener('click', () => (map.isTouring ? map.stopTour() : this.startTour()));
    map.onTourStop(() => this.showTourStep(null));
    byId('screenshot').addEventListener('click', () => this.screenshot());
    this.setupTimePicker();
  }

  /** 時段選單：自動（依台灣現在時間，每 10 分鐘檢查一次）或固定時段 */
  private setupTimePicker() {
    const select = byId<HTMLSelectElement>('time');
    select.append(new Option('自動', 'auto'));
    for (const [key, t] of Object.entries(TIMES)) select.append(new Option(t.label, key));
    select.value = DEFAULT_TIME;
    const apply = () => this.map.setTimeOfDay(select.value === 'auto' ? timeNow() : (select.value as TimeKey));
    select.addEventListener('change', apply);
    setInterval(() => select.value === 'auto' && apply(), 10 * 60 * 1000);
    apply();
  }

  private async screenshot() {
    const button = byId<HTMLButtonElement>('screenshot');
    button.disabled = true;
    try {
      const time = byId<HTMLSelectElement>('time');
      const caption = byId('tour-caption');
      const subtitle = !caption.hidden && caption.textContent ? caption.textContent : time.selectedOptions[0]?.text ?? '';
      await shareScreenshot(await this.map.capture(), subtitle);
    } finally {
      button.disabled = false;
    }
  }

  private startTour() {
    this.map.select(null, false);
    void this.map.startTour((name) => this.showTourStep(name));
  }

  /** 導覽中：按鈕變成「停止」，畫面下方顯示地標名稱 */
  private showTourStep(name: string | null) {
    byId('tour').textContent = name ? '停止導覽 ■' : '地標導覽 ▶';
    const caption = byId('tour-caption');
    caption.hidden = !name;
    caption.textContent = name ?? '';
  }
}

/** 台灣現在的時段（UTC+8，不受使用者電腦時區影響） */
export function timeNow(): TimeKey {
  let hour = (new Date().getUTCHours() + 8) % 24;
  if (hour < 5) hour += 24; // 夜晚跨午夜：19–29 點
  const hit = (Object.keys(TIMES) as TimeKey[]).find((k) => hour >= TIMES[k].hours[0] && hour < TIMES[k].hours[1]);
  return hit ?? 'day';
}
