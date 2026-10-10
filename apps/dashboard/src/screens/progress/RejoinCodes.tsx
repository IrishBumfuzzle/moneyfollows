import { useState } from 'react';
import type { StudentRow } from '@paisa/api-client';
import type { DashboardApi } from '../../types';
import type { Lang } from '../../i18n';
import { t } from './content';

type Note = { anonId: string; kind: 'done' | 'error' };

interface Props {
  api: DashboardApi;
  students: StudentRow[];
  lang: Lang;
  /** Called with the student's new code after a reset. */
  onStudentChange: (student: StudentRow) => void;
}

/**
 * Rejoin codes are credentials: hidden until a teacher shows one, never listed in bulk, never
 * exported or printed. Closing the section hides every code again.
 */
export function RejoinCodes({ api, students, lang, onStudentChange }: Props) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  const nameOf = (anonId: string) => students.find((s) => s.anon_id === anonId)?.nickname ?? '';

  function toggle(anonId: string) {
    setShown((prev) => {
      const next = new Set(prev);
      if (!next.delete(anonId)) next.add(anonId);
      return next;
    });
  }

  async function reset(student: StudentRow) {
    setBusy(student.anon_id);
    setNote(null);
    try {
      const code = await api.resetRejoinCode(student.anon_id);
      onStudentChange({ ...student, rejoin_code: code });
      // Show the new code straight away: the teacher is about to read it out.
      setShown((prev) => new Set(prev).add(student.anon_id));
      setNote({ anonId: student.anon_id, kind: 'done' });
    } catch {
      setNote({ anonId: student.anon_id, kind: 'error' });
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  return (
    <details
      className="card progress-students"
      onToggle={(e) => {
        if (!e.currentTarget.open) {
          setShown(new Set());
          setConfirming(null);
          setNote(null);
        }
      }}
    >
      <summary>
        <h2>{tr('students.title')}</h2>
        <span className="badge nums">{students.length}</span>
      </summary>
      <p className="muted">{tr('students.help')}</p>
      <ul className="progress-student-list">
        {students.map((s) => {
          const visible = shown.has(s.anon_id);
          const working = busy === s.anon_id;
          const rowNote = note?.anonId === s.anon_id ? note.kind : null;
          return (
            <li key={s.anon_id}>
              <div className="progress-student-row">
                <span className="progress-student-name">{s.nickname}</span>
                <span className="progress-code-cell" aria-live="polite">
                  <span className="sr-only">{tr('students.codeLabel')}: </span>
                  {visible ? (
                    <span className="progress-code">{s.rejoin_code}</span>
                  ) : (
                    <>
                      <span aria-hidden="true" className="progress-code muted">
                        ••••••
                      </span>
                      <span className="sr-only">{tr('students.hidden')}</span>
                    </>
                  )}
                </span>
                <button type="button" className="btn" aria-pressed={visible} onClick={() => toggle(s.anon_id)}>
                  {tr(visible ? 'students.hide' : 'students.show')}
                  <span className="sr-only"> ({s.nickname})</span>
                </button>
                <button type="button" className="btn quiet" disabled={working} onClick={() => setConfirming(s.anon_id)}>
                  {tr('students.new')}
                  <span className="sr-only"> ({s.nickname})</span>
                </button>
              </div>
              {confirming === s.anon_id && (
                <div
                  className="banner warn progress-confirm"
                  role="group"
                  aria-label={tr('students.confirm', { name: s.nickname })}
                >
                  <p>{tr('students.confirm', { name: s.nickname })}</p>
                  <div className="row">
                    <button type="button" className="btn danger" disabled={working} onClick={() => void reset(s)}>
                      {working ? tr('students.making') : tr('students.confirmYes')}
                    </button>
                    <button type="button" className="btn quiet" disabled={working} onClick={() => setConfirming(null)}>
                      {tr('students.cancel')}
                    </button>
                  </div>
                </div>
              )}
              {rowNote === 'done' && (
                <p className="banner good" role="status">
                  {tr('students.done', { name: nameOf(s.anon_id) })}
                </p>
              )}
              {rowNote === 'error' && (
                <p className="banner bad" role="alert">
                  {tr('students.error', { name: nameOf(s.anon_id) })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
