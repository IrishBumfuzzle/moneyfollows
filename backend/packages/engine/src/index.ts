// Pure game engine: no I/O, no clock, no Math.random. Same inputs give the same outputs.
// Public API only; consumers must not import from deeper paths.

export * from './rng';
export { EngineError, type EngineErrorCode } from './errors';
export { hashSeed } from './seed';
export { newGame, step } from './step';
export { currentView } from './view';
export { monthReport } from './lesson';
export { projectGrowth } from './projection';
export { assembleQuiz, scoreQuiz } from './assessment';
