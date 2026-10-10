import { useState } from 'react';
import type { ApiClient, ClassRow } from '@paisa/api-client';
import { studentUrlConfigured } from '../../api';
import { t } from '../../content';
import type { Lang } from '../../i18n';
import { StudentUrlWarning } from '../../shell/Notices';
import { ClassCard } from './ClassCard';
import { CreateClassForm } from './CreateClassForm';
import { usePrintJoinSheet } from './JoinSheet';

interface Props {
  api: ApiClient;
  lang: Lang;
  classes: ClassRow[];
  /** A class was created or changed: the shell updates its list. */
  onClassChange: (cls: ClassRow) => void;
}

/** Create a class and see every class with its code, QR and join sheet. */
export function ClassesScreen({ api, lang, classes, onClassChange }: Props) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const { print, sheet } = usePrintJoinSheet();
  const created = classes.find((c) => c.id === createdId);

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

      {classes.length === 0 ? (
        <section className="card empty">
          <h2>{tr('classes.empty.title')}</h2>
          <p>{tr('classes.empty.body')}</p>
        </section>
      ) : (
        classes.map((cls) => (
          <ClassCard key={cls.id} cls={cls} lang={lang} highlighted={cls.id === createdId} onPrint={print} />
        ))
      )}
      {sheet}
    </div>
  );
}
