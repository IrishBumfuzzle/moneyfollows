import { t } from '../content';
import type { Lang } from '../i18n';
import { sampleModeHref } from '../mode';

/** Shown when the build has no Supabase URL or anon key (apps/dashboard/src/api.ts). */
export function SetupCard({ lang }: { lang: Lang }) {
  return (
    <section className="card narrow" aria-labelledby="setup-title">
      <h1 id="setup-title" tabIndex={-1}>
        {t(lang, 'setup.title')}
      </h1>
      <p>{t(lang, 'setup.body')}</p>
      <ul className="setup-list">
        <li>
          <code>VITE_SUPABASE_URL</code>: {t(lang, 'setup.url')}
        </li>
        <li>
          <code>VITE_SUPABASE_ANON_KEY</code>: {t(lang, 'setup.key')}
        </li>
      </ul>
      <p className="muted">{t(lang, 'setup.vercel')}</p>
      <div className="sample-offer">
        <p className="muted">{t(lang, 'sample.try_body')}</p>
        <a className="btn" href={sampleModeHref(true)}>
          {t(lang, 'sample.try')}
        </a>
      </div>
    </section>
  );
}

/** Always on top in sample mode, so nobody mistakes the made-up school for real children. */
export function SampleBanner({ lang }: { lang: Lang }) {
  return (
    <div className="banner info sample-banner" role="note">
      <span>{t(lang, 'sample.banner')}</span>
      <a className="btn" href={sampleModeHref(false)}>
        {t(lang, 'sample.leave')}
      </a>
    </div>
  );
}

/** A status line while something loads. Not a heading, so page focus waits for the real h1. */
export function Loading({ text }: { text: string }) {
  return (
    <p className="empty" role="status">
      {text}
    </p>
  );
}

/** A friendly error with a retry button; never a blank screen. */
export function Failed({ text, retryLabel, onRetry }: { text: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="stack">
      <div className="banner bad" role="alert">
        <span aria-hidden="true">!</span>
        <span>{text}</span>
      </div>
      <button type="button" className="btn" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  );
}

/** Staff-facing: this build has no VITE_STUDENT_URL, so join links, QR codes and printed sheets are switched off. */
export function StudentUrlWarning({ text }: { text: string }) {
  return (
    <div className="banner warn" role="note">
      <span aria-hidden="true">!</span>
      <span>{text}</span>
    </div>
  );
}

/** Signed in, but not on public.staff: they would see an empty list and fail to create classes. */
export function NotStaff({ email, lang, onRecheck }: { email: string; lang: Lang; onRecheck: () => void }) {
  return (
    <section className="card narrow" aria-labelledby="notstaff-title">
      <h1 id="notstaff-title" tabIndex={-1}>
        {t(lang, 'notstaff.title')}
      </h1>
      <p className="muted">{t(lang, 'notstaff.signed_in_as', { email })}</p>
      <div className="banner info">
        <span aria-hidden="true">i</span>
        <span>{t(lang, 'notstaff.body')}</span>
      </div>
      <div className="btn-row">
        <button type="button" className="btn" onClick={onRecheck}>
          {t(lang, 'notstaff.retry')}
        </button>
      </div>
    </section>
  );
}
