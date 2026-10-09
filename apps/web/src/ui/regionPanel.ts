import { accessOf } from '@twsim/sim-core';
import type { Game } from '../game';
import type { MapView } from '../map/MapView';
import { byId, el, fmtDays, fmtInt, fmtPct } from './format';

/**
 * 右側的行政區面板：觀景模式只顯示面積、人口；指揮模式顯示災情與可執行的行動。
 * i 為 null 時收起。
 */
export function renderRegionPanel(game: Game, map: MapView, i: number | null, scene: boolean) {
  const panel = byId('right');
  if (i === null) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const { sim } = game;
  const r = sim.world.regions[i];
  if (scene) {
    // 觀景模式只顯示基本資料
    byId('region').replaceChildren(
      el('div', { class: 'region-head' }, el('h3', {}, r.name), el('button', { class: 'close', title: '關閉' }, '×')),
      el(
        'dl',
        {},
        el('dt', {}, '面積'),
        el('dd', {}, `${r.areaKm2.toLocaleString('zh-TW')} km²`),
        el('dt', {}, '人口（約）'),
        el('dd', {}, fmtInt(r.population)),
        el('dt', {}, '人口密度'),
        el('dd', {}, `${fmtInt(r.population / Math.max(r.areaKm2, 0.01))} 人/km²`),
      ),
    );
    byId('region').querySelector('.close')!.addEventListener('click', () => map.select(null));
    return;
  }
  const v = (k: string) => sim.state.vars[k][i];
  const costs = game.rules.config.costs;
  const ended = !!sim.state.ended;
  const pendingHere = game.pending.filter((a) => 'region' in a && a.region === i).length;

  const action = (label: string, cost: number, fn: () => void, disabled = false) => {
    const b = el('button', { class: 'act' }, `${label}`, el('small', {}, `${cost} 點`));
    if (disabled || ended || game.projectedCp() < cost) b.setAttribute('disabled', '');
    b.addEventListener('click', fn);
    return b;
  };

  const roads = sim.ctx.adj.incident[i].map((e) => {
    const other = sim.world.regions[sim.ctx.adj.other(e, i)];
    const s = sim.state.edgeStatus[e];
    const repairing = !!sim.state.scalars[`repairing:${e}`];
    const btn = action('搶修', costs.repairRoad, () => game.queue({ type: 'repairRoad', edge: e }), s >= 0.999 || repairing);
    return el(
      'li',
      {},
      el('span', {}, `往${other.name}`),
      el('span', { class: s < 0.5 ? 'bad' : '' }, repairing ? '搶修中' : fmtPct(s)),
      btn,
    );
  });

  const shelterState = v('shelter') >= 1 ? '已開設' : v('shelter') > 0 ? '籌備中' : '未開設';
  byId('region').replaceChildren(
    el('div', { class: 'region-head' }, el('h3', {}, r.name), el('button', { class: 'close', title: '關閉' }, '×')),
    el('div', { class: 'quiet' }, `人口約 ${fmtInt(r.population)}・震度約 ${v('intensity').toFixed(1)} 級・對外通達 ${fmtPct(accessOf(sim.ctx, i))}`),
    el(
      'dl',
      {},
      el('dt', {}, '受困'),
      el('dd', {}, fmtInt(v('trapped'))),
      el('dt', {}, '待收治傷患'),
      el('dd', {}, fmtInt(v('injured'))),
      el('dt', {}, '空床'),
      el('dd', {}, fmtInt(v('bedsFree'))),
      el('dt', {}, '物資'),
      el('dd', {}, fmtDays(v('supplies'))),
      el('dt', {}, '秩序'),
      el('dd', {}, fmtPct(v('order'))),
      el('dt', {}, '謠言'),
      el('dd', {}, fmtPct(v('rumor'))),
      el('dt', {}, '搜救隊'),
      el('dd', {}, `${v('teams')} 隊${v('teamsEnroute') ? `（${v('teamsEnroute')} 隊在途）` : ''}`),
      el('dt', {}, '避難所'),
      el('dd', {}, shelterState),
    ),
    el(
      'div',
      { class: 'actions' },
      action('派遣搜救隊', costs.dispatchRescue, () => game.queue({ type: 'dispatchRescue', region: i }), sim.state.scalars.teamsFree < 1),
      action('撤回搜救隊', costs.recallRescue, () => game.queue({ type: 'recallRescue', region: i }), v('teams') < 1),
      action('開設避難所', costs.openShelter, () => game.queue({ type: 'openShelter', region: i }), v('shelter') > 0),
      action('調撥物資', costs.sendSupplies, () => game.queue({ type: 'sendSupplies', region: i })),
    ),
    pendingHere ? el('div', { class: 'quiet' }, `已排入下一小時：${pendingHere} 項行動`) : '',
    el('h4', {}, '對外道路'),
    el('ul', { class: 'roads' }, ...roads),
  );
  byId('region').querySelector('.close')!.addEventListener('click', () => map.select(null));
}
