import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DashboardApi } from '../../types';
import { t } from '../../content';
import type { Lang } from '../../i18n';
import { SAMPLE_MODE, sampleModeHref } from '../../mode';
import { PasswordField } from './PasswordField';
import { isValidEmail, normalizeEmail, passwordProblem, resetRedirect, signInErrorKey, type Mode } from './signin';

interface Props {
  api: DashboardApi;
  lang: Lang;
  /** A sign-in or reset link in the URL failed (expired or already used). */
  linkError?: boolean;
  /** Where the card starts: 'forgot' after a reset link that no longer works. */
  initialMode?: Mode;
  /** Called after a successful sign-in so the shell re-reads the session. */
  onSignedIn: () => void;
}

// Local demo only (import.meta.env.DEV): this facilitator and its password come from
// supabase/seed.sql and exist only on a local Supabase.
const DEMO_EMAIL = 'demo.facilitator@example.org';
const DEMO_PASSWORD = 'paisa-demo-2026';

// Spelled out (not built from `mode`) so the content test can check every key exists.
const TEXT: Record<Mode, { title: string; intro: string; submit: string; busy: string }> = {
  signin: { title: 'signin.title', intro: 'signin.intro', submit: 'signin.submit', busy: 'signin.signing_in' },
  signup: {
    title: 'signin.signup.title',
    intro: 'signin.signup.intro',
    submit: 'signin.signup.submit',
    busy: 'signin.signup.busy',
  },
  forgot: {
    title: 'signin.forgot.title',
    intro: 'signin.forgot.intro',
    submit: 'signin.forgot.submit',
    busy: 'signin.forgot.busy',
  },
};

type Busy = 'submit' | 'demo' | null;
type Notice = { key: 'signin.forgot.sent' | 'signin.signup.confirm'; email: string } | null;

/**
 * Staff sign-in on one card: email + password. "Create your account" is the one-time first visit
 * (only emails on the staff list may), and "Forgot password?" emails a link to choose a new one.
 */
export function SignIn({ api, lang, linkError, initialMode = 'signin', onSignedIn }: Props) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // A new mode is a new page to a screen reader: read its title, but not on first load.
  const lastMode = useRef(mode);
  useEffect(() => {
    if (lastMode.current === mode) return;
    lastMode.current = mode;
    titleRef.current?.focus();
  }, [mode]);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  function fail(key: string) {
    setError(key);
    const field = /password/.test(key) ? passwordRef : /email|not_invited|account_exists/.test(key) ? emailRef : null;
    field?.current?.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const clean = normalizeEmail(email);
    if (!isValidEmail(clean)) return fail('signin.err.email');
    const problem = mode === 'forgot' ? null : passwordProblem(password, mode === 'signup');
    if (problem) return fail(problem);

    setBusy('submit');
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signin') {
        await api.signInWithPassword(clean, password);
        onSignedIn();
      } else if (mode === 'signup') {
        const { signedIn } = await api.signUpWithPassword(clean, password);
        if (signedIn) return onSignedIn();
        // Only if the server still asks to confirm the email (supabase/config.toml has it off).
        setMode('signin');
        setNotice({ key: 'signin.signup.confirm', email: clean });
      } else {
        await api.sendPasswordReset(clean, resetRedirect(window.location));
        setEmail(clean);
        setNotice({ key: 'signin.forgot.sent', email: clean });
      }
    } catch (err) {
      fail(signInErrorKey(err, { mode }));
    } finally {
      setBusy(null);
    }
  }

  async function demo() {
    setBusy('demo');
    setError(null);
    try {
      await api.signInWithPassword(DEMO_EMAIL, DEMO_PASSWORD);
      onSignedIn();
    } catch (err) {
      setError(signInErrorKey(err, { demo: true }));
    } finally {
      setBusy(null);
    }
  }

  const text = TEXT[mode];
  const toggle = {
    show: tr('signin.show'),
    hide: tr('signin.hide'),
    showName: tr('signin.show_password'),
    hideName: tr('signin.hide_password'),
  };
  const errorId = 'signin-error';
  const emailError = error !== null && /email|not_invited|account_exists/.test(error);
  const passwordError = error !== null && /password/.test(error);

  return (
    <section className="card narrow" aria-labelledby="signin-title">
      <h1 id="signin-title" ref={titleRef} tabIndex={-1}>
        {tr(text.title)}
      </h1>

      {linkError && (
        <div className="banner warn" role="alert">
          <span aria-hidden="true">!</span>
          <span>{tr('signin.link_error')}</span>
        </div>
      )}

      <form className="stack" onSubmit={submit} noValidate>
        <p>{tr(SAMPLE_MODE ? 'sample.hint' : text.intro)}</p>

        {notice && (
          <div className="banner good" role="status">
            <span aria-hidden="true">✓</span>
            <span>{tr(notice.key, { email: notice.email })}</span>
          </div>
        )}

        <div className="field">
          <label htmlFor="signin-email">{tr('signin.email')}</label>
          <input
            id="signin-email"
            ref={emailRef}
            className="input"
            type="email"
            inputMode="email"
            autoComplete={mode === 'signup' ? 'username' : 'email'}
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={emailError || undefined}
            aria-describedby={error ? errorId : undefined}
          />
        </div>

        {mode !== 'forgot' && (
          <PasswordField
            // A new key per mode: the Show/Hide state and the browser's autofill start fresh.
            key={mode}
            id="signin-password"
            label={tr('signin.password')}
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            toggle={toggle}
            hint={mode === 'signup' ? tr('signin.password_hint') : undefined}
            invalid={passwordError}
            errorId={error ? errorId : undefined}
            inputRef={passwordRef}
          />
        )}

        {error && (
          <div className="banner bad" id={errorId} role="alert">
            <span aria-hidden="true">!</span>
            <span>{tr(error)}</span>
          </div>
        )}

        <div className="btn-row">
          <button type="submit" className="btn primary" disabled={busy !== null}>
            {busy === 'submit' ? tr(text.busy) : tr(text.submit)}
          </button>
          {mode === 'signin' ? (
            <button type="button" className="btn quiet" disabled={busy !== null} onClick={() => switchTo('forgot')}>
              {tr('signin.forgot_link')}
            </button>
          ) : (
            <button type="button" className="btn quiet" disabled={busy !== null} onClick={() => switchTo('signin')}>
              {tr('signin.back')}
            </button>
          )}
        </div>
      </form>

      {mode === 'signin' && (
        <div className="signin-first">
          <h2>{tr('signin.new_here')}</h2>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => switchTo('signup')}>
            {tr('signin.create_link')}
          </button>
        </div>
      )}

      {!SAMPLE_MODE && (
        <div className="sample-offer">
          <h2>{tr('sample.try_title')}</h2>
          <p className="muted">{tr('sample.try_body')}</p>
          <a className="btn" href={sampleModeHref(true)}>
            {tr('sample.try')}
          </a>
        </div>
      )}

      {import.meta.env.DEV && !SAMPLE_MODE && (
        <div className="dev-box">
          <button type="button" className="btn quiet" disabled={busy !== null} onClick={() => void demo()}>
            {busy === 'demo' ? tr('signin.signing_in') : tr('signin.demo')}
          </button>
          <p className="muted">{tr('signin.demo_note')}</p>
        </div>
      )}
    </section>
  );
}
