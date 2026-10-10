/** FNV-1a 32-bit over the UTF-16 code units of the parts, joined by a NUL so ("ab","c") differs from ("a","bc"). */
export function hashSeed(...parts: string[]): number {
  let h = 0x811c9dc5;
  const text = parts.join('\u0000');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
