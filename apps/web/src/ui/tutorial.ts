import { el } from './format';

/**
 * 第一次進指揮模式的教學（ROADMAP 3.4）：一步步框出畫面上的區塊並說明。
 * 看完或略過後記在瀏覽器裡，下次不再自動出現；指揮面板的「教學」可以重看。
 */

const DONE_KEY = 'twsim.tutorial.done';

const STEPS: { target: string; title: string; text: string }[] = [
  {
    target: '#metrics',
    title: '全市狀況',
    text: '上方是全市的數字：受困人口、醫療餘裕、道路通行、物資存量、社會秩序。變成紅色就代表要注意了。',
  },
  {
    target: '#left section',
    title: '指揮點數與搜救隊',
    text: '每個行動都要花指揮點數，點數每小時只回復 2 點，永遠不夠用。怎麼取捨，就是這個遊戲的玩法。這裡也可以換難度：輕度、標準、嚴重。',
  },
  {
    target: '#map',
    title: '點選行政區',
    text: '點地圖上的任一區，右邊會出現該區的災情與行動：派遣搜救隊、開設避難所、調撥物資、搶修道路。行動會在下一個小時開始時執行。',
  },
  {
    target: '#play',
    title: '讓時間前進',
    text: '按「開始」或空白鍵讓時間走，旁邊可切換 1×、2×、4× 速度。想清楚再下指令也沒關係，隨時可以暫停。',
  },
  {
    target: '#layers',
    title: '災情圖層',
    text: '切換圖層，看哪一區受困最多、醫療最吃緊、物資最缺。',
  },
  {
    target: '.clock',
    title: '72 小時後結算',
    text: '救出越多人、死亡越少、秩序越好，評級越高。結算時會列出你的每一個決策。祝順利！',
  },
];

export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function markDone() {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    // 無痕模式等情況存不了，下次會再出現一次，沒關係
  }
}

/** 開始教學；結束（看完或略過）時呼叫 onClose */
export function startTutorial(onClose: () => void = () => {}) {
  document.getElementById('tutorial')?.remove();
  const spot = el('div', { class: 'tut-spot' });
  const card = el('div', { class: 'tut-card', role: 'dialog', 'aria-live': 'polite' });
  const root = el('div', { id: 'tutorial' }, spot, card);
  document.body.append(root);
  let k = 0;

  const close = () => {
    root.remove();
    window.removeEventListener('resize', place);
    markDone();
    onClose();
  };

  function place() {
    const step = STEPS[k];
    const target = document.querySelector(step.target);
    const r = target?.getBoundingClientRect();
    // 地圖本身太大，框住畫面中央一塊就好
    const box =
      !r || step.target === '#map'
        ? { left: innerWidth * 0.35, top: innerHeight * 0.3, width: innerWidth * 0.3, height: innerHeight * 0.35 }
        : { left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 };
    Object.assign(spot.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    // 說明卡放在框的下方；下方放不下就放上方
    const below = box.top + box.height + 12;
    const cardH = card.offsetHeight || 160;
    const top = below + cardH < innerHeight - 12 ? below : Math.max(12, box.top - cardH - 12);
    const left = Math.min(Math.max(12, box.left), innerWidth - Math.min(360, innerWidth - 24) - 12);
    Object.assign(card.style, { top: `${top}px`, left: `${left}px` });
  }

  const show = () => {
    const step = STEPS[k];
    const back = el('button', {}, '上一步');
    const next = el('button', { class: 'primary' }, k === STEPS.length - 1 ? '開始指揮' : '下一步');
    const skip = el('button', { class: 'link' }, '略過教學');
    if (k === 0) back.setAttribute('disabled', '');
    back.addEventListener('click', () => {
      k--;
      show();
    });
    next.addEventListener('click', () => {
      if (k === STEPS.length - 1) close();
      else {
        k++;
        show();
      }
    });
    skip.addEventListener('click', close);
    card.replaceChildren(
      el('div', { class: 'tut-step' }, `${k + 1} / ${STEPS.length}`),
      el('h3', {}, step.title),
      el('p', {}, step.text),
      el('div', { class: 'tut-actions' }, skip, back, next),
    );
    place();
    next.focus();
  };

  window.addEventListener('resize', place);
  show();
}
