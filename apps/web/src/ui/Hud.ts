import { accessOf } from '@twsim/sim-core';
import type { Game } from '../game';
import type { MapView } from '../map/MapView';
import { byId, el, fmtDays, fmtInt, fmtPct } from './format';
import { LAYERS, type Layer } from './layers';

const METRICS: { key: string; label: string; fmt: (x: number) => string; bad: (x: number) => boolean }[] = [
  { key: 'trapped', label: '受困人口', fmt: fmtInt, bad: (x) => x > 50 },
  { key: 'medicalMargin', label: '醫療餘裕', fmt: fmtInt, bad: (x) => x < 0 },
  { key: 'roadAccess', label: '道路通行', fmt: fmtPct, bad: (x) => x < 0.6 },
  { key: 'supplies', label: '物資存量', fmt: fmtDays, bad: (x) => x < 0.4 },
  { key: 'order', label: '社會秩序', fmt: fmtPct, bad: (x) => x < 0.5 },
];

const LOG_ICON: Record<string, string> = {
  quake: '◆',
  aftershock: '◇',
  rescue: '▲',
  shelter: '⌂',
  road: '═',
  supplies: '■',
  announce: '✎',
  reject: '✕',
};

export class Hud {
  private layer: Layer = LAYERS[0];
  private selected: number | null = null;
  /** 觀景模式：只看地景；指揮模式：顯示遊戲介面 */
  private scene = true;

  constructor(private game: Game, private map: MapView) {
    this.buildLayerButtons();
    byId('play').addEventListener('click', () => (game.playing ? game.pause() : game.play()));
    byId('speed').addEventListener('click', () => game.setSpeed(game.speed >= 4 ? 1 : game.speed * 2));
    byId('announce').addEventListener('click', () => game.queue({ type: 'announce' }));
    for (const id of ['hillshade', 'hillshade-2']) {
      const box = byId<HTMLInputElement>(id);
      box.addEventListener('change', () => this.syncToggles('hillshade', box.checked));
    }
    for (const id of ['buildings', 'buildings-2']) {
      const box = byId<HTMLInputElement>(id);
      box.addEventListener('change', () => this.syncToggles('buildings', box.checked));
    }
    byId('to-command').addEventListener('click', () => this.setScene(false));
    byId('to-scene').addEventListener('click', () => this.setScene(true));
    byId('reset-view').addEventListener('click', () => map.resetView());
    map.onSelect((i) => {
      this.selected = i;
      this.renderRegion();
    });
    game.onChange(() => this.render());
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.scene) {
        e.preventDefault();
        game.playing ? game.pause() : game.play();
      }
      if (e.code === 'KeyH') this.setScene(!this.scene);
    });
    this.setScene(true);
  }

  private setScene(scene: boolean) {
    this.scene = scene;
    document.body.classList.toggle('scene', scene);
    this.map.setSceneMode(scene);
    if (scene) this.game.pause();
    this.render();
  }

  private syncToggles(kind: 'hillshade' | 'buildings', on: boolean) {
    byId<HTMLInputElement>(kind).checked = on;
    byId<HTMLInputElement>(`${kind}-2`).checked = on;
    if (kind === 'hillshade') this.map.setHillshade(on);
    else this.map.setBuildings(on);
  }

  render() {
    const { sim } = this.game;
    const snap = sim.snapshot();
    const m = snap.metrics;

    byId('metrics').replaceChildren(
      ...METRICS.map((d) =>
        el('div', { class: `metric${d.bad(m[d.key]) ? ' bad' : ''}` }, el('span', {}, d.label), el('strong', {}, d.fmt(m[d.key]))),
      ),
      el('div', { class: 'metric quiet' }, el('span', {}, '死亡'), el('strong', {}, fmtInt(m.deaths))),
    );

    const tick = snap.tick;
    byId('clock').textContent = `第 ${tick} 小時 / ${this.game.rules.maxTicks}`;
    byId('clockbar').style.width = `${(tick / this.game.rules.maxTicks) * 100}%`;
    byId('cp').textContent = `${this.game.projectedCp()} / ${this.game.rules.config.cpMax}`;
    byId('teams').textContent = String(m.teamsFree);
    byId('play').textContent = this.game.playing ? '❚❚ 暫停' : '▶ 開始';
    byId('speed').textContent = `${this.game.speed}×`;

    this.map.setSeverity(this.scene ? null : this.layer.severity(sim.world, snap));
    this.map.setRoadStatus(snap.edgeStatus);
    this.map.setTeams(snap.vars.teams);

    this.renderLog();
    this.renderRegion();
    this.renderEnd();
  }

  private buildLayerButtons() {
    const box = byId('layers');
    const draw = () =>
      box.replaceChildren(
        ...LAYERS.map((l) => {
          const b = el('button', { class: l === this.layer ? 'chip on' : 'chip' }, l.label);
          b.addEventListener('click', () => {
            this.layer = l;
            draw();
            this.render();
          });
          return b;
        }),
      );
    draw();
  }

  private renderLog() {
    const log = this.game.sim.state.log.slice(-40).reverse();
    byId('log').replaceChildren(
      ...log.map((l) =>
        el('li', { class: `log-${l.kind}` }, el('span', { class: 't' }, `${l.tick}h`), `${LOG_ICON[l.kind] ?? '·'} ${l.text}`),
      ),
    );
  }

  private renderRegion() {
    const panel = byId('right');
    const i = this.selected;
    if (i === null) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const { sim } = this.game;
    const r = sim.world.regions[i];
    if (this.scene) {
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
      byId('region').querySelector('.close')!.addEventListener('click', () => this.map.select(null));
      return;
    }
    const v = (k: string) => sim.state.vars[k][i];
    const costs = this.game.rules.config.costs;
    const ended = !!sim.state.ended;
    const pendingHere = this.game.pending.filter((a) => 'region' in a && a.region === i).length;

    const action = (label: string, cost: number, fn: () => void, disabled = false) => {
      const b = el('button', { class: 'act' }, `${label}`, el('small', {}, `${cost} 點`));
      if (disabled || ended || this.game.projectedCp() < cost) b.setAttribute('disabled', '');
      b.addEventListener('click', fn);
      return b;
    };

    const roads = sim.ctx.adj.incident[i].map((e) => {
      const other = sim.world.regions[sim.ctx.adj.other(e, i)];
      const s = sim.state.edgeStatus[e];
      const repairing = !!sim.state.scalars[`repairing:${e}`];
      const btn = action('搶修', costs.repairRoad, () => this.game.queue({ type: 'repairRoad', edge: e }), s >= 0.999 || repairing);
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
        action('派遣搜救隊', costs.dispatchRescue, () => this.game.queue({ type: 'dispatchRescue', region: i }), sim.state.scalars.teamsFree < 1),
        action('撤回搜救隊', costs.recallRescue, () => this.game.queue({ type: 'recallRescue', region: i }), v('teams') < 1),
        action('開設避難所', costs.openShelter, () => this.game.queue({ type: 'openShelter', region: i }), v('shelter') > 0),
        action('調撥物資', costs.sendSupplies, () => this.game.queue({ type: 'sendSupplies', region: i })),
      ),
      pendingHere ? el('div', { class: 'quiet' }, `已排入下一小時：${pendingHere} 項行動`) : '',
      el('h4', {}, '對外道路'),
      el('ul', { class: 'roads' }, ...roads),
    );
    byId('region').querySelector('.close')!.addEventListener('click', () => this.map.select(null));
  }

  private renderEnd() {
    const box = byId('end');
    const end = this.game.sim.state.ended;
    if (!end) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const d = end.details;
    const again = el('button', { class: 'wide' }, '再玩一局');
    again.addEventListener('click', () => this.game.restart());
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
        el('p', { class: 'quiet' }, `種子 ${this.game.seedValue}（相同種子會重現同一場地震）`),
        again,
      ),
    );
  }
}
