export {
  DEFAULT_DIFFICULTY,
  DEFAULT_EARTHQUAKE,
  DIFFICULTIES,
  intensityAt,
  trappedRate,
  type DifficultyKey,
  type EarthquakeConfig,
} from './earthquake/config';
export {
  createEarthquakeRules,
  gradeOf,
  hospitalBedsByRegion,
  EQ_VARS,
  EQ_CORE_METRICS,
  type EqAction,
} from './earthquake/rules';
export { idleBot, randomBot, greedyBot } from './earthquake/bots';
