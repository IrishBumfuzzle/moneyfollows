import { useEffect, useRef, useState } from 'react';
import { studentUrlConfigured } from '../../api';
import { t } from '../../content';
import { StudentUrlWarning } from '../../shell/Notices';
import type { ClassScreenProps } from '../../types';
import { CodeBlock, StatusChips } from './ClassParts';
import { formatCode, type ClassPatch } from './classes';
import { usePrintJoinSheet } from './JoinSheet';

type Busy = 'join' | 'endline' | 'code' | null;
type Message = { ok: boolean; text: string } | null;

/** Per-class settings: close joining, open the end-line quiz, replace a leaked class code. */
export function SettingsScreen({ api, cls, lang, onClassPatch }: ClassScreenProps) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<Message>(null);
  const [confirming, setConfirming] = useState(false);
  const rotateRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const { print, sheet } = usePrintJoinSheet();

  // Focus the safe choice when the confirm opens, and return to the trigger when it closes.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (wasConfirming.current) rotateRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  /**
   * Runs one change and hands the shell only the fields it changed. The shell merges them into its
   * latest row, so a slower request never writes back an old copy of another field.
   */
  async function run<P extends ClassPatch>(
    kind: Exclude<Busy, null>,
    change: () => Promise<P>,
    okText: (done: P) => string,
  ) {
    setBusy(kind);
    setMessage(null);
    try {
      const done = await change();
      onClassPatch(cls.id, done);
      setMessage({ ok: true, text: okText(done) });
    } catch {
      setMessage({ ok: false, text: tr('settings.err') });
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  }

  // Each switch flips what its button says right now (the shell's latest row), then sends that value.
  const toggleJoin = () => {
    const join_open = !cls.join_open;
    return run(
      'join',
      async () => {
        await api.setJoinOpen(cls.id, join_open);
        return { join_open };
      },
      () => tr(join_open ? 'settings.join.saved_open' : 'settings.join.saved_closed'),
    );
  };

  const toggleEndline = () => {
    const endline_open = !cls.endline_open;
    return run(
      'endline',
      async () => {
        await api.setEndlineOpen(cls.id, endline_open);
        return { endline_open };
      },
      () => tr(endline_open ? 'settings.endline.saved_open' : 'settings.endline.saved_closed'),
    );
  };

  const rotate = () =>
    run(
      'code',
      async () => ({ class_code: await api.rotateClassCode(cls.id) }),
      (done) => tr('settings.code.changed', { code: formatCode(done.class_code) }),
    );

  const working = tr('settings.working');

  return (
    <div className="stack">
      <StatusChips cls={cls} lang={lang} />

      <div role="status" aria-live="polite">
        {message?.ok && (
          <div className="banner good">
            <span aria-hidden="true">✓</span>
            <span>{message.text}</span>
          </div>
        )}
      </div>
      {message && !message.ok && (
        <div className="banner bad" role="alert">
          <span aria-hidden="true">!</span>
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid-2">
        <section className="card stack" aria-labelledby="set-join">
          <h2 id="set-join">{tr('settings.join.title')}</h2>
          <p>{tr('settings.join.body')}</p>
          <div className="btn-row">
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void toggleJoin()}>
              {busy === 'join' ? working : tr(cls.join_open ? 'settings.join.close' : 'settings.join.open')}
            </button>
          </div>
        </section>

        <section className="card stack" aria-labelledby="set-endline">
          <h2 id="set-endline">{tr('settings.endline.title')}</h2>
          <p>{tr('settings.endline.body')}</p>
          <div className="btn-row">
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void toggleEndline()}>
              {busy === 'endline' ? working : tr(cls.endline_open ? 'settings.endline.close' : 'settings.endline.open')}
            </button>
          </div>
        </section>
      </div>

      <section className="card stack" aria-labelledby="set-code">
        <h2 id="set-code">{tr('settings.code.title')}</h2>
        <CodeBlock cls={cls} lang={lang} label={false} />
        <p>{tr('settings.code.body')}</p>
        {!studentUrlConfigured && <StudentUrlWarning text={tr('classes.no_student_url')} />}
        {confirming ? (
          <div className="confirm" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-body">
            <h3 id="confirm-title">{tr('settings.code.confirm_title')}</h3>
            <p id="confirm-body">{tr('settings.code.confirm_body')}</p>
            <div className="btn-row">
              <button
                ref={cancelRef}
                type="button"
                className="btn"
                disabled={busy !== null}
                onClick={() => setConfirming(false)}
              >
                {tr('settings.cancel')}
              </button>
              <button type="button" className="btn danger" disabled={busy !== null} onClick={() => void rotate()}>
                {busy === 'code' ? working : tr('settings.code.confirm_yes')}
              </button>
            </div>
          </div>
        ) : (
          <div className="btn-row">
            <button
              ref={rotateRef}
              type="button"
              className="btn danger"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
            >
              {tr('settings.code.rotate')}
            </button>
            {studentUrlConfigured && (
              <button type="button" className="btn" onClick={() => print(cls)}>
                {tr('class.print')}
              </button>
            )}
          </div>
        )}
      </section>
      {sheet}
    </div>
  );
}
