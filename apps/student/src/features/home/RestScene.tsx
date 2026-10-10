import { useEffect, useRef, useState } from 'react';
import type { LifeDelta } from '../life/types';
import { t } from './content';
import type { Lang } from './content';
import '../../design/kenney.css';
import '../life/life.css';
import './home.css';

// A 56x48 pixel bedroom drawn as SVG rects (scaled 6x), like PixelIcon: Ammi walks in, pulls
// the blanket up over the player, the lamp goes out and the Zzz float. Then the new day.
// Reduced motion or data saver show the last frame straight away.
const PAL: Record<string, string> = {
  k: '#1a1020', // outline
  h: '#2a1a10', // hair
  s: '#b97a56', // skin
  m: '#a8326e', // Ammi's sari
  g: '#e8b04a', // sari border
};

// Ammi, 10 wide x 24 tall: bun, face, sari with a gold border.
const AMMI = [
  '...hhh....',
  '..hhhhh...',
  '..hssssh..',
  '..hsksh...',
  '..hssssh..',
  '...ssss...',
  '....ss....',
  '..mmmmgm..',
  '.mmmmmgmm.',
  '.mmmmmgmm.',
  '.smmmmgms.',
  '.smmmmgms.',
  '.smmmmgms.',
  '..mmmmgm..',
  '..mmmmgmm.',
  '..mmmmmgm.',
  '..mmmmmgm.',
  '..mmmmmmg.',
  '.mmmmmmmg.',
  '.mmmmmmmg.',
  '.mmmmmmmmg',
  '.mmmmmmmmg',
  '.ggggggggg',
  '..ss..ss..',
];

// The player's head on the pillow, 5x5, eyes shut.
const CHILD = ['.hhh.', 'hhhss', 'hhsks', 'hhsss', '.hss.'];

function Sprite({ rows, x, y }: { rows: readonly string[]; x: number; y: number }) {
  return (
    <>
      {rows.flatMap((row, j) =>
        [...row].map((c, i) =>
          c === '.' ? null : <rect key={`${i},${j}`} x={x + i} y={y + j} width="1" height="1" fill={PAL[c]} />,
        ),
      )}
    </>
  );
}

const still = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
  document.documentElement.hasAttribute('data-saver');

/** How long the tuck-in plays before the morning card shows. */
const SCENE_MS = 3800;

export function RestScene({ lang, day, week, month, delta, onWake }: {
  lang: Lang;
  /** The new day, after resting. */
  day: number;
  week: number;
  month: number;
  /** What resting changed (after clamping). */
  delta: LifeDelta;
  onWake: () => void;
}) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const [skip, setSkip] = useState(still);
  const [morning, setMorning] = useState(skip);
  const wakeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (morning) return;
    const id = window.setTimeout(() => setMorning(true), SCENE_MS);
    return () => window.clearTimeout(id);
  }, [morning]);

  useEffect(() => {
    if (morning) wakeRef.current?.focus();
  }, [morning]);

  return (
    <div className="rs-screen" lang={lang}>
      <svg
        className={`rs-scene ${skip ? 'is-still' : ''}`}
        viewBox="0 0 56 48"
        width="336"
        height="288"
        shapeRendering="crispEdges"
        role="img"
        aria-label={tr('rest.scene')}
      >
        {/* wall, floor boards */}
        <rect x="0" y="0" width="56" height="34" fill="#2b2f5a" />
        <rect x="0" y="34" width="56" height="14" fill="#4a3550" />
        <rect x="0" y="38" width="56" height="1" fill="#3b2a42" />
        <rect x="0" y="43" width="56" height="1" fill="#3b2a42" />
        {/* window with the moon and two stars */}
        <rect x="4" y="5" width="13" height="11" fill="#8a6a4a" />
        <rect x="5" y="6" width="11" height="9" fill="#141838" />
        <rect x="10" y="6" width="1" height="9" fill="#8a6a4a" />
        <rect x="12" y="7" width="3" height="3" fill="#f2e6a0" />
        <rect x="13" y="7" width="2" height="2" fill="#141838" />
        <rect x="6" y="8" width="1" height="1" fill="#fff3dc" />
        <rect x="8" y="12" width="1" height="1" fill="#fff3dc" />
        {/* side table and lamp */}
        <rect x="48" y="28" width="6" height="6" fill="#6b4226" />
        <rect x="50" y="24" width="2" height="4" fill="#3d2a1a" />
        <rect x="48" y="20" width="6" height="4" fill="#ffd76a" className="rs-lamp" />
        <rect x="44" y="18" width="12" height="16" fill="#ffd76a" fillOpacity="0.15" className="rs-glow" />
        {/* bed: headboard, legs, frame, mattress, pillow */}
        <rect x="20" y="22" width="2" height="14" fill="#6b4226" />
        <rect x="22" y="34" width="1" height="2" fill="#6b4226" />
        <rect x="49" y="34" width="1" height="2" fill="#6b4226" />
        <rect x="22" y="32" width="28" height="2" fill="#6b4226" />
        <rect x="22" y="29" width="28" height="3" fill="#e8e0d0" />
        <rect x="22" y="26" width="6" height="3" fill="#fff8ec" />
        {/* the player: head on the pillow, body under the blanket */}
        <Sprite rows={CHILD} x={23} y={24} />
        <rect x="28" y="27" width="20" height="2" fill="#3f7f6b" />
        <g className="rs-blanket">
          <rect x="27" y="26" width="22" height="5" fill="#c0392b" />
          <rect x="27" y="26" width="22" height="1" fill="#e8b04a" />
          <rect x="33" y="27" width="1" height="4" fill="#e8b04a" />
          <rect x="40" y="27" width="1" height="4" fill="#e8b04a" />
        </g>
        {/* Ammi, and her arm reaching for the blanket */}
        <g className="rs-ammi">
          <Sprite rows={AMMI} x={9} y={22} />
          <rect className="rs-arm" x="19" y="32" width="8" height="1" fill={PAL.s} />
        </g>
        {/* the lamp goes out */}
        <rect className="rs-dark" x="0" y="0" width="56" height="48" fill="#05040f" />
        <g className="rs-zzz" fill="#fff3dc">
          <text x="30" y="20" fontSize="5">z</text>
          <text x="34" y="15" fontSize="6">z</text>
          <text x="39" y="9" fontSize="7">z</text>
        </g>
      </svg>

      {morning ? (
        <div className="k-panel rs-card" role="status">
          <h1 className="rs-morning">{tr('rest.morning')}</h1>
          <p className="rs-day">{tr('rest.day', { day, week, month })}</p>
          {day === 1 && <p>{tr('rest.new_week')}</p>}
          <p>{tr('rest.gained', { sanity: delta.sanity, health: delta.health })}</p>
          <button ref={wakeRef} className="k-btn is-primary rs-wake" onClick={onWake}>
            {tr('rest.wake')}
          </button>
        </div>
      ) : (
        <div className="rs-caption">
          <p>{tr('rest.ammi')}</p>
          <button
            className="k-btn rs-skip"
            onClick={() => {
              setSkip(true);
              setMorning(true);
            }}
          >
            {tr('rest.skip')}
          </button>
        </div>
      )}
    </div>
  );
}
