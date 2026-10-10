import { useEffect, useRef } from 'react';
import type { ClassRow } from '@paisa/api-client';
import { studentUrlConfigured } from '../../api';
import { t } from '../../content';
import { isDemoClass } from '../../demo';
import { formatDate } from '../../format';
import type { Lang } from '../../i18n';
import { hashFor } from '../../shell/route';
import { CodeBlock, JoinQr, StatusChips } from './ClassParts';

interface Props {
  cls: ClassRow;
  lang: Lang;
  /** The class just created: outlined, and its heading takes focus. */
  highlighted?: boolean;
  onPrint: (cls: ClassRow) => void;
}

export function ClassCard({ cls, lang, highlighted, onPrint }: Props) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (highlighted) heading.current?.focus();
  }, [highlighted]);
  const link = (tab: 'progress' | 'gains' | 'settings') => hashFor({ name: 'class', id: cls.id, tab });

  return (
    <article className={`card class-card${highlighted ? ' highlight' : ''}`} aria-labelledby={`class-${cls.id}`}>
      <div className="row spread">
        <div>
          <h2 id={`class-${cls.id}`} ref={heading} tabIndex={-1}>
            {cls.name}
          </h2>
          <span className="muted">{tr('class.created_on', { date: formatDate(cls.created_at, lang) })}</span>
        </div>
        {isDemoClass(cls) && <span className="badge demo">{tr('class.demo')}</span>}
      </div>
      <StatusChips cls={cls} lang={lang} />
      <div className="class-card-body">
        <CodeBlock cls={cls} lang={lang} />
        <JoinQr cls={cls} lang={lang} />
      </div>
      <div className="btn-row">
        <a className="btn primary" href={link('progress')}>
          {tr('nav.progress')}
        </a>
        <a className="btn" href={link('gains')}>
          {tr('nav.gains')}
        </a>
        {studentUrlConfigured && (
          <button type="button" className="btn" onClick={() => onPrint(cls)}>
            {tr('class.print')}
          </button>
        )}
        <a className="btn quiet" href={link('settings')}>
          {tr('nav.settings')}
        </a>
      </div>
    </article>
  );
}
