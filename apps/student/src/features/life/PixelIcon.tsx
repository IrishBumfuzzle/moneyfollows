import type { IconId } from './types';

// 8x8 pixel-art icons drawn as SVG rects, so they look the same on every phone (emoji fonts
// vary or are missing on cheap Android). Each row is 8 chars; a char picks a colour from PAL,
// '.' is transparent.
const PAL: Record<string, string> = {
  k: '#4a2b17', // outline
  y: '#f2c230', // gold
  o: '#c98a1b', // gold shade
  r: '#d64545', // red
  p: '#f08a8a', // red light
  v: '#6a5acd', // purple
  w: '#fff3dc', // cream
  b: '#a0603a', // sack
  g: '#3d4a5c', // dark grey
};

const ICONS: Record<IconId, readonly string[]> = {
  coin: ['..kkkk..', '.kyyyyk.', 'kyywwyok', 'kyywyyok', 'kyyyyyok', 'kyyyyook', '.kooook.', '..kkkk..'],
  heart: ['........', '.kk..kk.', 'kprkkrrk', 'kprrrrrk', 'krrrrrrk', '.krrrrk.', '..krrk..', '...kk...'],
  smile: ['..kkkk..', '.kyyyyk.', 'kykyykyk', 'kyyyyyyk', 'kykyykyk', 'kyykkyyk', '.kyyyyk.', '..kkkk..'],
  sack: ['..kkkk..', '...kk...', '..kbbk..', '.kbwwbk.', 'kbwwwwbk', 'kbbwwbbk', 'kbbbbbbk', '.kkkkkk.'],
  headphones: ['..kkkk..', '.kggggk.', 'kg....gk', 'kg....gk', 'kvk..kvk', 'kvk..kvk', 'kvk..kvk', '.k....k.'],
};

export function PixelIcon({ id, size = 16 }: { id: IconId; size?: number }) {
  return (
    <svg className="lf-px" viewBox="0 0 8 8" width={size} height={size} aria-hidden="true" shapeRendering="crispEdges">
      {ICONS[id].flatMap((row, y) =>
        [...row].map((c, x) => (c === '.' ? null : <rect key={`${x},${y}`} x={x} y={y} width="1" height="1" fill={PAL[c]} />)),
      )}
    </svg>
  );
}
