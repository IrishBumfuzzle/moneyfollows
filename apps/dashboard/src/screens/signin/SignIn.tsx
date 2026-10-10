import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ApiClient } from '@paisa/api-client';
import { t } from '../../content';
import type { Lang } from '../../i18n';
import {
  CODE_INPUT_MAX,
  cleanOtp,
  isCompleteOtp,
  isValidEmail,
  normalizeEmail,
  secondsLeft,
  signInErrorKey,
} from './signin';

interface Props {
  api: ApiClient;
  lang: Lang;
  /** An invite or sign-in link in the URL failed (expired or already used). */
  linkError?: boolean;
  /** Called after a successful sign-in so the shell re-reads the session. */
  onSignedIn: () => void;
}

// Local demo only (import.meta.env.DEV): this facilitator and its password come from
// supabase/seed.sql and exist only on a local Supabase. Hosted staff have no password.
const DEMO_EMAIL = 'demo.facilitator@example.org';
const DEMO_PASSWORD = 'paisa-demo-2026';

type Step = 'email' | 'code';
type Busy = 'send' | 'verify' | 'demo' | null;

export function SignIn({ api, lang, linkError, onSignedIn }: Props) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const wait = secondsLeft(sentAt, now);
  const counting = step === 'code' && wait > 0;

  // Tick once a second only while the resend countdown is running.
  useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [counting]);

  // Move focus to the box the person needs next, but not on first load.
  const lastStep = useRef<Step>(step);
  useEffect(() => {
    if (lastStep.current === step) return;
    lastStep.current = step;
    (step === 'code' ? codeRef : emailRef).current?.focus();
  }, [step]);

  async function sendCode(isResend: boolean) {
    const clean = normalizeEmail(email);
    if (!isValidEmail(clean)) {
      setError('signin.err.email');
      emailRef.current?.focus();
      return;
    }
    setBusy('send');
    setError(null);
    setResent(false);
    try {
      await api.signInWithEmail(clean);
      setEmail(clean);
      setCode('');
      setSentAt(Date.now());
      setNow(Date.now());
      setStep('code');
      setResent(isResend);
      // The resend button just went disabled, so keep focus on the code box.
      if (isResend) codeRef.current?.focus();
    } catch (err) {
      setError(signInErrorKey(err));
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    if (!isCompleteOtp(code)) {
      setError('signin.err.code');
      codeRef.current?.focus();
      return;
    }
    setBusy('verify');
    setError(null);
    try {
      await api.verifyEmailCode(normalizeEmail(email), code);
      onSignedIn();
    } catch (err) {
      setError(signInErrorKey(err));
      setCode('');
      codeRef.current?.focus();
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
      setError(signInErrorKey(err, true));
    } finally {
      setBusy(null);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    void (step === 'email' ? sendCode(false) : verify());
  };

  const errorId = 'signin-error';
  const sending = busy === 'send';

  return (
    <section className="card narrow" aria-labelledby="signin-title">
      <h1 id="signin-title" tabIndex={-1}>
        {tr('signin.title')}
      </h1>

      {linkError && (
        <div className="banner warn" role="alert">
          <span aria-hidden="true">!</span>
          <span>{tr('signin.link_error')}</span>
        </div>
      )}

      <form className="stack" onSubmit={submit} noValidate>
        {step === 'email' ? (
          <>
            <p>{tr('signin.intro')}</p>
            <div className="field">
              <label htmlFor="signin-email">{tr('signin.email')}</label>
              <input
                id="signin-email"
                ref={emailRef}
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={error === 'signin.err.email' || undefined}
                aria-describedby={error ? errorId : undefined}
              />
            </div>
          </>
        ) : (
          <>
            <p>{tr('signin.code_sent', { email })}</p>
            {resent && (
              <p className="muted" role="status">
                {tr('signin.resent')}
              </p>
            )}
            <div className="field">
              <label htmlFor="signin-code">{tr('signin.code')}</label>
              <input
                id="signin-code"
                ref={codeRef}
                className="input code-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={CODE_INPUT_MAX}
                value={code}
                onChange={(e) => setCode(cleanOtp(e.target.value))}
                aria-invalid={error === 'signin.err.code' || error === 'signin.err.code_invalid' || undefined}
                aria-describedby={error ? errorId : undefined}
              />
            </div>
          </>
        )}

        {error && (
          <div className="banner bad" id={errorId} role="alert">
            <span aria-hidden="true">!</span>
            <span>{tr(error)}</span>
          </div>
        )}

        <div className="btn-row">
          <button type="submit" className="btn primary" disabled={busy !== null}>
            {step === 'email'
              ? sending
                ? tr('signin.sending')
                : tr('signin.send')
              : busy === 'verify'
                ? tr('signin.verifying')
                : tr('signin.submit')}
          </button>
          {step === 'code' && (
            <>
              <button
                type="button"
                className="btn"
                disabled={busy !== null || wait > 0}
                onClick={() => void sendCode(true)}
              >
                {sending
                  ? tr('signin.sending')
                  : wait > 0
                    ? tr('signin.resend_wait', { s: wait })
                    : tr('signin.resend')}
              </button>
              <button
                type="button"
                className="btn quiet"
                disabled={busy !== null}
                onClick={() => {
                  setStep('email');
                  setError(null);
                  setCode('');
                }}
              >
                {tr('signin.change_email')}
              </button>
            </>
          )}
        </div>
      </form>

      {import.meta.env.DEV && (
        <div className="dev-box">
          <button type="button" className="btn quiet" disabled={busy !== null} onClick={() => void demo()}>
            {busy === 'demo' ? tr('signin.verifying') : tr('signin.demo')}
          </button>
          <p className="muted">{tr('signin.demo_note')}</p>
        </div>
      )}
    </section>
  );
}
