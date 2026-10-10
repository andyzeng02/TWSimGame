import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createSim, runHeadless, validateWorld, type World } from '@twsim/sim-core';
import { createEarthquakeRules, greedyBot, hospitalBedsByRegion, idleBot, randomBot, intensityAt } from '../src/index';

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

describe('醫院與避難所參與模擬（ROADMAP 3.3）', () => {
  it('沒有設施資料時：病床依人口估算，結果與原本完全相同', () => {
    const w = loadWorld();
    assert.equal(hospitalBedsByRegion(w), null);
    const a = runHeadless(w, createEarthquakeRules(), 11, greedyBot(createEarthquakeRules().config));
    const b = runHeadless({ ...w, facilities: [] }, createEarthquakeRules(), 11, greedyBot(createEarthquakeRules().config));
    assert.equal(a.finalHash, b.finalHash);
  });

  it('有醫院病床資料時：病床依醫院加總，沒有醫院的區為 0', () => {
    const w = loadWorld();
    w.facilities = [
      { kind: 'hospital', name: '甲醫院', at: w.regions[2].centroid, region: 2, capacity: 1000 },
      { kind: 'hospital', name: '乙醫院', at: w.regions[2].centroid, region: 2, capacity: 500 },
      { kind: 'hospital', name: '無床數診所', at: w.regions[3].centroid, region: 3 },
    ];
    const beds = hospitalBedsByRegion(w)!;
    assert.equal(beds[2], 1500);
    assert.equal(beds[3], 0, '沒有標病床數的不算');
    const rules = createEarthquakeRules();
    const sim = createSim(w, rules, 1);
    const free = sim.state.vars.bedsFree;
    assert.ok(free[2] > 0 && free[2] <= 1500 * rules.config.bedsAvailableShare + 1e-9);
    assert.equal(free[5], 0);
  });

  it('有登記避難收容處所的區，避難所開得比較快', () => {
    const w = loadWorld();
    w.facilities = [{ kind: 'shelter', name: '某國小', at: w.regions[4].centroid, region: 4, capacity: 300 }];
    const rules = createEarthquakeRules();
    const sim = createSim(w, rules, 1);
    sim.step([
      { type: 'openShelter', region: 4 },
      { type: 'openShelter', region: 6 },
    ]);
    const shelter = () => [sim.state.vars.shelter[4], sim.state.vars.shelter[6]];
    // 第 1 小時套用行動；登記區 1 小時後開設完成，未登記區要 2 小時
    sim.step([]);
    assert.deepEqual(shelter(), [1, 0.5]);
    sim.step([]);
    assert.deepEqual(shelter(), [1, 1]);
  });
});

describe('增援搜救隊', () => {
  it('受威脅人數越多，開局待命搜救隊越多', () => {
    const w = loadWorld();
    const base = createSim(w, createEarthquakeRules({ aidTeamsPer1000AtRisk: 0 }), 5).state.scalars;
    const aided = createSim(w, createEarthquakeRules({ aidTeamsPer1000AtRisk: 4 }), 5).state.scalars;
    assert.equal(base.teamsFree, createEarthquakeRules().config.rescueTeamsTotal);
    assert.equal(aided.teamsFree, base.teamsFree + Math.round((aided.atRisk / 1000) * 4));
  });
});
