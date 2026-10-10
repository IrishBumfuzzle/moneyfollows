import { useEffect, useRef } from 'react';

// Rasterises text at low resolution (hard 1-bit edges) and scales it up with
// nearest-neighbour, so any script (Latin, Devanagari, Telugu) looks pixelated
// while still being shaped correctly by the browser.
const FONT = '"Pixelify Sans","Noto Sans Devanagari","Noto Sans Telugu",sans-serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ').filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && ctx.measureText(next).width > maxWidth) { lines.push(cur); cur = word; } else cur = next;
  }
  return cur ? [...lines, cur] : lines;
}

function layer(lines: string[], lineH: number, font: string, w: number, h: number, y: number, color: string, dx: number, dy: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.font = font;
  ctx.fillStyle = color;
  lines.forEach((t, i) => ctx.fillText(t, 1 + dx, y + dy + i * lineH));
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= 128 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
  return c;
}

export function PixelText({ text, size = 12, scale = 2, color = '#fff', outline = '#2b1b3d', maxWidth = 80 }: {
  text: string; size?: number; scale?: number; color?: string; outline?: string; maxWidth?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let dead = false;
    const font = `${size}px ${FONT}`;
    const draw = () => {
      const cv = ref.current;
      if (dead || !cv) return;
      const probe = cv.getContext('2d')!;
      probe.font = font;
      const lines = wrap(probe, text, maxWidth);
      const lineH = Math.ceil(size * 1.25);
      const w = Math.ceil(Math.max(...lines.map((t) => probe.measureText(t).width))) + 3;
      const h = lineH * lines.length + Math.ceil(size * 0.4) + 2;
      const y = Math.round(size * 1.15);
      cv.width = w;
      cv.height = h;
      cv.style.width = `${w * scale}px`;
      cv.style.height = `${h * scale}px`;
      const ctx = cv.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(layer(lines, lineH, font, w, h, y, outline, dx, dy), 0, 0);
      ctx.drawImage(layer(lines, lineH, font, w, h, y, color, 0, 0), 0, 0);
    };
    document.fonts.load(font, text).then(draw, draw);
    return () => { dead = true; };
  }, [text, size, scale, color, outline, maxWidth]);

  return <canvas ref={ref} aria-hidden="true" style={{ imageRendering: 'pixelated' }} />;
}
