import type { ReactNode } from 'react';
import type { ClassRow } from '@paisa/api-client';
import { t } from '../content';
import { isDemoClass } from '../demo';
import type { Lang } from '../i18n';
import { CLASS_TABS, hashFor, type ClassTab } from './route';

const TAB_KEY: Record<ClassTab, string> = {
  progress: 'nav.progress',
  gains: 'nav.gains',
  settings: 'nav.settings',
};

interface Props {
  cls: ClassRow;
  tab: ClassTab;
  lang: Lang;
  children: ReactNode;
}

/** The frame around one class: back link, class name (the page's h1), and the Progress / Gains / Settings tabs. */
export function ClassLayout({ cls, tab, lang, children }: Props) {
  return (
    <div className="stack">
      <a className="back-link" href={hashFor({ name: 'classes' })}>
        <span aria-hidden="true">←</span> {t(lang, 'nav.back')}
      </a>
      <div className="row">
        <h1 tabIndex={-1}>{cls.name}</h1>
        {isDemoClass(cls) && <span className="badge demo">{t(lang, 'class.demo')}</span>}
      </div>
      <nav className="tabs" aria-label={t(lang, 'nav.label')}>
        {CLASS_TABS.map((x) => (
          <a
            key={x}
            href={hashFor({ name: 'class', id: cls.id, tab: x })}
            aria-current={x === tab ? 'page' : undefined}
          >
            {t(lang, TAB_KEY[x])}
          </a>
        ))}
      </nav>
      {children}
    </div>
  );
}
