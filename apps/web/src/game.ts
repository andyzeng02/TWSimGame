import { createSim, type Sim, type StepReport, type World } from '@twsim/sim-core';
import { createEarthquakeRules, DEFAULT_DIFFICULTY, DIFFICULTIES, type DifficultyKey, type EqAction } from '@twsim/rules-game';

/**
 * 遊戲控制器：時間推進、行動佇列。畫面（MapView / Hud）只透過這裡讀寫模擬。
 * 玩家的行動先進佇列，在下一個 tick 開始時套用（與 sim-core 的 tick 順序一致）。
 */
/** 每小時的紀錄：實際執行的行動與當時的全市數字（結算畫面的決策重播用） */
export interface TickRecord {
  tick: number;
  actions: EqAction[];
  metrics: Record<string, number>;
}

export class Game {
  sim: Sim<EqAction>;
  /** 本局每小時的紀錄；第 0 筆是地震剛發生時 */
  history: TickRecord[] = [];
  rules: ReturnType<typeof createEarthquakeRules>;
  pending: EqAction[] = [];
  playing = false;
  speed = 1;
  private timer: number | null = null;
  private listeners: ((r: StepReport | null) => void)[] = [];

  constructor(
    private world: World,
    private seed: number = Date.now() % 1_000_000,
    /** 難度（rules-game 的 DIFFICULTIES） */
    public difficulty: DifficultyKey = DEFAULT_DIFFICULTY,
  ) {
    this.rules = createEarthquakeRules(DIFFICULTIES[difficulty].overrides);
    this.sim = createSim(world, this.rules, seed);
    this.history = [this.startRecord()];
  }

  private startRecord(): TickRecord {
    return { tick: 0, actions: [], metrics: this.sim.snapshot().metrics };
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
    this.history.push({ tick: report.tick, actions: actions.filter((_, i) => report.actionResults[i]?.ok), metrics: report.metrics });
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

  /** 重新開一局；可同時換難度 */
  restart(seed = Date.now() % 1_000_000, difficulty: DifficultyKey = this.difficulty) {
    this.pause();
    this.seed = seed;
    this.difficulty = difficulty;
    this.rules = createEarthquakeRules(DIFFICULTIES[difficulty].overrides);
    this.pending = [];
    this.sim = createSim(this.world, this.rules, seed);
    this.history = [this.startRecord()];
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
