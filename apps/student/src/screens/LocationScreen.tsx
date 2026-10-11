import { useEffect, useState } from 'react';
import type { Lang } from '@paisa/shared';
import { t } from '../features/decisions/content';
import '../features/decisions/decisions.css';
import { PixelText } from '../PixelText';
import { LeafGust, WorldLife } from './WorldLife';

// Backdrop: public/assets/world.png (1920x1280, a 16px-tile town from the Kenney RPG Urban Kit, built by
// tools/build-world.py) is pure scenery; the five buildings are drawn over it at fixed pixel positions. The camera only ever scales
// by whole numbers (like a tile RPG), so bigger screens just see more of the world.
const WORLD = { w: 1920, h: 1280 };
const STAGE = { w: 352, h: 380 };
const ORIGIN = { x: (WORLD.w - STAGE.w) / 2, y: (WORLD.h - STAGE.h) / 2 };
const FOCUS = { x: ORIGIN.x + 176, y: ORIGIN.y + 190, w: 352, h: 380 }; // this area must always fit on screen
const MAX_ZOOM = 3;
const SPRITE_PAD = 4;
const HOUSE = { w: 80 + 2 * SPRITE_PAD };

// The meters bar (money, health, sanity) covers the top of the screen; the play area is centred in
// the space below it, so no building sits under the bar.
const TOP_BAR = 88;

function useCamera() {
  const read = () => {
    const vw = window.innerWidth, vh = window.innerHeight - TOP_BAR;
    const zoom = Math.min(MAX_ZOOM, Math.max(1, Math.floor(Math.min(vw / FOCUS.w, vh / FOCUS.h))));
    return { zoom, x: Math.round(vw / 2 - zoom * FOCUS.x), y: Math.round(TOP_BAR + vh / 2 - zoom * FOCUS.y) };
  };
  const [cam, setCam] = useState(read);
  useEffect(() => {
    const on = () => setCam(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return cam;
}

export type LocationId = 'school' | 'hospital' | 'convenience' | 'home' | 'bank';

// x/y: top-left of the building in play-area pixels: the lots tools/build-world.py prints. Two rows
// facing the main streets, all inside the 352x380 play area so a 360 px phone sees every building:
// Home, School and Shop on top; Bank and Hospital below, with a little park and fountain between.
// `label` is only the English fallback: the map shows the t:place.<id> name in the player's language.
const LOCATIONS: { id: LocationId; label: string; x: number; y: number }[] = [
  { id: 'home', label: 'Home', x: 16, y: 14 },
  { id: 'school', label: 'School', x: 128, y: 14 },
  { id: 'convenience', label: 'Convenience Store', x: 256, y: 14 },
  { id: 'bank', label: 'Bank', x: 16, y: 190 },
  { id: 'hospital', label: 'Hospital', x: 256, y: 190 },
];

/**
 * The neighbourhood map. `pinned` places hold this week's decisions and glow; `guide` (the
 * first pin, for a first-time player) gets a bobbing "Start here" arrow.
 */
export function LocationScreen({ lang, pinned = [], guide, onSelect }: {
  lang: Lang;
  pinned?: readonly string[];
  guide?: string;
  onSelect: (id: LocationId) => void;
}) {
  const cam = useCamera();
  const name = (l: (typeof LOCATIONS)[number]) => {
    const s = t(lang, `t:place.${l.id}`);
    return s === `place.${l.id}` ? l.label : s;
  };
  return (
    <div className="screen">
      <div
        className="world"
        style={{ width: WORLD.w, height: WORLD.h, transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` }}
      >
        <WorldLife />
        {LOCATIONS.map((l) => (
          <button
            key={l.id}
            className={`loc ${pinned.includes(l.id) ? 'is-pinned' : ''}`}
            aria-label={pinned.includes(l.id) ? `${name(l)} · ${t(lang, 'dec.pin')}` : name(l)}
            onClick={() => onSelect(l.id)}
            style={{ left: ORIGIN.x + l.x - SPRITE_PAD, top: ORIGIN.y + l.y - SPRITE_PAD, width: HOUSE.w }}
          >
            <span className="stack">
              <img className="halo halo-outline" src={`/assets/buildings/${l.id}-outline.png`} alt="" />
              <img className="halo halo-hover" src={`/assets/buildings/${l.id}-hover.png`} alt="" />
              <img className="halo halo-active" src={`/assets/buildings/${l.id}-active.png`} alt="" />
              <img src={`/assets/buildings/${l.id}.png`} alt="" />
              {pinned.includes(l.id) && <span className="loc-pin" aria-hidden="true">!</span>}
              {guide === l.id && <span className="loc-guide" aria-hidden="true">{t(lang, 'dec.guide')}</span>}
            </span>
            <PixelText text={name(l)} size={16} scale={1} maxWidth={130} />
          </button>
        ))}
      </div>
      <LeafGust />
    </div>
  );
}
