import type { Game } from '../game';
import { byId, el, fmtInt, fmtPct } from './format';

/** 結算畫面：評級、分數、主要數字與「再玩一局」 */
export function renderEndCard(game: Game) {
  const box = byId('end');
  const end = game.sim.state.ended;
  if (!end) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const d = end.details;
  const again = el('button', { class: 'wide' }, '再玩一局');
  again.addEventListener('click', () => game.restart());
  box.replaceChildren(
    el(
      'div',
      { class: 'card' },
      el('div', { class: `grade g-${end.grade}` }, end.grade),
      el('h2', {}, end.reason),
      el('p', {}, `分數 ${end.score.toFixed(1)}`),
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
      el('p', { class: 'quiet' }, `種子 ${game.seedValue}（相同種子會重現同一場地震）`),
      again,
    ),
  );
}
