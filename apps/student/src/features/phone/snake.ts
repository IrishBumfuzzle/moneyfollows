// Snake, the phone's game. Pure like the engine: state in, state out, no clock or Math.random
// (food spots come from a hash of the seed and how much has been eaten), so a game can be
// replayed and tested. The screen calls step() on a timer and turn() on a swipe or button.

export type Dir = 'up' | 'down' | 'left' | 'right';
export interface Cell {
  x: number;
  y: number;
}

export interface SnakeState {
  size: number;      // the board is size x size
  seed: number;
  body: Cell[];      // head first
  dir: Dir;
  next: Dir;         // the turn to apply on the next step (one per step, so no 180° in one tick)
  food: Cell;
  score: number;     // food eaten
  alive: boolean;
}

export const SIZE = 15;
const DELTA: Record<Dir, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** 32-bit integer hash (mulberry32 step) of the inputs: same inputs, same number. */
function hash(...xs: number[]): number {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h = Math.imul(h ^ x, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** A free cell for food, picked deterministically; null if the board is full. */
export function placeFood(size: number, body: readonly Cell[], seed: number, n: number): Cell | null {
  const free: Cell[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!body.some((c) => c.x === x && c.y === y)) free.push({ x, y });
  return free.length ? free[hash(seed, n) % free.length] : null;
}

export function createSnake(seed: number, size = SIZE): SnakeState {
  const mid = Math.floor(size / 2);
  const body = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
  return { size, seed, body, dir: 'right', next: 'right', food: placeFood(size, body, seed, 0)!, score: 0, alive: true };
}

/** Queues a turn. Reversing straight into yourself is ignored. */
export function turn(s: SnakeState, d: Dir): SnakeState {
  if (!s.alive || d === OPPOSITE[s.dir] || d === s.next) return s;
  return { ...s, next: d };
}

/** One tick: move, eat, grow, or crash into a wall or yourself. */
export function step(s: SnakeState): SnakeState {
  if (!s.alive) return s;
  const dir = s.next;
  const head = { x: s.body[0].x + DELTA[dir].x, y: s.body[0].y + DELTA[dir].y };
  const eats = head.x === s.food.x && head.y === s.food.y;
  // The tail moves out of the way this tick unless the snake grows.
  const rest = eats ? s.body : s.body.slice(0, -1);
  const wall = head.x < 0 || head.y < 0 || head.x >= s.size || head.y >= s.size;
  if (wall || rest.some((c) => c.x === head.x && c.y === head.y)) return { ...s, dir, alive: false };
  const body = [head, ...rest];
  if (!eats) return { ...s, dir, body };
  const score = s.score + 1;
  const food = placeFood(s.size, body, s.seed, score);
  // A full board is a win: the game ends with the snake alive in spirit, but no more moves.
  return food ? { ...s, dir, body, score, food } : { ...s, dir, body, score, alive: false };
}

/** Faster as the snake grows, never below 90 ms a step. */
export const tickMs = (score: number) => Math.max(90, 180 - score * 6);
