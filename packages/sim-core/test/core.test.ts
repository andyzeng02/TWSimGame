import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createCtx,
  createSim,
  createStandaloneRng,
  createState,
  diffuse,
  distanceKm,
  distanceToLineKm,
  replay,
  runHeadless,
  stateHash,
  validateWorld,
} from '../src/index';
import { lineWorld, toyRules, type ToyAction } from './helpers';

describe('rng', () => {
  it('同一個種子產生同一串數字', () => {
    const a = createStandaloneRng(42);
    const b = createStandaloneRng(42);
    for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  });
  it('數值落在 [0, 1)', () => {
    const r = createStandaloneRng('seed');
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      assert.ok(x >= 0 && x < 1);
    }
  });
});

describe('diffuse', () => {
  it('總量守恆，且往平均值靠近', () => {
    const world = lineWorld();
    const state = createState(world, ['x'], 1);
    const ctx = createCtx(world, state);
    const x = ctx.v('x');
    x[0] = 100;
    for (let t = 0; t < 500; t++) diffuse(ctx, 'x', 0.2, () => 1);
    const total = x.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 100) < 1e-9);
    for (const v of x) assert.ok(Math.abs(v - 25) < 0.01);
  });
  it('通行率 0 的連線不擴散', () => {
    const world = lineWorld();
    const state = createState(world, ['x'], 1);
    const ctx = createCtx(world, state);
    state.edgeStatus[0] = 0;
    ctx.v('x')[0] = 100;
    for (let t = 0; t < 50; t++) diffuse(ctx, 'x', 0.2, (e) => state.edgeStatus[e]);
    assert.equal(ctx.v('x')[0], 100);
  });
});

describe('engine', () => {
  it('事件依 (tick, 排程順序) 觸發', () => {
    const sim = createSim(lineWorld(), toyRules(), 1);
    for (let t = 0; t < 5; t++) sim.step();
    const pings = sim.state.log.filter((l) => l.kind === 'ping').map((l) => `${l.tick}:${l.text}`);
    assert.deepEqual(pings, ['1:0', '3:1', '3:2']);
  });
  it('到 maxTicks 結束，之後 step 不再推進', () => {
    const sim = createSim(lineWorld(), toyRules(), 1);
    for (let t = 0; t < 30; t++) sim.step();
    assert.equal(sim.state.tick, 20);
    assert.ok(sim.state.ended);
  });
  it('同種子同行動 → 狀態雜湊完全相同；不同種子 → 不同', () => {
    const policy = (s: { state: { tick: number } }): ToyAction[] =>
      s.state.tick % 4 === 0 ? [{ type: 'add', region: 3, amount: 5 }] : [];
    const a = runHeadless(lineWorld(), toyRules(), 7, policy);
    const b = runHeadless(lineWorld(), toyRules(), 7, policy);
    const c = runHeadless(lineWorld(), toyRules(), 8, policy);
    assert.equal(a.finalHash, b.finalHash);
    assert.notEqual(a.finalHash, c.finalHash);
  });
  it('依紀錄重播得到相同結果', () => {
    const policy = (): ToyAction[] => [{ type: 'add', region: 2, amount: 1 }];
    const run = runHeadless(lineWorld(), toyRules(), 'abc', policy);
    const again = replay(lineWorld(), toyRules(), run.record);
    assert.equal(stateHash(again), run.finalHash);
  });
});

describe('world', () => {
  it('合法世界沒有錯誤', () => {
    assert.deepEqual(validateWorld(lineWorld()), []);
  });
  it('抓出孤島與壞連線', () => {
    const w = lineWorld();
    w.edges.pop();
    assert.ok(validateWorld(w).some((e) => e.includes('孤島')));
    const w2 = lineWorld();
    w2.edges.push({ from: 0, to: 9, kind: 'road', capacity: 1, travelTicks: 1, lengthKm: 1 });
    assert.ok(validateWorld(w2).some((e) => e.includes('不存在')));
  });
  it('距離計算合理', () => {
    // 緯度差 1 度約 111 公里
    assert.ok(Math.abs(distanceKm([120, 22], [120, 23]) - 111.32) < 0.5);
    // 點在線段正上方
    const d = distanceToLineKm([120.5, 22.1], [[120, 22], [121, 22]]);
    assert.ok(Math.abs(d - 11.13) < 0.2);
  });
});
