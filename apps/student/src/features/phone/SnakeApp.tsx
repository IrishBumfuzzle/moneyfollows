import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../../game/useGame';
import { lifeApi } from '../life/life';
import { trackSnake } from './api';
import { t } from './content';
import type { Lang } from './content';
import { createSnake, step, tickMs, turn } from './snake';
import type { Dir, SnakeState } from './snake';
import { usePhone } from './usePhone';

/** Snake gives a small sanity boost (a short break), at most once per in-game week. Never money. */
const RELAX_SANITY = 3;
const SWIPE_MIN = 24;

type Phase = 'ready' | 'playing' | 'paused' | 'over';

export function SnakeApp({ lang }: { lang: Lang }) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const [round, setRound] = useState(1);
  const [game, setGame] = useState<SnakeState>(() => createSnake(1));
  const [phase, setPhase] = useState<Phase>('ready');
  const [result, setResult] = useState<{ best: boolean; relaxed: number } | null>(null);
  const best = usePhone((s) => s.snakeBest);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback((d: Dir) => setGame((g) => turn(g, d)), []);

  // The game loop: one step per tick while playing; speeds up as the snake grows.
  useEffect(() => {
    if (phase !== 'playing') return;
    const id = window.setInterval(() => setGame((g) => step(g)), tickMs(game.score));
    return () => window.clearInterval(id);
  }, [phase, game.score]);

  // Pause when the tab is hidden, so a phone call or switching apps never kills the snake.
  useEffect(() => {
    const on = () => document.hidden && setPhase((p) => (p === 'playing' ? 'paused' : p));
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // Arrow keys / WASD on a laptop.
  useEffect(() => {
    const keys: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    const on = (e: KeyboardEvent) => {
      const d = keys[e.key];
      if (d && phase === 'playing') {
        e.preventDefault();
        go(d);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [phase, go]);

  // Game over: record the score once.
  useEffect(() => {
    if (phase !== 'playing' || game.alive) return;
    setPhase('over');
    trackSnake(game.score);
    const isBest = usePhone.getState().recordSnake(game.score);
    let relaxed = 0;
    const { life, apply } = useGame.getState();
    const week = `${life.month}:${life.week}`;
    if (game.score > 0 && usePhone.getState().relaxedWeek !== week) {
      const out = lifeApi.applyEffects(life, { sanity: RELAX_SANITY });
      apply(out);
      usePhone.getState().markRelaxed(week);
      relaxed = out.delta.sanity;
    }
    setResult({ best: isBest, relaxed });
  }, [game.alive, game.score, phase]);

  const start = () => {
    const r = round + 1;
    setRound(r);
    setGame(createSnake(r));
    setResult(null);
    setPhase('playing');
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s || phase !== 'playing') return;
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };

  const cells = game.size;
  const pad = (d: Dir, label: string, path: string) => (
    <button className={`sn-pad sn-${d}`} onClick={() => go(d)} aria-label={tr(label)} disabled={phase !== 'playing'}>
      <svg viewBox="0 0 7 7" width="24" height="24" aria-hidden="true" shapeRendering="crispEdges">
        <path fill="currentColor" d={path} />
      </svg>
    </button>
  );

  return (
    <div className="sn">
      <div className="sn-top">
        <span>{tr('phone.snake.score', { n: game.score })}</span>
        <span>{tr('phone.snake.best', { n: best })}</span>
        {(phase === 'playing' || phase === 'paused') && (
          <button className="sn-pause" onClick={() => setPhase((p) => (p === 'playing' ? 'paused' : 'playing'))}>
            {tr(phase === 'playing' ? 'phone.snake.pause' : 'phone.snake.resume')}
          </button>
        )}
      </div>

      <div
        className="sn-board"
        style={{ gridTemplateColumns: `repeat(${cells}, 1fr)`, gridTemplateRows: `repeat(${cells}, 1fr)` }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="img"
        aria-label={tr('phone.snake.score', { n: game.score })}
      >
        {game.body.map((c, i) => (
          <span key={`${c.x},${c.y},${i}`} className={`sn-cell ${i === 0 ? 'is-head' : 'is-body'}`} style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }} />
        ))}
        <span className="sn-cell is-food" style={{ gridColumn: game.food.x + 1, gridRow: game.food.y + 1 }} />

        {phase !== 'playing' && phase !== 'paused' && (
          <div className="sn-overlay">
            {phase === 'over' && <p className="sn-over">{tr('phone.snake.over')}</p>}
            {phase === 'over' && result?.best && <p className="sn-best">{tr('phone.snake.new_best')}</p>}
            {phase === 'over' && result && result.relaxed > 0 && <p className="sn-relax">{tr('phone.snake.relaxed', { n: result.relaxed })}</p>}
            {phase === 'ready' && <p>{tr('phone.snake.how')}</p>}
            <button className="k-btn is-primary sn-start" onClick={start}>
              {tr(phase === 'over' ? 'phone.snake.again' : 'phone.snake.start')}
            </button>
          </div>
        )}
      </div>

      <div className="sn-pads">
        {pad('up', 'phone.snake.up', 'M3 1h1v1H3zM2 2h3v1H2zM1 3h5v1H1zM0 4h7v1H0z')}
        {pad('left', 'phone.snake.left', 'M1 3h1v1H1zM2 2h1v3H2zM3 1h1v5H3zM4 0h1v7H4z')}
        {pad('right', 'phone.snake.right', 'M5 3h1v1H5zM4 2h1v3H4zM3 1h1v5H3zM2 0h1v7H2z')}
        {pad('down', 'phone.snake.down', 'M3 5h1v1H3zM2 4h3v1H2zM1 3h5v1H1zM0 2h7v1H0z')}
      </div>
    </div>
  );
}
