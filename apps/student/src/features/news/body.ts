// Splits article text into plain text and [[termId]] glossary words.

export type Segment = { kind: 'text'; text: string } | { kind: 'term'; termId: string };

export function parseBody(body: string): Segment[] {
  const out: Segment[] = [];
  const re = /\[\[([A-Za-z0-9_]+)\]\]/g;
  let at = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (m.index > at) out.push({ kind: 'text', text: body.slice(at, m.index) });
    out.push({ kind: 'term', termId: m[1] });
    at = m.index + m[0].length;
  }
  if (at < body.length) out.push({ kind: 'text', text: body.slice(at) });
  return out;
}
