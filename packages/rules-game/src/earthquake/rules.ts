import {
  accessOf,
  diffuse,
  distanceKm,
  distanceToLineKm,
  transfer,
  type ActionResult,
  type Ctx,
  type EndResult,
  type Rules,
  type World,
} from '@twsim/sim-core';
import { DEFAULT_EARTHQUAKE, intensityAt, trappedRate, type EarthquakeConfig } from './config';

export type EqAction =
  | { type: 'dispatchRescue'; region: number }
  | { type: 'recallRescue'; region: number }
  | { type: 'openShelter'; region: number }
  | { type: 'repairRoad'; edge: number }
  | { type: 'sendSupplies'; region: number }
  | { type: 'announce' };

/** 區塊變數。shelter：0 未開、0.5 籌備中、1 已開 */
export const EQ_VARS = [
  'intensity',
  'trapped',
  'injured',
  'treated',
  'deaths',
  'bedsFree',
  'supplies',
  'order',
  'rumor',
  'teams',
  'teamsEnroute',
  'suppliesEnroute',
  'shelter',
] as const;

/** 玩家看得到的五個核心指標（其餘為輔助資訊） */
export const EQ_CORE_METRICS = ['trapped', 'medicalMargin', 'roadAccess', 'supplies', 'order'] as const;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const repairKey = (edge: number) => `repairing:${edge}`;

function popWeighted(ctx: Ctx, name: string): number {
  const x = ctx.v(name);
  let sum = 0;
  let pop = 0;
  ctx.world.regions.forEach((r, i) => {
    sum += x[i] * r.population;
    pop += r.population;
  });
  return pop > 0 ? sum / pop : 0;
}

function total(ctx: Ctx, name: string): number {
  return ctx.v(name).reduce((a, b) => a + b, 0);
}

export function gradeOf(score: number, cfg: EarthquakeConfig): string {
  const g = cfg.grades;
  if (score >= g.S) return 'S';
  if (score >= g.A) return 'A';
  if (score >= g.B) return 'B';
  if (score >= g.C) return 'C';
  return 'D';
}

export function createEarthquakeRules(overrides: Partial<EarthquakeConfig> = {}): Rules<EqAction> & {
  config: EarthquakeConfig;
} {
  const cfg: EarthquakeConfig = { ...DEFAULT_EARTHQUAKE, ...overrides };
  const n = (ctx: Ctx) => ctx.world.regions.length;
  const validRegion = (ctx: Ctx, r: number) => Number.isInteger(r) && r >= 0 && r < n(ctx);
  const fail = (reason: string): ActionResult => ({ ok: false, reason });

  const pay = (ctx: Ctx, cost: number): boolean => {
    if (ctx.state.scalars.cp < cost) return false;
    ctx.state.scalars.cp -= cost;
    return true;
  };

  /** 依通達度決定抵達所需 tick 數 */
  const delayFor = (ctx: Ctx, region: number, base: number, floor: number) =>
    Math.ceil(base / Math.max(accessOf(ctx, region), floor));

  return {
    id: 'earthquake-72h',
    title: '地震 72 小時',
    maxTicks: cfg.maxTicks,
    vars: EQ_VARS,
    config: cfg,

    init(ctx) {
      const { world, rng, state } = ctx;
      const fault = world.faults.find((f) => f.id === cfg.faultId) ?? world.faults[0];
      const magnitude = cfg.magnitude + rng.range(-cfg.magnitudeJitter, cfg.magnitudeJitter);
      state.scalars.magnitude = magnitude;
      const I = ctx.v('intensity');
      const trapped = ctx.v('trapped');
      const injured = ctx.v('injured');
      const beds = ctx.v('bedsFree');
      const supplies = ctx.v('supplies');
      const order = ctx.v('order');
      const rumor = ctx.v('rumor');

      const facilityBeds = hospitalBedsByRegion(world);
      world.regions.forEach((r, i) => {
        const d = fault ? distanceToLineKm(r.centroid, fault.line) : distanceKm(r.centroid, world.regions[0].centroid);
        I[i] = intensityAt(magnitude, d);
        trapped[i] = r.population * trappedRate(I[i]) * rng.range(0.8, 1.2);
        injured[i] = trapped[i] * cfg.injuredPerTrapped * rng.range(0.8, 1.2);
        const hospitalDamage = Math.max(0.2, 1 - Math.max(0, I[i] - 5) * 0.25);
        // 病床：區屬性 > 世界檔的醫院設施 > 依人口估算
        const baseBeds = r.attrs.hospitalBeds ?? facilityBeds?.[i] ?? (r.population * cfg.bedsPer1000) / 1000;
        beds[i] = baseBeds * cfg.bedsAvailableShare * hospitalDamage;
        supplies[i] = cfg.suppliesStartDays;
        order[i] = clamp01(1 - 0.08 * Math.max(0, I[i] - 4));
        rumor[i] = 0.05;
      });

      world.edges.forEach((e, k) => {
        const imax = Math.max(I[e.from], I[e.to]);
        const dmg = 0.15 * (imax - 3.5) + (imax > 4 ? rng.range(0, 0.25) : 0);
        state.edgeStatus[k] = 1 - Math.max(0, Math.min(0.95, dmg));
      });

      let aftershocks = 0;
      for (let t = 1; t < cfg.maxTicks; t++) {
        if (rng.chance(cfg.aftershockBaseChance / (1 + t / cfg.aftershockDecayTicks))) {
          ctx.schedule(t, 'aftershock', { magnitude: magnitude - rng.range(1.2, 2.5) });
          aftershocks++;
        }
      }

      state.scalars.cp = cfg.cpStart;
      state.scalars.teamsFree = cfg.rescueTeamsTotal;
      state.scalars.atRisk = total(ctx, 'trapped') + total(ctx, 'injured');
      state.scalars.aftershocksPlanned = aftershocks;

      const worst = I.reduce((best, x, i) => (x > I[best] ? i : best), 0);
      ctx.log(
        'quake',
        `規模 ${magnitude.toFixed(1)} 地震，震源：${fault?.name ?? '未知'}。最大震度出現在${world.regions[worst].name}（約 ${I[worst].toFixed(1)} 級）。`,
        worst,
      );
    },

    applyAction(ctx, a) {
      const s = ctx.state.scalars;
      switch (a.type) {
        case 'dispatchRescue': {
          if (!validRegion(ctx, a.region)) return fail('區塊不存在');
          if (s.teamsFree < 1) return fail('沒有待命的搜救隊');
          if (!pay(ctx, cfg.costs.dispatchRescue)) return fail('指揮點數不足');
          s.teamsFree--;
          ctx.v('teamsEnroute')[a.region]++;
          ctx.schedule(delayFor(ctx, a.region, 2, 0.2), 'teamArrive', { region: a.region });
          return { ok: true };
        }
        case 'recallRescue': {
          if (!validRegion(ctx, a.region)) return fail('區塊不存在');
          if (ctx.v('teams')[a.region] < 1) return fail('該區沒有搜救隊');
          if (!pay(ctx, cfg.costs.recallRescue)) return fail('指揮點數不足');
          ctx.v('teams')[a.region]--;
          ctx.schedule(2, 'teamReturn', { region: a.region });
          return { ok: true };
        }
        case 'openShelter': {
          if (!validRegion(ctx, a.region)) return fail('區塊不存在');
          if (ctx.v('shelter')[a.region] > 0) return fail('避難所已開設或籌備中');
          if (!pay(ctx, cfg.costs.openShelter)) return fail('指揮點數不足');
          ctx.v('shelter')[a.region] = 0.5;
          const registered = (ctx.world.facilities ?? []).some((f) => f.kind === 'shelter' && f.region === a.region);
          ctx.schedule(registered ? cfg.shelterOpenTicksRegistered : cfg.shelterOpenTicks, 'shelterOpen', { region: a.region });
          return { ok: true };
        }
        case 'repairRoad': {
          const e = a.edge;
          if (!(Number.isInteger(e) && e >= 0 && e < ctx.world.edges.length)) return fail('道路不存在');
          if (ctx.state.edgeStatus[e] >= 0.999) return fail('道路完好');
          if (s[repairKey(e)]) return fail('已在搶修中');
          if (!pay(ctx, cfg.costs.repairRoad)) return fail('指揮點數不足');
          s[repairKey(e)] = 1;
          ctx.schedule(cfg.repairDelayTicks, 'roadRepaired', { edge: e });
          return { ok: true };
        }
        case 'sendSupplies': {
          if (!validRegion(ctx, a.region)) return fail('區塊不存在');
          if (!pay(ctx, cfg.costs.sendSupplies)) return fail('指揮點數不足');
          ctx.v('suppliesEnroute')[a.region]++;
          ctx.schedule(delayFor(ctx, a.region, 3, 0.15), 'suppliesArrive', { region: a.region });
          return { ok: true };
        }
        case 'announce': {
          if (!pay(ctx, cfg.costs.announce)) return fail('指揮點數不足');
          const rumor = ctx.v('rumor');
          for (let i = 0; i < rumor.length; i++) rumor[i] *= 1 - cfg.announceRumorCut;
          ctx.log('announce', '發布闢謠公告，各區謠言下降。');
          return { ok: true };
        }
      }
    },

    onEvent(ctx, ev) {
      const p = ev.payload as { region?: number; edge?: number; magnitude?: number };
      const name = (r: number) => ctx.world.regions[r].name;
      switch (ev.type) {
        case 'teamArrive':
          ctx.v('teamsEnroute')[p.region!]--;
          ctx.v('teams')[p.region!]++;
          ctx.log('rescue', `搜救隊抵達${name(p.region!)}。`, p.region);
          break;
        case 'teamReturn':
          ctx.state.scalars.teamsFree++;
          break;
        case 'shelterOpen':
          ctx.v('shelter')[p.region!] = 1;
          ctx.log('shelter', `${name(p.region!)}避難所開設完成。`, p.region);
          break;
        case 'roadRepaired': {
          const e = p.edge!;
          ctx.state.edgeStatus[e] = Math.min(1, ctx.state.edgeStatus[e] + cfg.repairAmount);
          delete ctx.state.scalars[repairKey(e)];
          const edge = ctx.world.edges[e];
          ctx.log('road', `${name(edge.from)}—${name(edge.to)} 道路搶修完成。`);
          break;
        }
        case 'suppliesArrive':
          ctx.v('suppliesEnroute')[p.region!]--;
          ctx.v('supplies')[p.region!] += cfg.suppliesPerShipmentDays;
          ctx.log('supplies', `物資送達${name(p.region!)}。`, p.region);
          break;
        case 'aftershock': {
          const fault = ctx.world.faults.find((f) => f.id === cfg.faultId) ?? ctx.world.faults[0];
          const mag = p.magnitude!;
          const trapped = ctx.v('trapped');
          let added = 0;
          let hit = 0;
          ctx.world.regions.forEach((r, i) => {
            const d = fault ? distanceToLineKm(r.centroid, fault.line) : 10;
            const ai = intensityAt(mag, d);
            const extra = r.population * trappedRate(ai) * 0.3;
            if (extra > 0) {
              trapped[i] += extra;
              added += extra;
              hit++;
            }
          });
          ctx.world.edges.forEach((e, k) => {
            const d = fault
              ? Math.min(
                  distanceToLineKm(ctx.world.regions[e.from].centroid, fault.line),
                  distanceToLineKm(ctx.world.regions[e.to].centroid, fault.line),
                )
              : 10;
            if (intensityAt(mag, d) >= 4.5) {
              ctx.state.edgeStatus[k] = Math.max(0.05, ctx.state.edgeStatus[k] - ctx.rng.range(0.05, 0.2));
            }
          });
          ctx.state.scalars.atRisk += added;
          ctx.log('aftershock', `規模 ${mag.toFixed(1)} 餘震${hit ? `，${hit} 區新增受困者` : ''}。`);
          break;
        }
      }
    },

    spread(ctx) {
      // 謠言沿社交連結擴散（不受道路影響）
      diffuse(ctx, 'rumor', cfg.rumorDiffusion, () => 1);

      // 傷患外溢：病床不足的區塊沿道路轉送到有空床的鄰區
      const injured = ctx.v('injured');
      const beds = ctx.v('bedsFree');
      ctx.world.edges.forEach((e, k) => {
        const cap = e.capacity * cfg.transferPerEdgeShare * ctx.state.edgeStatus[k];
        for (const [a, b] of [
          [e.from, e.to],
          [e.to, e.from],
        ]) {
          const excess = injured[a] - beds[a];
          const spare = beds[b] - injured[b];
          if (excess > 0 && spare > 0) transfer(ctx, 'injured', k, a, b, Math.min(excess, spare, cap));
        }
      });
    },

    local(ctx) {
      const tick = ctx.state.tick;
      const v = (k: string) => ctx.v(k);
      const [trapped, injured, treated, deaths, beds, supplies, order, rumor, teams, shelter] = [
        v('trapped'),
        v('injured'),
        v('treated'),
        v('deaths'),
        v('bedsFree'),
        v('supplies'),
        v('order'),
        v('rumor'),
        v('teams'),
        v('shelter'),
      ];

      for (let i = 0; i < trapped.length; i++) {
        const acc = accessOf(ctx, i);
        const sheltered = shelter[i] >= 1;

        // 搜救
        if (teams[i] > 0 && trapped[i] > 0) {
          const eff = teams[i] * cfg.rescuePerTeamPerTick * (0.5 + 0.5 * acc) * (0.5 + 0.5 * order[i]);
          const rescued = Math.min(trapped[i], eff);
          trapped[i] -= rescued;
          injured[i] += rescued * cfg.rescuedInjuredShare;
        }

        // 受困者隨時間惡化（黃金 72 小時）
        const dT = trapped[i] * cfg.trappedDeathBase * (1 + tick * cfg.trappedDeathGrowthPerTick);
        trapped[i] -= dT;
        deaths[i] += dT;

        // 收治
        const admit = Math.min(injured[i], beds[i]);
        beds[i] -= admit;
        injured[i] -= admit;
        treated[i] += admit;

        // 未收治傷患惡化
        const dI = injured[i] * cfg.injuredDeathUntreated * (sheltered ? cfg.shelterInjuredDeathFactor : 1);
        injured[i] -= dI;
        deaths[i] += dI;

        // 物資消耗（每 tick = 1 小時）
        supplies[i] = Math.max(0, supplies[i] - 1 / 24);

        // 秩序
        let o = order[i];
        if (supplies[i] < cfg.suppliesLowDays) o -= cfg.orderLossNoSupply;
        o -= cfg.orderLossPerRumor * rumor[i];
        if (sheltered) o += cfg.orderGainShelter;
        o += cfg.orderRecovery;
        order[i] = clamp01(o);

        // 謠言：秩序越低長得越快
        rumor[i] = clamp01(rumor[i] + cfg.rumorGrowth * (1 - order[i]) - cfg.rumorDecay);
      }

      const s = ctx.state.scalars;
      s.cp = Math.min(cfg.cpMax, s.cp + cfg.cpPerTick);
    },

    checkEnd(ctx): EndResult | null {
      const orderAvg = popWeighted(ctx, 'order');
      const timeUp = ctx.state.tick >= cfg.maxTicks;
      const collapsed = orderAvg < cfg.orderCollapse;
      if (!timeUp && !collapsed) return null;

      const deaths = total(ctx, 'deaths');
      const atRisk = Math.max(1, ctx.state.scalars.atRisk);
      const survival = 1 - deaths / atRisk;
      const sNorm = clamp01((survival - cfg.survivalFloor) / (cfg.survivalCeil - cfg.survivalFloor));
      const w = cfg.survivalWeight;
      const score = Math.round(100 * (w * sNorm + (1 - w) * orderAvg) * 10) / 10;
      return {
        reason: collapsed ? '社會失序，指揮體系瓦解' : '72 小時應變結束',
        score: collapsed ? Math.min(score, cfg.grades.C - 1) : score,
        grade: collapsed ? 'D' : gradeOf(score, cfg),
        details: {
          deaths: Math.round(deaths),
          atRisk: Math.round(atRisk),
          stillTrapped: Math.round(total(ctx, 'trapped')),
          treated: Math.round(total(ctx, 'treated')),
          order: Math.round(orderAvg * 100) / 100,
          survival: Math.round(survival * 1000) / 1000,
        },
      };
    },

    metrics(ctx) {
      const s = ctx.state.scalars;
      const edges = ctx.state.edgeStatus;
      const roadAccess = edges.length ? edges.reduce((a, b) => a + b, 0) / edges.length : 1;
      return {
        trapped: total(ctx, 'trapped'),
        medicalMargin: total(ctx, 'bedsFree') - total(ctx, 'injured'),
        roadAccess,
        supplies: popWeighted(ctx, 'supplies'),
        order: popWeighted(ctx, 'order'),
        deaths: total(ctx, 'deaths'),
        injuredWaiting: total(ctx, 'injured'),
        rumor: popWeighted(ctx, 'rumor'),
        cp: s.cp,
        teamsFree: s.teamsFree,
      };
    },
  };
}

/**
 * 世界檔有醫院設施且標了病床數時，加總每區的病床；沒有這類資料時回傳 null（改用人口估算）。
 * 有資料時，沒有醫院的區病床為 0，傷患要靠轉送。
 */
export function hospitalBedsByRegion(world: World): number[] | null {
  const hospitals = (world.facilities ?? []).filter((f) => f.kind === 'hospital' && f.capacity !== undefined);
  if (!hospitals.length) return null;
  const beds = world.regions.map(() => 0);
  for (const h of hospitals) beds[h.region] += h.capacity!;
  return beds;
}
