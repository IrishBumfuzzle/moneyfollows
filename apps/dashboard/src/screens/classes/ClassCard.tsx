import { useEffect, useRef, useState } from 'react';
import type { ClassRow } from '@paisa/api-client';
import { studentUrlConfigured } from '../../api';
import { t } from '../../content';
import { isDemoClass } from '../../demo';
import { formatDate } from '../../format';
import type { Lang } from '../../i18n';
import { hashFor } from '../../shell/route';
import { formatCode } from './classes';
import { CodeBlock, JoinQr, StatusChips } from './ClassParts';
import { CopyButton } from './CopyButton';

interface Props {
  cls: ClassRow;
  lang: Lang;
  /** The class just created: outlined, and its heading takes focus. */
  highlighted?: boolean;
  onPrint: (cls: ClassRow) => void;
}

/** The full card: big code and QR. Shown for a class just created, so it can be shared straight away. */
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

/**
 * One line of the class list: name, status, code and the two things staff do most (open the class,
 * print the join sheet). Compact, so a school with many classes still reads as a short list.
 */
export function ClassListItem({ cls, lang, onPrint }: Omit<Props, 'highlighted'>) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const open = hashFor({ name: 'class', id: cls.id, tab: 'progress' });
  const [showQr, setShowQr] = useState(false);
  const qrId = `qr-${cls.id}`;

  return (
    <article className="card class-item" aria-labelledby={`class-${cls.id}`}>
      <div className="class-item-main">
        <div className="row">
          <h2 id={`class-${cls.id}`}>{cls.name}</h2>
          {isDemoClass(cls) && <span className="badge demo">{tr('class.demo')}</span>}
        </div>
        <StatusChips cls={cls} lang={lang} />
      </div>
      <div className="class-item-code">
        <span className="muted">{tr('class.code')}</span>
        <span className="class-code" translate="no">
          {formatCode(cls.class_code)}
        </span>
        <CopyButton
          text={cls.class_code}
          label={tr('class.copy_code')}
          doneLabel={tr('class.copied_code')}
          failLabel={tr('class.copy_failed')}
        />
      </div>
      <div className="class-item-actions">
        <a className="btn primary" href={open}>
          {tr('class.open')}
        </a>
        {studentUrlConfigured && (
          <>
            <button
              type="button"
              className="btn"
              aria-expanded={showQr}
              aria-controls={qrId}
              onClick={() => setShowQr((v) => !v)}
            >
              {tr(showQr ? 'class.hide_qr' : 'class.show_qr')}
            </button>
            <button type="button" className="btn" onClick={() => onPrint(cls)}>
              {tr('class.print')}
            </button>
          </>
        )}
      </div>
      {showQr && (
        <div className="class-item-qr" id={qrId}>
          <JoinQr cls={cls} lang={lang} big />
        </div>
      )}
    </article>
  );
}
