import type { EggOrigin } from './context';

export type Direction = 'up' | 'right' | 'down' | 'left';
export type Cell = { x: number; y: number };
export type SnakeArena = {
  left: number;
  top: number;
  cell: number;
  columns: number;
  rows: number;
};
export type SnakeState = {
  arena: SnakeArena;
  body: Cell[];
  direction: Direction;
  turns: Direction[];
  food: Cell | null;
  phase: 'ready' | 'running' | 'paused' | 'over' | 'won';
};
const vectors: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
const opposite: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export function snakeFood(
  arena: SnakeArena,
  body: Cell[],
  random: () => number = Math.random,
): Cell | null {
  const occupied = new Set(body.map(({ x, y }) => `${x}:${y}`));
  const free: Cell[] = [];
  for (let y = 0; y < arena.rows; y++)
    for (let x = 0; x < arena.columns; x++) {
      if (!occupied.has(`${x}:${y}`)) free.push({ x, y });
    }
  return free.length ? free[Math.floor(random() * free.length)] : null;
}

export function createSnake(
  origin: EggOrigin,
  width: number,
  height: number,
): SnakeState {
  const cell = clamp(Math.round(origin.width || 24), 16, 28);
  const margin = 18;
  const top = 86;
  const bottom = width <= 760 && height > 420 ? 150 : 24;
  const left = clamp(origin.left, margin, width - margin - cell);
  const headTop = clamp(origin.top, top, Math.max(top, height - bottom - cell));
  const x = Math.max(0, Math.floor((left - margin) / cell));
  const y = Math.max(0, Math.floor((headTop - top) / cell));
  const arenaLeft = left - x * cell;
  const arenaTop = headTop - y * cell;
  const columns = Math.max(4, Math.floor((width - margin - arenaLeft) / cell));
  const rows = Math.max(4, Math.floor((height - bottom - arenaTop) / cell));
  const arena = { cell, columns, rows, left: arenaLeft, top: arenaTop };
  const body = [{ x, y }];
  const direction = x >= columns / 2 ? 'left' : 'right';
  const food = {
    x: clamp(x + (direction === 'left' ? -4 : 4), 0, columns - 1),
    y,
  };
  return { arena, body, direction, turns: [], food, phase: 'ready' };
}

export function turnSnake(state: SnakeState, direction: Direction): SnakeState {
  if (state.phase !== 'running' && state.phase !== 'ready') return state;
  const previous = state.turns.at(-1) ?? state.direction;
  if (
    state.turns.length >= 2 ||
    direction === previous ||
    direction === opposite[previous]
  )
    return state;
  return { ...state, turns: [...state.turns, direction] };
}

export function advanceSnake(
  state: SnakeState,
  random: () => number = Math.random,
): SnakeState {
  if (state.phase !== 'running') return state;
  const direction = state.turns[0] ?? state.direction;
  const vector = vectors[direction];
  const head = { x: state.body[0].x + vector.x, y: state.body[0].y + vector.y };
  const grows = state.food !== null && same(head, state.food);
  const trail = grows ? state.body : state.body.slice(0, -1);
  if (
    head.x < 0 ||
    head.y < 0 ||
    head.x >= state.arena.columns ||
    head.y >= state.arena.rows ||
    trail.some((cell) => same(cell, head))
  ) {
    return { ...state, direction, turns: [], phase: 'over' };
  }
  const body = [head, ...state.body];
  if (!grows) body.pop();
  const food = grows ? snakeFood(state.arena, body, random) : state.food;
  return {
    ...state,
    body,
    direction,
    turns: state.turns.slice(1),
    food,
    phase: food ? 'running' : 'won',
  };
}
