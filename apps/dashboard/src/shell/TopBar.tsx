import { LANGS, type Lang } from '../i18n';
import { t } from '../content';

const LANG_LABEL: Record<Lang, { short: string; full: string }> = {
  en: { short: 'EN', full: 'English' },
  hi: { short: 'हिं', full: 'हिन्दी' },
};

interface Props {
  lang: Lang;
  onLang: (lang: Lang) => void;
  /** Set when someone is signed in. */
  email?: string;
  onSignOut?: () => void;
}

export function TopBar({ lang, onLang, email, onSignOut }: Props) {
  return (
    <header className="topbar">
      <div className="brand">{t(lang, 'app.name')}</div>
      <div className="topbar-actions">
        {email && (
          <span className="topbar-email" title={t(lang, 'topbar.signed_in', { email })}>
            {email}
          </span>
        )}
        <div className="langs" role="group" aria-label={t(lang, 'topbar.lang')}>
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              lang={l}
              aria-label={LANG_LABEL[l].full}
              aria-pressed={lang === l}
              onClick={() => onLang(l)}
            >
              {LANG_LABEL[l].short}
            </button>
          ))}
        </div>
        {onSignOut && (
          <button type="button" className="btn" onClick={onSignOut}>
            {t(lang, 'topbar.sign_out')}
          </button>
        )}
      </div>
    </header>
  );
}
