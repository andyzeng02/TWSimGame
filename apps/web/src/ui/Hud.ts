import { DIFFICULTIES, type DifficultyKey } from '@twsim/rules-game';
import type { Game } from '../game';
import type { MapView } from '../map/MapView';
import { renderEndCard } from './endCard';
import { byId, el, fmtDays, fmtInt, fmtPct } from './format';
import { renderRegionPanel } from './regionPanel';
import { SceneBar } from './sceneBar';
import { startTutorial, tutorialDone } from './tutorial';
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
  /** 已經播過震波的事件數（重玩時歸零） */
  private shocksSeen = 0;

  constructor(private game: Game, private map: MapView) {
    this.buildLayerButtons();
    byId('play').addEventListener('click', () => (game.playing ? game.pause() : game.play()));
    byId('speed').addEventListener('click', () => game.setSpeed(game.speed >= 4 ? 1 : game.speed * 2));
    byId('announce').addEventListener('click', () => game.queue({ type: 'announce' }));
    for (const kind of ['hillshade', 'buildings', 'roads'] as const) {
      for (const id of [kind, `${kind}-2`]) {
        const box = byId<HTMLInputElement>(id);
        box.addEventListener('change', () => this.syncToggles(kind, box.checked));
      }
    }
    this.setupDifficulty();
    const fac = byId<HTMLInputElement>('facilities');
    fac.addEventListener('change', () => map.setFacilities(fac.checked));
    byId('to-command').addEventListener('click', () => this.setScene(false));
    byId('tutorial-open').addEventListener('click', () => this.tutorial());
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
    // 第一次進指揮模式：先看教學（等震波播完、畫面穩定再開）
    if (!scene && !tutorialDone() && !document.getElementById('tutorial')) setTimeout(() => this.tutorial(), 600);
  }

  /** 難度選單：換難度會開新的一局；這局已經開始時先確認 */
  private setupDifficulty() {
    const select = byId<HTMLSelectElement>('difficulty');
    for (const [key, d] of Object.entries(DIFFICULTIES)) {
      const o = new Option(d.label, key);
      o.title = d.description;
      select.append(o);
    }
    select.value = this.game.difficulty;
    select.title = DIFFICULTIES[this.game.difficulty].description;
    select.addEventListener('change', () => {
      const key = select.value as DifficultyKey;
      const g = this.game;
      const inProgress = g.sim.state.tick > 0 && !g.sim.state.ended;
      if (inProgress && !confirm(`換成「${DIFFICULTIES[key].label}」會開始新的一局，目前這局的進度會消失。確定嗎？`)) {
        select.value = g.difficulty;
        return;
      }
      select.title = DIFFICULTIES[key].description;
      this.shocksSeen = 0;
      g.restart(undefined, key);
      // 網址同步，方便分享同一個難度
      const url = new URL(location.href);
      url.searchParams.set('difficulty', key);
      url.searchParams.delete('seed');
      history.replaceState(null, '', url);
    });
  }

  private tutorial() {
    this.game.pause();
    startTutorial();
  }

  /** 觀景與指揮模式各有一組勾選框，兩邊保持同步 */
  private syncToggles(kind: 'hillshade' | 'buildings' | 'roads', on: boolean) {
    byId<HTMLInputElement>(kind).checked = on;
    byId<HTMLInputElement>(`${kind}-2`).checked = on;
    if (kind === 'hillshade') this.map.setHillshade(on);
    else if (kind === 'buildings') this.map.setBuildings(on);
    else this.map.setRoads(on);
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

  /** 新出現的地震、餘震事件：在地圖上播震波（觀景模式不播，等切到指揮模式再播） */
  private playNewShocks() {
    const log = this.game.sim.state.log;
    if (log.length < this.shocksSeen) this.shocksSeen = 0; // 再玩一局
    if (this.scene) return;
    const fresh = log.slice(this.shocksSeen);
    this.shocksSeen = log.length;
    const { world } = this.game.sim;
    const fault = world.faults.find((f) => f.id === this.game.rules.config.faultId) ?? world.faults[0];
    const center = fault ? fault.line[Math.floor(fault.line.length / 2)] : world.regions[0].centroid;
    for (const l of fresh) {
      if (l.kind === 'quake') this.map.playShockwave(center, 1);
      else if (l.kind === 'aftershock') this.map.playShockwave(center, 0.6);
    }
  }

  private renderLog() {
    this.playNewShocks();
    const log = this.game.sim.state.log.slice(-40).reverse();
    byId('log').replaceChildren(
      ...log.map((l) =>
        el('li', { class: `log-${l.kind}` }, el('span', { class: 't' }, `${l.tick}h`), `${LOG_ICON[l.kind] ?? '·'} ${l.text}`),
      ),
    );
  }
}
