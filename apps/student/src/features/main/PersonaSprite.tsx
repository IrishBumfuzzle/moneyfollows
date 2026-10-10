import type { PersonaId } from '../onboarding/types';

// Placeholder pixel sprites (12x16) of each persona sitting, drawn as SVG rects; two frames for
// a breathing idle loop. Real art replaces this file. Each row is 12 chars; '.' is transparent.
const PAL: Record<string, string> = {
  k: '#2b1b17', // outline / hair
  s: '#b97a56', // skin
  w: '#fff3dc', // eyes
  p: '#c2477a', // Sana's kurta
  d: '#f2c230', // Sana's dupatta
  b: '#3a6ea5', // Ravi's shirt
  c: '#e8960c', // Ravi's cap
  j: '#3d4a5c', // trousers
};

const SANA = [
  '....kkkk....',
  '...kkkkkk...',
  '..kksssskk..',
  '..kswsswsk..',
  '..kkssssk...',
  '...kssssk...',
  '..ddpppppd..',
  '.kdpppppdpk.',
  '.kspppppdsk.',
  '.ksppppppsk.',
  '..kpppppppk.',
  '..kjjjjjjjk.',
  '..kjjjjjjjk.',
  '..kjjk.kjjk.',
  '..kssk.kssk.',
  '..kkkk.kkkk.',
];

const RAVI = [
  '....cccc....',
  '...cccccccc.',
  '..kkssssk...',
  '..kswsswsk..',
  '..kkssssk...',
  '...kssssk...',
  '..bbbbbbbb..',
  '.kbbbbbbbbk.',
  '.ksbbbbbbsk.',
  '.ksbbbbbbsk.',
  '..kbbbbbbk..',
  '..kjjjjjjjk.',
  '..kjjjjjjjk.',
  '..kjjk.kjjk.',
  '..kssk.kssk.',
  '..kkkk.kkkk.',
];

export function PersonaSprite({ persona, size = 120 }: { persona: PersonaId; size?: number }) {
  const rows = persona === 'ravi' ? RAVI : SANA;
  return (
    <svg className="ms-sprite" viewBox="0 0 12 16" width={(size * 12) / 16} height={size} aria-hidden="true" shapeRendering="crispEdges">
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === '.' ? null : <rect key={`${x},${y}`} x={x} y={y} width="1" height="1" fill={PAL[ch]} />)),
      )}
    </svg>
  );
}
