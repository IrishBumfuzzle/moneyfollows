import type { Projection } from '@paisa/shared';

export interface GrowthLabels {
  low: string;
  avg: string;
  high: string;
  /** The chart's accessible summary, e.g. "After 10 years: ₹73,000 to ₹1,15,000". */
  summary: string;
}

const W = 320;
const H = 160;
const PAD = { l: 4, r: 4, t: 8, b: 4 };

/**
 * The Time Machine chart (CLAUDE.md 6: GrowthChart): the low-to-high band over the years with
 * the average line inside it, and the three end values below. Never a single number (5.4).
 * `format` turns rupees into display text.
 */
export function GrowthChart({ projection, labels, format }: {
  projection: Projection;
  labels: GrowthLabels;
  format: (rupees: number) => string;
}) {
  const n = projection.avg.length - 1;
  const top = Math.max(1, ...projection.high);
  const x = (i: number) => PAD.l + (n === 0 ? 0 : (i / n) * (W - PAD.l - PAD.r));
  const y = (v: number) => H - PAD.b - (v / top) * (H - PAD.t - PAD.b);
  const line = (vs: number[]) => vs.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const band =
    line(projection.high) +
    projection.low
      .map((v, i) => [i, v] as const)
      .reverse()
      .map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join('') +
    'Z';
  const end = { low: projection.low[n] ?? 0, avg: projection.avg[n] ?? 0, high: projection.high[n] ?? 0 };

  return (
    <figure className="tm-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={labels.summary} preserveAspectRatio="none">
        <line className="tm-axis" x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} />
        <path className="tm-band" d={band} />
        <path className="tm-line is-low" d={line(projection.low)} />
        <path className="tm-line is-high" d={line(projection.high)} />
        <path className="tm-line is-avg" d={line(projection.avg)} />
      </svg>
      <ul className="tm-legend">
        <li className="is-high"><span className="tm-key" aria-hidden="true" />{labels.high}<b>{format(end.high)}</b></li>
        <li className="is-avg"><span className="tm-key" aria-hidden="true" />{labels.avg}<b>{format(end.avg)}</b></li>
        <li className="is-low"><span className="tm-key" aria-hidden="true" />{labels.low}<b>{format(end.low)}</b></li>
      </ul>
    </figure>
  );
}
