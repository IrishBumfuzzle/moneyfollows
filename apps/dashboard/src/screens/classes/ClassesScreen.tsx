import { useState } from 'react';
import type { ClassRow } from '@paisa/api-client';
import type { DashboardApi } from '../../types';
import { studentUrlConfigured } from '../../api';
import { t } from '../../content';
import type { Lang } from '../../i18n';
import { StudentUrlWarning } from '../../shell/Notices';
import { ClassCard, ClassListItem } from './ClassCard';
import { CLASS_SEARCH_FROM, filterClasses } from './classes';
import { CreateClassForm } from './CreateClassForm';
import { usePrintJoinSheet } from './JoinSheet';

interface Props {
  api: DashboardApi;
  lang: Lang;
  classes: ClassRow[];
  /** A class was created or changed: the shell updates its list. */
  onClassChange: (cls: ClassRow) => void;
}

/** Create a class, then every class below as a short row; a class just created shows in full with its QR. */
export function ClassesScreen({ api, lang, classes, onClassChange }: Props) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const { print, sheet } = usePrintJoinSheet();
  const [query, setQuery] = useState('');
  const created = classes.find((c) => c.id === createdId);
  const searchable = classes.length > CLASS_SEARCH_FROM;
  const shown = filterClasses(classes, searchable ? query : '').filter((c) => c !== created);

  return (
    <div className="stack">
      <div>
        <h1 tabIndex={-1}>{tr('classes.title')}</h1>
        <p className="muted">{tr('classes.intro')}</p>
      </div>

      {!studentUrlConfigured && <StudentUrlWarning text={tr('classes.no_student_url')} />}

      <CreateClassForm
        api={api}
        lang={lang}
        onCreated={(cls) => {
          onClassChange(cls);
          setCreatedId(cls.id);
        }}
      />

      <div role="status">
        {created && (
          <div className="banner good">
            <span aria-hidden="true">✓</span>
            <span>
              {tr(studentUrlConfigured ? 'classes.created' : 'classes.created_code_only', { name: created.name })}
            </span>
          </div>
        )}
      </div>

      {created && <ClassCard cls={created} lang={lang} highlighted onPrint={print} />}

      {classes.length === 0 ? (
        <section className="card empty">
          <h2>{tr('classes.empty.title')}</h2>
          <p>{tr('classes.empty.body')}</p>
        </section>
      ) : (
        <>
          {searchable && (
            <div className="field class-search">
              <label htmlFor="class-search">{tr('classes.search')}</label>
              <input
                id="class-search"
                className="input"
                type="search"
                autoComplete="off"
                placeholder={tr('classes.search_hint')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          {shown.length === 0 && query.trim() !== '' ? (
            <p className="empty">{tr('classes.search_none', { query: query.trim() })}</p>
          ) : (
            <ul className="class-list" aria-label={tr('classes.title')}>
              {shown.map((cls) => (
                <li key={cls.id}>
                  <ClassListItem cls={cls} lang={lang} onPrint={print} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {sheet}
    </div>
  );
}
