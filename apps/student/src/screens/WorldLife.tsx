import { memo } from 'react';
import life from './worldLife.json';
import './worldLife.css';

// The map's living layer, drawn in world pixels under the buildings: the trees near the play area
// sway, cars drive the streets around it (keeping left), and now and then a gust of leaves blows
// across the top of the screen. Positions come from tools/build-world.py (worldLife.json). Pure CSS
// animation on transforms only; all of it stops for reduced motion and data saver (worldLife.css).

type Dir = 's' | 'n' | 'e' | 'w';
interface Car {
  dir: Dir;
  pos: number; // the lane: x for a north/south street, y for an east/west one (world px)
  car: number;
  secs: number;
  delay: number;
}

const [WW, WH] = life.world as [number, number];
const trees = life.trees as [string, number, number][];
const cars = life.cars as Car[];

/** Trees and cars, inside the camera's world div (so they pan and zoom with it). */
export const WorldLife = memo(function WorldLife() {
  return (
    <div className="wl" aria-hidden="true">
      {trees.map(([name, x, y], i) => (
        <img
          key={i}
          className={`wl-tree is-${name}`}
          src={`/assets/life/${name}.png`}
          alt=""
          // Each tree starts somewhere else in its sway, so the wind ripples instead of marching.
          style={{ left: x, top: y, animationDelay: `${-((x * 7 + y * 3) % 2600)}ms` }}
        />
      ))}
      {cars.map((c, i) => {
        const vertical = c.dir === 'n' || c.dir === 's';
        return (
          <img
            key={`car${i}`}
            className={`wl-car is-${c.dir}`}
            src={`/assets/life/car-${c.car}-${c.dir}.png`}
            alt=""
            style={{
              ...(vertical ? { left: c.pos, top: 0 } : { left: 0, top: c.pos }),
              ['--wl-span' as string]: `${vertical ? WH : WW}px`,
              animationDuration: `${c.secs}s`,
              animationDelay: `${c.delay}s`,
            }}
          />
        );
      })}
    </div>
  );
});

const LEAVES = [
  { top: 96, delay: 0, color: 'green' },
  { top: 132, delay: 0.5, color: 'gold' },
  { top: 112, delay: 1.1, color: 'green' },
  { top: 160, delay: 1.6, color: 'green' },
  { top: 104, delay: 2.2, color: 'gold' },
  { top: 146, delay: 2.9, color: 'green' },
];

/** A gust of leaves across the top of the screen (screen pixels, over the map, under the UI). */
export function LeafGust() {
  return (
    <div className="wl-gust" aria-hidden="true">
      {LEAVES.map((l, i) => (
        <span key={i} className="wl-leaf" style={{ top: l.top, animationDelay: `${l.delay}s` }}>
          <img src={`/assets/life/leaf-${l.color}.png`} alt="" style={{ animationDelay: `${-i * 0.3}s` }} />
        </span>
      ))}
    </div>
  );
}
