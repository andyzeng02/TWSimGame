import { DIFFICULTIES, type EqAction } from '@twsim/rules-game';
import type { World } from '@twsim/sim-core';
import type { Game, TickRecord } from '../game';
import { feedbackUrl } from './feedback';
import { byId, el, fmtInt, fmtPct } from './format';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 結算畫面：評級、分數、主要數字、受困人口變化與「你的決策」（ROADMAP 3.4） */
export function renderEndCard(game: Game) {
  const box = byId('end');
  const end = game.sim.state.ended;
  if (!end) {
    box.hidden = true;
    return;
  }
  if (!box.hidden && box.dataset.seed === String(game.seedValue)) return; // 已經畫好，不重畫（保留捲動位置）
  box.hidden = false;
  box.dataset.seed = String(game.seedValue);
  const d = end.details;
  const again = el('button', { class: 'wide' }, '再玩一局');
  again.addEventListener('click', () => game.restart());
  box.replaceChildren(
    el(
      'div',
      { class: 'card end-card' },
      el('div', { class: `grade g-${end.grade}` }, end.grade),
      el('h2', {}, end.reason),
      el('p', {}, `分數 ${end.score.toFixed(1)}・難度「${DIFFICULTIES[game.difficulty].label}」`),
      el(
        'dl',
        {},
        el('dt', {}, '受威脅人數'),
        el('dd', {}, fmtInt(d.atRisk)),
        el('dt', {}, '死亡'),
        el('dd', {}, fmtInt(d.deaths)),
        el('dt', {}, '仍受困'),
        el('dd', {}, fmtInt(d.stillTrapped)),
        el('dt', {}, '已收治'),
        el('dd', {}, fmtInt(d.treated)),
        el('dt', {}, '最終秩序'),
        el('dd', {}, fmtPct(d.order)),
      ),
      el('h3', {}, '72 小時的變化'),
      chart(game.history),
      el('div', { class: 'legend quiet' }, el('i', { class: 'swatch trapped' }), '受困人口　', el('i', { class: 'swatch deaths' }), '累計死亡'),
      el('h3', {}, '你的決策'),
      decisions(game.history, game.sim.world),
      el('p', { class: 'quiet' }, `種子 ${game.seedValue}（相同種子與難度會重現同一場地震）`),
      again,
      el(
        'a',
        {
          class: 'feedback-link',
          href: feedbackUrl({ 種子: String(game.seedValue), 難度: DIFFICULTIES[game.difficulty].label, 評級: end.grade, 分數: end.score.toFixed(1) }),
          target: '_blank',
          rel: 'noopener',
        },
        '回饋這一局',
      ),
    ),
  );
}

/** 受困人口與累計死亡的折線圖（各自依最大值縮放） */
function chart(history: TickRecord[]) {
  const W = 320;
  const H = 90;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'end-chart');
  const maxTick = Math.max(1, history[history.length - 1]?.tick ?? 1);
  const line = (key: string, cls: string) => {
    const max = Math.max(1, ...history.map((h) => h.metrics[key] ?? 0));
    const pts = history.map((h) => `${((h.tick / maxTick) * W).toFixed(1)},${(H - 4 - ((h.metrics[key] ?? 0) / max) * (H - 10)).toFixed(1)}`);
    const pl = document.createElementNS(SVG_NS, 'polyline');
    pl.setAttribute('points', pts.join(' '));
    pl.setAttribute('class', cls);
    svg.append(pl);
  };
  // 每 24 小時一條格線
  for (let t = 24; t < maxTick; t += 24) {
    const g = document.createElementNS(SVG_NS, 'line');
    const x = String((t / maxTick) * W);
    g.setAttribute('x1', x);
    g.setAttribute('x2', x);
    g.setAttribute('y1', '0');
    g.setAttribute('y2', String(H));
    g.setAttribute('class', 'grid');
    svg.append(g);
  }
  line('trapped', 'trapped');
  line('deaths', 'deaths');
  return svg;
}

/** 依時間列出實際執行的行動；同一小時的同類行動合併 */
function decisions(history: TickRecord[], world: World) {
  const items = history.flatMap((h) => h.actions.map((a) => ({ tick: h.tick, text: describe(a, world) })));
  if (!items.length) return el('p', { class: 'quiet' }, '這一局沒有下任何指令。');
  return el(
    'ol',
    { class: 'decisions' },
    ...items.map((x) => el('li', {}, el('span', { class: 't' }, `${x.tick}h`), x.text)),
  );
}

export function describe(a: EqAction, world: World): string {
  const name = (i: number) => world.regions[i]?.name ?? `第 ${i} 區`;
  switch (a.type) {
    case 'dispatchRescue':
      return `派遣搜救隊到${name(a.region)}`;
    case 'recallRescue':
      return `從${name(a.region)}撤回搜救隊`;
    case 'openShelter':
      return `在${name(a.region)}開設避難所`;
    case 'sendSupplies':
      return `調撥物資到${name(a.region)}`;
    case 'repairRoad': {
      const e = world.edges[a.edge];
      return e ? `搶修${name(e.from)}—${name(e.to)}道路` : '搶修道路';
    }
    case 'announce':
      return '發布闢謠公告';
  }
}
