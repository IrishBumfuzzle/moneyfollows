import { Bar, BarChart, CartesianGrid, Legend, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Lang } from '../../i18n';
import { formatPct } from '../../format';
import { t } from './content';
import { chartData, wrapLabel, type GainRow } from './gains';
import { useMedia } from './useMedia';

// Recharts needs literal colours; these mirror --baseline, --endline, --line and --ink in styles.css.
const COLOR = { baseline: '#8a7e6b', endline: '#2b1b3d', grid: '#e4dccb', ink: '#23201b' };
const TICKS = [0, 25, 50, 75, 100];
const NARROW_TICKS = [0, 50, 100]; // five 16 px labels would overlap on a 110 px axis
const LINE_HEIGHT = 20;
// 16 px like the rest of the dashboard (CLAUDE.md 6); pillar names wrap at 11 characters so they still fit at 360 px.
const FONT_SIZE = 16;
const WRAP_CHARS = 11;
const TICK_FONT = { fontSize: FONT_SIZE, fill: COLOR.ink };

/** Axis label split over lines (SVG text does not wrap); sits under a column or left of a row. */
function PillarTick({ x, y, label, vertical }: { x: number; y: number; label: string; vertical: boolean }) {
  const lines = wrapLabel(label, WRAP_CHARS);
  const top = vertical ? y - ((lines.length - 1) * LINE_HEIGHT) / 2 : y + 12;
  return (
    <text
      x={vertical ? x - 8 : x}
      y={top}
      textAnchor={vertical ? 'end' : 'middle'}
      dominantBaseline="middle"
      {...TICK_FONT}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={vertical ? x - 8 : x} dy={i === 0 ? 0 : LINE_HEIGHT}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

const pctLabel = (v: unknown) => (typeof v === 'number' ? formatPct(v) : '');

/**
 * Grouped bars: baseline next to end-line for each pillar, 0–100%. On a narrow screen the bars
 * run sideways so the pillar names have room to the left.
 */
export default function GainsChart({ rows, lang }: { rows: readonly GainRow[]; lang: Lang }) {
  const narrow = useMedia('(max-width: 600px)');
  const data = chartData(rows).map((d) => ({ ...d, name: t(lang, `pillar.${d.pillar}`) }));
  const ticks = narrow ? NARROW_TICKS : TICKS;
  const axisLabel = { value: t(lang, 'chart.axis'), fill: COLOR.ink, fontSize: FONT_SIZE };

  return (
    <ResponsiveContainer width="100%" height={narrow ? 440 : 380}>
      <BarChart
        data={data}
        layout={narrow ? 'vertical' : 'horizontal'}
        margin={{ top: 24, right: narrow ? 48 : 16, bottom: 8, left: 8 }}
        barGap={4}
        accessibilityLayer={false} // the wrapper is an image with a text alternative and a table
      >
        <CartesianGrid stroke={COLOR.grid} vertical={narrow} horizontal={!narrow} />
        {narrow ? (
          <>
            <XAxis
              type="number"
              domain={[0, 100]}
              ticks={ticks}
              tickFormatter={(v: number) => `${v}%`}
              tick={TICK_FONT}
              label={{ ...axisLabel, position: 'insideBottom', offset: 0 }}
              height={64}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={112}
              interval={0}
              tick={(p) => <PillarTick x={Number(p.x)} y={Number(p.y)} label={String(p.payload.value)} vertical />}
            />
          </>
        ) : (
          <>
            <XAxis
              type="category"
              dataKey="name"
              interval={0}
              height={80}
              tick={(p) => (
                <PillarTick x={Number(p.x)} y={Number(p.y)} label={String(p.payload.value)} vertical={false} />
              )}
            />
            <YAxis
              type="number"
              domain={[0, 100]}
              ticks={ticks}
              tickFormatter={(v: number) => `${v}%`}
              tick={TICK_FONT}
              width={72}
              label={{ ...axisLabel, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
            />
          </>
        )}
        <Tooltip
          isAnimationActive={false}
          formatter={(v) => (typeof v === 'number' ? formatPct(v) : '–')}
          cursor={{ fill: 'rgb(232 150 12 / 12%)' }}
        />
        <Legend
          iconType="square"
          verticalAlign={narrow ? 'top' : 'bottom'}
          itemSorter={null} // keep bar order (baseline first); the default sorts by name, which flips in Hindi
          wrapperStyle={{ fontSize: 16 }}
          formatter={(name) => <span style={{ color: COLOR.ink }}>{name}</span>}
        />
        <Bar
          dataKey="baseline"
          name={t(lang, 'chart.baseline')}
          fill={COLOR.baseline}
          maxBarSize={40}
          isAnimationActive={false} // staff dashboard: no motion, numbers show at once
        >
          <LabelList
            dataKey="baseline"
            position={narrow ? 'right' : 'top'}
            formatter={pctLabel}
            fill={COLOR.ink}
            fontSize={FONT_SIZE}
          />
        </Bar>
        <Bar
          dataKey="endline"
          name={t(lang, 'chart.endline')}
          fill={COLOR.endline}
          maxBarSize={40}
          isAnimationActive={false} // staff dashboard: no motion, numbers show at once
        >
          <LabelList
            dataKey="endline"
            position={narrow ? 'right' : 'top'}
            formatter={pctLabel}
            fill={COLOR.ink}
            fontSize={FONT_SIZE}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
