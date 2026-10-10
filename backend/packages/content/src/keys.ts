/** Every "t:" key used anywhere inside a content item, without the prefix, in first-seen order. */
export function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    if (value.startsWith('t:')) out.add(value.slice(2));
  } else if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectKeys(v, out);
  }
  return out;
}
