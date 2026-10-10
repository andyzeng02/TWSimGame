/**
 * 批次跑分：用機器人玩家無畫面跑很多場，輸出評級分布。
 * 調整 src/earthquake/config.ts 之後一定要跑這個。
 *
 *   npm run batch                 # 預設每種機器人 200 場
 *   npm run batch -- 500          # 指定場數
 *   npm run batch -- 200 kaohsiung.json   # 指定世界檔（data/world/ 底下）
 *   npm run batch -- 200 kaohsiung.json hard   # 只跑某個難度（easy / normal / hard）
 *
 * 健康的分布（設計目標，以「標準」難度為準）：
 *   idle   ：全部 D（不玩也能過 = 太簡單）
 *   random ：幾乎全是 D，少數 C
 *   greedy ：分散在 S–B，C 不超過 15%（幾乎都是 S = 太簡單）
 * 輕度應比標準容易、嚴重應比標準難，三種難度的 idle 都要是 D。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHeadless, validateWorld, type World } from '@twsim/sim-core';
import { createEarthquakeRules, DIFFICULTIES, greedyBot, idleBot, randomBot, type DifficultyKey } from '../src/index';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const runs = Number(process.argv[2] ?? 200);
const worldFile = process.argv[3] ?? (existsSync(resolve(root, 'data/world/kaohsiung.json')) ? 'kaohsiung.json' : 'kaohsiung.sample.json');
const world = JSON.parse(readFileSync(resolve(root, 'data/world', worldFile), 'utf8')) as World;

const errors = validateWorld(world);
if (errors.length) {
  console.error(`世界檔有誤：\n${errors.join('\n')}`);
  process.exit(1);
}

const only = process.argv[4] as DifficultyKey | undefined;
const keys = (Object.keys(DIFFICULTIES) as DifficultyKey[]).filter((k) => !only || k === only);

console.log(`世界：${world.meta.name}（${world.regions.length} 區）  劇本：地震 72 小時  每種 ${runs} 場`);
for (const key of keys) {
  const d = DIFFICULTIES[key];
  const rules = createEarthquakeRules(d.overrides);
  const bots = {
    idle: () => idleBot,
    random: (seed: number) => randomBot(seed),
    greedy: () => greedyBot(rules.config),
  };
  console.log(`\n【${d.label}】${d.description}`);
  console.log('機器人   S    A    B    C    D    平均分   平均死亡   平均受威脅');
  for (const [name, make] of Object.entries(bots)) {
    const counts: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
    let score = 0;
    let deaths = 0;
    let atRisk = 0;
    for (let seed = 1; seed <= runs; seed++) {
      const r = runHeadless(world, rules, seed, make(seed));
      const end = r.end!;
      counts[end.grade]++;
      score += end.score;
      deaths += end.details.deaths;
      atRisk += end.details.atRisk;
    }
    const pct = (k: string) => `${Math.round((100 * counts[k]) / runs)}%`.padStart(4);
    console.log(
      `${name.padEnd(7)} ${pct('S')} ${pct('A')} ${pct('B')} ${pct('C')} ${pct('D')}   ${(score / runs).toFixed(1).padStart(5)}   ${Math.round(deaths / runs).toString().padStart(7)}   ${Math.round(atRisk / runs).toString().padStart(8)}`,
    );
  }
}
