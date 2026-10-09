import { createSim, type Sim, type StepReport, type World } from '@twsim/sim-core';
import { createEarthquakeRules, type EqAction } from '@twsim/rules-game';

/**
 * 遊戲控制器：時間推進、行動佇列。畫面（MapView / Hud）只透過這裡讀寫模擬。
 * 玩家的行動先進佇列，在下一個 tick 開始時套用（與 sim-core 的 tick 順序一致）。
 */
export class Game {
  sim: Sim<EqAction>;
  readonly rules = createEarthquakeRules();
  pending: EqAction[] = [];
  playing = false;
  speed = 1;
  private timer: number | null = null;
  private listeners: ((r: StepReport | null) => void)[] = [];

  constructor(private world: World, private seed: number = Date.now() % 1_000_000) {
    this.sim = createSim(world, this.rules, seed);
  }

  get seedValue() {
    return this.seed;
  }

  onChange(fn: (r: StepReport | null) => void) {
    this.listeners.push(fn);
  }

  private emit(r: StepReport | null) {
    for (const fn of this.listeners) fn(r);
  }

  costOf(a: EqAction): number {
    return this.rules.config.costs[a.type];
  }

  /** 扣掉佇列中行動後的預估指揮點數 */
  projectedCp(): number {
    return this.sim.state.scalars.cp - this.pending.reduce((s, a) => s + this.costOf(a), 0);
  }

  queue(a: EqAction): boolean {
    if (this.sim.state.ended) return false;
    if (this.projectedCp() < this.costOf(a)) return false;
    this.pending.push(a);
    this.emit(null);
    return true;
  }

  step() {
    if (this.sim.state.ended) return;
    const actions = this.pending;
    this.pending = [];
    const report = this.sim.step(actions);
    report.actionResults.forEach((r, i) => {
      if (!r.ok) this.sim.ctx.log('reject', `行動未執行（${actions[i].type}）：${r.reason}`);
    });
    if (report.ended) this.pause();
    this.emit(report);
  }

  play() {
    if (this.playing || this.sim.state.ended) return;
    this.playing = true;
    this.schedule();
    this.emit(null);
  }

  pause() {
    this.playing = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.emit(null);
  }

  setSpeed(x: number) {
    this.speed = x;
    if (this.playing) {
      if (this.timer !== null) window.clearTimeout(this.timer);
      this.schedule();
    }
    this.emit(null);
  }

  restart(seed = Date.now() % 1_000_000) {
    this.pause();
    this.seed = seed;
    this.pending = [];
    this.sim = createSim(this.world, this.rules, seed);
    this.emit(null);
  }

  private schedule() {
    // 1× = 每 1.2 秒一小時；72 小時約 1.5 分鐘，加上暫停思考約 20–30 分鐘一局
    this.timer = window.setTimeout(() => {
      this.step();
      if (this.playing) this.schedule();
    }, 1200 / this.speed);
  }
}
