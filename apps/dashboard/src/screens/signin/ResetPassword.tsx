import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiCode } from '../../shell/errors';
import type { DashboardApi } from '../../types';
import { t } from '../../content';
import type { Lang } from '../../i18n';
import { PasswordField } from './PasswordField';
import { passwordProblem, signInErrorKey } from './signin';

interface Props {
  api: DashboardApi;
  lang: Lang;
  /** The token hash from the reset email's link (?reset=, read by shell/resetLink.ts). */
  tokenHash: string;
  /** The new password is saved and the person is signed in. */
  onDone: () => void;
  /** The link no longer works: back to the sign-in card to ask for a new one. */
  onNewLink: () => void;
}

type Phase = 'checking' | 'ready' | 'dead';

/** Opened from the "Forgot password?" email: checks the link once, then asks for a new password. */
export function ResetPassword({ api, lang, tokenHash, onDone, onNewLink }: Props) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // A reset link works once, so check it once even though StrictMode runs effects twice in dev.
  const check = useRef<Promise<void> | null>(null);
  useEffect(() => {
    let alive = true;
    check.current ??= api.verifyPasswordReset(tokenHash);
    check.current.then(
      () => alive && setPhase('ready'),
      (err: unknown) => {
        if (!alive) return;
        setPhase('dead');
        setError(signInErrorKey(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [api, tokenHash]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = passwordProblem(password, true);
    if (problem) {
      setError(problem);
      passwordRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.setPassword(password);
      onDone();
    } catch (err) {
      // They typed the password they already had: nothing to change, and they are signed in.
      if (apiCode(err) === 'auth_same_password') return onDone();
      setError(signInErrorKey(err));
      passwordRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  const errorId = 'reset-error';
  const toggle = {
    show: tr('signin.show'),
    hide: tr('signin.hide'),
    showName: tr('signin.show_password'),
    hideName: tr('signin.hide_password'),
  };
  const errorBanner = error && (
    <div className="banner bad" id={errorId} role="alert">
      <span aria-hidden="true">!</span>
      <span>{tr(error)}</span>
    </div>
  );

  return (
    <section className="card narrow" aria-labelledby="reset-title">
      <h1 id="reset-title" tabIndex={-1}>
        {tr('signin.reset.title')}
      </h1>

      {phase === 'checking' && (
        <p className="empty" role="status">
          {tr('signin.reset.checking')}
        </p>
      )}

      {phase === 'dead' && (
        <div className="stack">
          {errorBanner}
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={onNewLink}>
              {tr('signin.reset.again')}
            </button>
          </div>
        </div>
      )}

      {phase === 'ready' && (
        <form className="stack" onSubmit={save} noValidate>
          <p>{tr('signin.reset.intro')}</p>
          <PasswordField
            id="reset-password"
            label={tr('signin.new_password')}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            toggle={toggle}
            hint={tr('signin.password_hint')}
            invalid={error !== null}
            errorId={error ? errorId : undefined}
            inputRef={passwordRef}
          />
          {errorBanner}
          <div className="btn-row">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? tr('signin.reset.busy') : tr('signin.reset.submit')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
