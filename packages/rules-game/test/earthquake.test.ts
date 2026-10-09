import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createSim, runHeadless, validateWorld, type World } from '@twsim/sim-core';
import { createEarthquakeRules, greedyBot, idleBot, randomBot, intensityAt } from '../src/index';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const loadWorld = (): World =>
  JSON.parse(readFileSync(resolve(root, 'data/world/kaohsiung.sample.json'), 'utf8')) as World;

describe('高雄草稿世界', () => {
  it('通過世界檔檢查，且是 38 區', () => {
    const w = loadWorld();
    assert.deepEqual(validateWorld(w), []);
    assert.equal(w.regions.length, 38);
  });
});

describe('地震 72 小時', () => {
  it('震度隨距離遞減', () => {
    assert.ok(intensityAt(6.8, 1) > intensityAt(6.8, 20));
    assert.ok(intensityAt(6.8, 20) > intensityAt(6.8, 80));
  });

  it('剛開局：有受困者、道路有損、指揮點數為起始值', () => {
    const rules = createEarthquakeRules();
    const sim = createSim(loadWorld(), rules, 1);
    const m = sim.metrics();
    assert.ok(m.trapped > 0);
    assert.ok(m.roadAccess < 1);
    assert.equal(m.cp, rules.config.cpStart);
  });

  it('跑滿 72 tick 結束，並給出評級', () => {
    const r = runHeadless(loadWorld(), createEarthquakeRules(), 3, idleBot);
    assert.ok(r.end);
    assert.match(r.end!.grade, /^[SABCD]$/);
    assert.ok(r.record.actionsByTick.length <= 72);
  });

  it('同種子結果完全相同（可重現）', () => {
    const rules = createEarthquakeRules();
    const a = runHeadless(loadWorld(), rules, 11, greedyBot(rules.config));
    const b = runHeadless(loadWorld(), rules, 11, greedyBot(rules.config));
    assert.equal(a.finalHash, b.finalHash);
  });

  it('數值不會變成負數或 NaN', () => {
    const rules = createEarthquakeRules();
    const sim = createSim(loadWorld(), rules, 5);
    const bot = randomBot(5);
    while (!sim.state.ended) {
      sim.step(bot(sim));
      for (const [k, arr] of Object.entries(sim.state.vars)) {
        for (const x of arr) assert.ok(Number.isFinite(x) && x >= -1e-9, `${k} = ${x}`);
      }
      for (const x of sim.state.edgeStatus) assert.ok(x >= 0 && x <= 1);
    }
  });

  it('積極指揮明顯比不作為好', () => {
    const rules = createEarthquakeRules();
    let idle = 0;
    let greedy = 0;
    for (let seed = 1; seed <= 20; seed++) {
      idle += runHeadless(loadWorld(), rules, seed, idleBot).end!.score;
      greedy += runHeadless(loadWorld(), rules, seed, greedyBot(rules.config)).end!.score;
    }
    assert.ok(greedy > idle + 5 * 20, `greedy ${greedy / 20} vs idle ${idle / 20}`);
  });

  it('不合法的行動會被拒絕且不扣點', () => {
    const rules = createEarthquakeRules();
    const sim = createSim(loadWorld(), rules, 1);
    const cp = sim.state.scalars.cp;
    const r = sim.step([{ type: 'dispatchRescue', region: 999 }]);
    assert.equal(r.actionResults[0].ok, false);
    assert.equal(sim.state.scalars.cp, Math.min(rules.config.cpMax, cp + rules.config.cpPerTick));
  });
});
