export { DEFAULT_EARTHQUAKE, intensityAt, trappedRate, type EarthquakeConfig } from './earthquake/config';
export {
  createEarthquakeRules,
  gradeOf,
  EQ_VARS,
  EQ_CORE_METRICS,
  type EqAction,
} from './earthquake/rules';
export { idleBot, randomBot, greedyBot } from './earthquake/bots';
