import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import type { ClassRow } from '@paisa/api-client';
import { joinUrl } from '../../api';
import { t } from '../../content';
import { formatCode } from './classes';

/** One text in both languages: a printed sheet is read by students in either, whatever staff picked. */
function Both({ k, vars }: { k: string; vars?: Record<string, string | number> }) {
  return (
    <>
      <span lang="en">{t('en', k, vars)}</span>
      <span lang="hi" className="sheet-hi">
        {t('hi', k, vars)}
      </span>
    </>
  );
}

/** One printable A4 page: class name, big code, QR and three steps. No rejoin codes, nothing personal. */
export function JoinSheet({ cls }: { cls: ClassRow }) {
  const url = joinUrl(cls.class_code);
  return (
    <section className="print-sheet">
      <h1>
        <Both k="sheet.title" />
      </h1>
      <p className="sheet-class">
        <strong>
          <Both k="sheet.class" />
          {': '}
        </strong>
        {cls.name}
      </p>
      <div className="sheet-main">
        <div>
          <p className="sheet-label">
            <Both k="sheet.code" />
          </p>
          <div className="class-code sheet-code" translate="no">
            {formatCode(cls.class_code)}
          </div>
          <p className="sheet-note">
            <Both k="sheet.code_note" />
          </p>
        </div>
        <QRCodeSVG value={url} size={220} level="M" marginSize={2} bgColor="#ffffff" fgColor="#000000" />
      </div>
      <h2>
        <Both k="sheet.steps" />
      </h2>
      <ol className="sheet-steps">
        {['sheet.step1', 'sheet.step2', 'sheet.step3'].map((k) => (
          <li key={k}>
            <Both k={k} />
          </li>
        ))}
      </ol>
      <p className="sheet-link-label">
        <Both k="sheet.link" />
      </p>
      <p className="sheet-url" translate="no">
        {url}
      </p>
    </section>
  );
}

/**
 * Printing the join sheet. `print(cls)` renders the sheet (hidden on screen, the only thing the
 * print stylesheet shows) and opens the browser's print dialog. Render `sheet` once in the screen.
 */
export function usePrintJoinSheet(): { print: (cls: ClassRow) => void; sheet: ReactNode } {
  // A fresh object per click, so printing the same class twice runs the effect twice.
  const [target, setTarget] = useState<{ cls: ClassRow } | null>(null);

  useEffect(() => {
    if (!target) return;
    const done = () => {
      document.body.classList.remove('printing-sheet');
      setTarget(null);
    };
    document.body.classList.add('printing-sheet');
    window.addEventListener('afterprint', done, { once: true });
    // One frame so the sheet and its QR are in the page before the browser snapshots it.
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('printing-sheet');
    };
  }, [target]);

  return {
    print: (cls) => setTarget({ cls }),
    sheet: target ? createPortal(<JoinSheet cls={target.cls} />, document.body) : null,
  };
}
