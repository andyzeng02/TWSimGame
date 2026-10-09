export * from './types';
export { createRng, createStandaloneRng, seedFrom } from './rng';
export { buildAdjacency, validateWorld, isConnected, distanceKm, distanceToLineKm } from './world';
export { diffuse, transfer, accessOf } from './diffusion';
export { createSim, createState, createCtx, type Sim, type Snapshot, type StepReport } from './engine';
export { runHeadless, replay, stateHash, type RunRecord, type Policy, type HeadlessResult } from './replay';
