import type { World } from '@twsim/sim-core';
import { MAP_SOURCES } from '../map/config';
import { feedbackUrl } from './feedback';
import { byId, el } from './format';

const REPO_URL = 'https://github.com/andyzeng02/TWSimGame';

/**
 * 「關於」頁（ROADMAP 4.3、2.4）：這是什麼、免責聲明、資料來源與授權。
 * 資料來源一部分來自世界檔的 meta.sources（資料管線寫入），一部分是地圖用的線上服務。
 */
export function setupAbout(world: World) {
  const dialog = byId<HTMLDialogElement>('about');
  const link = (url: string, text: string) => el('a', { href: url, target: '_blank', rel: 'noopener' }, text);

  const rows = [
    ...(world.meta.sources ?? []).map((s) =>
      el(
        'tr',
        s.draft ? { class: 'draft' } : {},
        el('td', {}, s.role),
        el('td', {}, s.url ? link(s.url, s.name) : s.name, s.draft ? el('span', { class: 'tag' }, '暫用') : ''),
        el('td', {}, s.publisher),
        el('td', {}, [s.version, s.file].filter(Boolean).join('｜') || '—'),
        el('td', {}, s.license),
      ),
    ),
    ...MAP_SOURCES.map((s) =>
      el('tr', {}, el('td', {}, s.role), el('td', {}, link(s.url, s.name)), el('td', {}, '—'), el('td', {}, '線上'), el('td', {}, s.license)),
    ),
  ];

  dialog.replaceChildren(
    el(
      'form',
      { method: 'dialog' },
      el('button', { class: 'close', 'aria-label': '關閉' }, '✕'),
      el('h2', {}, '關於「高雄 3D 地景｜台灣微縮模擬」'),
      el(
        'p',
        {},
        '以真實地形與 OpenStreetMap 地景呈現的 3D 高雄，加上災害應變劇本「地震 72 小時」：大地震之後，在 72 個遊戲小時內調度搜救、醫療、物資與道路搶修。',
      ),
      el(
        'p',
        { class: 'disclaimer' },
        '本遊戲為虛構情境，非地震預測；數值為遊戲調校用，不代表真實災情。實際防災資訊請以中央氣象署、內政部消防署與高雄市政府公告為準。',
      ),
      el('h3', {}, '資料來源與授權'),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          {},
          el('thead', {}, el('tr', {}, ...['用途', '資料', '提供單位', '版本／檔案', '授權'].map((h) => el('th', {}, h)))),
          el('tbody', {}, ...rows),
        ),
      ),
      el(
        'p',
        { class: 'quiet' },
        `世界檔產生日期：${world.meta.builtAt ?? '未記錄'}。標示「暫用」的項目是約略值，之後會換成政府開放資料。`,
      ),
      el('p', { class: 'quiet' }, '原始碼：', link(REPO_URL, REPO_URL)),
      el('p', {}, el('a', { class: 'button-link', href: feedbackUrl(), target: '_blank', rel: 'noopener' }, '意見回饋（GitHub）')),
    ),
  );

  for (const id of ['about', 'about-2']) {
    byId(`${id}-open`).addEventListener('click', () => dialog.showModal());
  }
  // 點對話框外面的暗處也能關閉
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}
