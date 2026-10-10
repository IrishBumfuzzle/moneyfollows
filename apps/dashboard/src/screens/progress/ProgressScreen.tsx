import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { StudentRow } from '@paisa/api-client';
import type { ClassProgressRow } from '@paisa/shared';
import { joinUrl, studentUrlConfigured } from '../../api';
import { isDemoClass } from '../../demo';
import { formatNumber } from '../../format';
import { StudentUrlWarning } from '../../shell/Notices';
import type { ClassScreenProps } from '../../types';
import { t } from './content';
import { ProgressTable } from './ProgressTable';
import {
  DEFAULT_SORT,
  filterRows,
  isInactive,
  loadErrorKey,
  nextSort,
  sortRows,
  summarize,
  type LoadErrorKey,
  type SortKey,
} from './progress';
import { RejoinCodes } from './RejoinCodes';
import './progress.css';

interface Loaded {
  progress: ClassProgressRow[];
  students: StudentRow[];
}

/** Class progress: one row per student (nicknames only), plus rejoin codes for a lost phone. */
export function ProgressScreen({ api, cls, lang }: ClassScreenProps) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const [data, setData] = useState<Loaded | null>(null);
  const [loadedAt, setLoadedAt] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadErrorKey | null>(null);
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [query, setQuery] = useState('');
  const [onlyInactive, setOnlyInactive] = useState(false);
  // Only the latest request may write state (a refresh, or another class, can overtake it).
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const [progress, students] = await Promise.all([api.classProgress(cls.id), api.listStudents(cls.id)]);
      if (id !== seq.current) return;
      setData({ progress, students });
      setLoadedAt(new Date());
    } catch (err) {
      if (id !== seq.current) return;
      setError(loadErrorKey(err));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [api, cls.id]);

  useEffect(() => {
    setData(null);
    setQuery('');
    setOnlyInactive(false);
    void load();
    return () => {
      seq.current++;
    };
  }, [load]);

  const rows = data?.progress;
  const summary = useMemo(() => (rows ? summarize(rows, loadedAt) : null), [rows, loadedAt]);
  const visible = useMemo(() => {
    if (!rows) return [];
    const picked = onlyInactive ? rows.filter((r) => isInactive(r.last_active, loadedAt)) : rows;
    return sortRows(filterRows(picked, query), sort);
  }, [rows, query, sort, onlyInactive, loadedAt]);

  const demo = isDemoClass(cls);
  const searching = query.trim() !== '' || onlyInactive;

  function onStudentChange(student: StudentRow) {
    setData((d) => d && { ...d, students: d.students.map((s) => (s.anon_id === student.anon_id ? student : s)) });
  }

  return (
    <section className="stack progress">
      <div className="row spread">
        {/* The class layout owns the page's h1 and its Demo badge; this names the screen. */}
        <h2>{tr('title')}</h2>
        {data && (
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {tr(loading ? 'refreshing' : 'refresh')}
          </button>
        )}
      </div>

      {demo && (
        <div className="banner info" role="note">
          {tr('demo.note')}
        </div>
      )}

      {error && (
        <div className="banner bad progress-error" role="alert">
          <p>{tr(error)}</p>
          <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
            {tr('error.retry')}
          </button>
        </div>
      )}

      {!data && loading && (
        <p className="muted" role="status">
          {tr('loading')}
        </p>
      )}

      {data && rows && summary && rows.length === 0 && (
        <div className="card progress-empty">
          <h2>{tr('empty.title')}</h2>
          <p>{tr('empty.share')}</p>
          {!cls.join_open && <div className="banner warn">{tr('empty.closed')}</div>}
          <p className="muted progress-code-label">{tr('empty.codeLabel')}</p>
          <p className="class-code nums">{cls.class_code}</p>
          {studentUrlConfigured ? (
            <>
              <div className="progress-qr">
                <QRCodeSVG value={joinUrl(cls.class_code)} size={192} marginSize={2} title={tr('empty.qr')} />
              </div>
              <p className="muted">{tr('empty.link')}</p>
              <p className="progress-link">
                <a href={joinUrl(cls.class_code)}>{joinUrl(cls.class_code)}</a>
              </p>
            </>
          ) : (
            <StudentUrlWarning text={tr('empty.noStudentUrl')} />
          )}
        </div>
      )}

      {data && rows && summary && rows.length > 0 && (
        <>
          <p className="progress-summary">
            {[
              tr(summary.total === 1 ? 'summary.students.one' : 'summary.students.other', {
                n: formatNumber(summary.total),
              }),
              tr('summary.inactive', { n: formatNumber(summary.inactive) }),
              tr('summary.endline', { n: formatNumber(summary.endline) }),
            ].join(' · ')}
          </p>

          <div className="row progress-tools">
            <div className="field">
              <label htmlFor="progress-search">{tr('search.label')}</label>
              <input
                id="progress-search"
                className="input"
                type="search"
                autoComplete="off"
                placeholder={tr('search.placeholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {summary.inactive > 0 && (
              <label className="progress-filter">
                <input type="checkbox" checked={onlyInactive} onChange={(e) => setOnlyInactive(e.target.checked)} />
                <span>{tr('filter.inactive', { n: formatNumber(summary.inactive) })}</span>
              </label>
            )}
            <p className="muted" aria-live="polite">
              {searching
                ? tr('search.count', { shown: formatNumber(visible.length), total: formatNumber(rows.length) })
                : ''}
            </p>
          </div>

          <p className="muted">{tr('table.help')}</p>

          {visible.length > 0 ? (
            <ProgressTable
              rows={visible}
              lang={lang}
              sort={sort}
              onSort={(key: SortKey) => setSort((s) => nextSort(s, key))}
              now={loadedAt}
            />
          ) : (
            <p className="empty">{tr('search.none', { query: query.trim() })}</p>
          )}
        </>
      )}

      {data && data.students.length > 0 && (
        <RejoinCodes api={api} students={data.students} lang={lang} onStudentChange={onStudentChange} />
      )}
    </section>
  );
}
