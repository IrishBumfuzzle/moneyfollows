import type { JarId } from '@paisa/shared';

// 8x8 pixel icons for choices and jars, drawn as SVG rects like life/PixelIcon (emoji fonts vary
// or are missing on cheap Android). Content names a choice icon by word ("piggy", "bus"); an
// unknown word falls back to a coin, so new content never breaks the scene.
const PAL: Record<string, string> = {
  k: '#4a2b17', // outline
  y: '#f2c230', // gold
  o: '#c98a1b', // gold shade
  r: '#d64545', // red
  p: '#f08a8a', // pink
  v: '#6a5acd', // purple
  w: '#fff3dc', // cream
  b: '#a0603a', // brown
  g: '#3d4a5c', // dark grey
  n: '#7fd1c7', // glass
  t: '#2a8a8a', // teal
  e: '#3f9a4a', // green
  s: '#b97a56', // skin
};

const ICONS: Record<string, readonly string[]> = {
  coins: ['........', '..kkkk..', '.kyyyyk.', '.kooook.', '.kyyyyk.', '.kooook.', '.kyyyyk.', '..kkkk..'],
  piggy: ['..kkkk..', '.kppppk.', 'kpkppppk', 'kppppppk', 'kppppprk', '.kppppk.', '.kk..kk.', '........'],
  wait: ['kkkkkkkk', '.kwwwwk.', '..kyyk..', '...kk...', '...kk...', '..kwwk..', '.kyyyyk.', 'kkkkkkkk'],
  shield: ['.kkkkkk.', 'kttttttk', 'kttwwttk', 'kttwwttk', 'kttttttk', '.kttttk.', '..kttk..', '...kk...'],
  book: ['.kkkkkk.', 'kvvvvvwk', 'kvvvvvwk', 'kvvvvvwk', 'kvvvvvwk', 'kvvvvvwk', 'kkkkkkwk', '.kkkkkk.'],
  chart: ['k.......', 'k.....y.', 'k.....y.', 'k...y.y.', 'k...y.y.', 'k.y.y.y.', 'k.y.y.y.', 'kkkkkkkk'],
  rocket: ['...kk...', '..kwwk..', '..kwnk..', '..kwwk..', '.kkwwkk.', '.krwwrk.', '..kyyk..', '...yy...'],
  basket: ['..k..k..', '.k....k.', 'kkkkkkkk', 'kbobobok', 'kbobobok', '.kbbbbk.', '.kkkkkk.', '........'],
  loan: ['.kkkkk..', '.kwwwkk.', '.kwkkwk.', '.kwwwwk.', '.kwkkwk.', '.kwwwwk.', '.kwwrwk.', '.kkkkkk.'],
  message: ['kkkkkkkk', 'kwwwwwwk', 'kwkkkkwk', 'kwwwwwwk', 'kwkkkwwk', 'kwwwwwwk', 'kkkkkkkk', '.kk.....'],
  share: ['..kkkk..', '.kssssk.', '.ksksk..', '.kssssk.', '..kkkk..', '.kttttk.', 'kttyyttk', 'kttyyttk'],
  food: ['........', '..y.y...', '.y.y.y..', '........', 'kkkkkkkk', 'kwwwwwwk', '.kwwwwk.', '..kkkk..'],
  festival: ['...y....', '...yo...', '...r....', '........', 'kbbbbbbk', '.kbbbbk.', '..kkkk..', '........'],
  gift: ['..r..r..', '...rr...', 'kkkrrkkk', 'kvvrrvvk', 'kkkrrkkk', 'kvvrrvvk', 'kvvrrvvk', 'kkkkkkkk'],
  bus: ['.kkkkkk.', 'kyyyyyyk', 'knnynnyk', 'knnynnyk', 'kyyyyyyk', 'kyyyyyyk', 'kkkkkkkk', '.kk..kk.'],
  auto: ['..kkkk..', '.keeeek.', 'kennneek', 'kenneeek', 'keeeeeek', 'kkkkkkkk', '.kk...kk', '........'],
  bike: ['......k.', '..kkkkk.', '...k.k..', '.kkk.kkk', 'k..kk..k', 'k..k...k', '.kk...kk', '........'],
  phone: ['.kkkkkk.', '.kggggk.', '.knnnnk.', '.knnnnk.', '.knnnnk.', '.knnnnk.', '.kggwgk.', '.kkkkkk.'],
  headphones: ['..kkkk..', '.kggggk.', 'kg....gk', 'kg....gk', 'kvk..kvk', 'kvk..kvk', 'kvk..kvk', '.k....k.'],
  house: ['...kk...', '..krrk..', '.krrrrk.', 'krrrrrrk', '.kwwwwk.', '.kwbbwk.', '.kwbbwk.', '.kkkkkk.'],
  flag: ['kkkkkk..', 'kvvvvvk.', 'kvvvvvvk', 'kvvvvvk.', 'kkkkkk..', 'k.......', 'k.......', 'k.......'],
  star: ['...kk...', '...yy...', 'kkkyykkk', '.kyyyyk.', '..kyyk..', '.kykkyk.', '.kk..kk.', '........'],
  back: ['...kk...', '..kyk...', '.kyyk...', 'kyyyykkk', '.kyyyyyk', '..kyyyyk', '...kkkk.', '........'],
};

/** True when a content icon word has its own sprite (else it draws as a coin). */
export const hasIcon = (name: string) => name in ICONS;

export function Icon({ name, size = 24 }: { name: string | undefined; size?: number }) {
  const rows = (name && ICONS[name]) || ICONS.coins!;
  return (
    <svg className="dc-px" viewBox="0 0 8 8" width={size} height={size} aria-hidden="true" shapeRendering="crispEdges">
      {rows.flatMap((row, y) =>
        [...row].map((c, x) => (c === '.' ? null : <rect key={`${x},${y}`} x={x} y={y} width="1" height="1" fill={PAL[c]} />)),
      )}
    </svg>
  );
}

/** Each jar's icon; the colour lives in decisions.css (.dc-jar.is-<jar>). Never colour alone. */
export const JAR_ICON: Record<JarId, string> = { needs: 'house', wants: 'headphones', goals: 'flag', savings: 'piggy' };
