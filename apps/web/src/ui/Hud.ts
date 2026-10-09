import type { Game } from '../game';
import type { MapView } from '../map/MapView';
import { renderEndCard } from './endCard';
import { byId, el, fmtDays, fmtInt, fmtPct } from './format';
import { renderRegionPanel } from './regionPanel';
import { SceneBar } from './sceneBar';
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
    new SceneBar(map);
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
    if (!scene) this.map.stopTour();
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
    renderEndCard(this.game);
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

  private renderRegion() {
    renderRegionPanel(this.game, this.map, this.selected, this.scene);
  }

  private renderLog() {
    const log = this.game.sim.state.log.slice(-40).reverse();
    byId('log').replaceChildren(
      ...log.map((l) =>
        el('li', { class: `log-${l.kind}` }, el('span', { class: 't' }, `${l.tick}h`), `${LOG_ICON[l.kind] ?? '·'} ${l.text}`),
      ),
    );
  }
}
