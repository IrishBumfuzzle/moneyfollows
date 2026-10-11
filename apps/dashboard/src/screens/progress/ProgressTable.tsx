import type { ClassProgressRow } from '@paisa/shared';
import { formatDate, formatNumber, formatPct } from '../../format';
import type { Lang } from '../../i18n';
import { t } from './content';
import { COLUMNS, GAME_WEEKS, isInactive, personaKey, type SortKey, type SortState } from './progress';

const NUMERIC = new Set<SortKey>([
  'modules_done',
  'weeks_played',
  'decisions',
  'news_editions',
  'classroom_best',
  'baseline_score',
  'endline_score',
]);

/** Small clock for the inactive flag: the words carry the meaning, the icon just helps scanning. */
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface Props {
  rows: ClassProgressRow[];
  lang: Lang;
  sort: SortState;
  onSort: (key: SortKey) => void;
  now: Date;
}

/** One row per student, nicknames only. Scrolls sideways inside its own box on a phone. */
export function ProgressTable({ rows, lang, sort, onSort, now }: Props) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);

  function persona(p: string | null) {
    if (!p) return '–';
    const key = personaKey(p);
    return key ? tr(key) : p;
  }

  function language(code: string) {
    return code === 'en' || code === 'hi' ? tr(`lang.${code}`) : code.toUpperCase();
  }

  return (
    <div className="table-wrap" role="region" aria-label={tr('title')} tabIndex={0}>
      <table className="data progress-table">
        <caption className="sr-only">{tr('table.caption')}</caption>
        <thead>
          <tr>
            {COLUMNS.map((key) => {
              const active = sort.key === key;
              // Only the sorted column shows an arrow: less noise, and the headers stay narrow enough to fit.
              return (
                <th
                  key={key}
                  scope="col"
                  className={NUMERIC.has(key) ? 'sortable num' : 'sortable'}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" className="sort" onClick={() => onSort(key)}>
                    <span>{tr(`col.${key}`)}</span>
                    {active && (
                      <span aria-hidden="true" className="progress-arrow">
                        {sort.dir === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.anon_id}>
              <th scope="row">{r.nickname}</th>
              <td>{persona(r.persona)}</td>
              <td>{language(r.lang)}</td>
              <td className="progress-last-cell">
                <div className="progress-last">
                  <span>{formatDate(r.last_active, lang)}</span>
                  {isInactive(r.last_active, now) && (
                    <span className="badge">
                      <ClockIcon />
                      {tr('flag.inactive')}
                    </span>
                  )}
                </div>
              </td>
              <td className="num">{formatNumber(r.modules_done)}</td>
              <td className="num">
                {formatNumber(r.weeks_played)}/{GAME_WEEKS}
              </td>
              <td className="num">{formatNumber(r.decisions)}</td>
              <td className="num">{formatNumber(r.news_editions)}</td>
              <td className="num">{formatPct(r.classroom_best)}</td>
              <td className="num">{formatPct(r.baseline_score)}</td>
              <td className="num">{formatPct(r.endline_score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
