import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../game/useGame';
import { PixelIcon } from '../life/PixelIcon';
import { t } from './content';
import type { Lang } from './content';
import { getEvent } from './data';
import { DeltaChips } from './DeltaChips';
import { canChoose } from './resolve';
import type { PhoneThread } from './types';
import { useEvents } from './useEvents';
import '../../design/kenney.css';
import './events.css';

/**
 * The character's phone: an inbox, and a chat thread per message with 2 replies to pick from.
 * Opening a thread is a history entry ({ screen: 'phone', thread }), so Android back goes
 * thread → inbox → wherever the phone was opened from (CLAUDE.md 6).
 */
export function PhoneScreen({ lang, name, onExit }: { lang: Lang; name: string; onExit: () => void }) {
  const [threadId, setThreadId] = useState<string | undefined>(
    () => (window.history.state as { thread?: string } | null)?.thread,
  );
  const inbox = useEvents((s) => s.inbox);
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, { name, ...vars });

  useEffect(() => {
    const on = (e: PopStateEvent) => setThreadId((e.state as { thread?: string } | null)?.thread);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  const open = (id: string) => {
    window.history.pushState({ screen: 'phone', thread: id }, '');
    setThreadId(id);
  };
  const back = () => {
    if (threadId && (window.history.state as { thread?: string } | null)?.thread) window.history.back();
    else if (threadId) setThreadId(undefined);
    else onExit();
  };

  const ev = threadId ? getEvent(threadId) : undefined;
  const thread = ev?.kind === 'phone' ? ev : undefined;

  return (
    <div className="ev-phone-screen" lang={lang}>
      <div className="ev-device">
        <div className="ev-device-bar">
          <button className="ev-device-back" onClick={back} aria-label={tr(thread ? 'events.ui.back' : 'events.ui.close_phone')}>
            <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="currentColor" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
            </svg>
          </button>
          {thread ? (
            <span className="ev-device-title">
              <span className="ev-device-name">{tr(thread.sender)}</span>
              {thread.number !== tr(thread.sender) && <span className="ev-device-number">{thread.number}</span>}
            </span>
          ) : (
            <span className="ev-device-title">
              <span className="ev-device-name">{tr('events.ui.inbox')}</span>
            </span>
          )}
        </div>

        <div className="ev-device-screen">
          {thread ? (
            <ChatThread lang={lang} name={name} thread={thread} onDone={back} />
          ) : inbox.length === 0 ? (
            <p className="ev-empty">{tr('events.ui.inbox_empty')}</p>
          ) : (
            <ul className="ev-inbox">
              {inbox.map((m) => {
                const e = getEvent(m.id);
                if (!e || e.kind !== 'phone') return null;
                return (
                  <li key={m.id}>
                    <button className={`ev-inbox-item ${m.read ? '' : 'is-unread'}`} onClick={() => open(m.id)}>
                      <PixelIcon id={e.icon} size={32} />
                      <span className="ev-inbox-body">
                        <span className="ev-inbox-sender">{tr(e.sender)}</span>
                        <span className="ev-inbox-text">{tr(e.messages[e.messages.length - 1])}</span>
                      </span>
                      {!m.read && <span className="ev-dot" aria-label={tr('events.ui.new_message')} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatThread({ lang, name, thread, onDone }: { lang: Lang; name: string; thread: PhoneThread; onDone: () => void }) {
  const item = useEvents((s) => s.inbox.find((m) => m.id === thread.id));
  const answer = useEvents((s) => s.answerThread);
  const markRead = useEvents((s) => s.markRead);
  const life = useGame((s) => s.life);
  const endRef = useRef<HTMLDivElement>(null);
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, { name, ...vars });

  useEffect(() => {
    markRead(thread.id);
  }, [thread.id, markRead]);
  useEffect(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }), [item?.choice]);

  const chosen = thread.choices.find((c) => c.id === item?.choice);
  const scam = thread.verdict === 'scam';

  return (
    <div className="ev-chat">
      {thread.messages.map((m) => (
        <p key={m} className="ev-bubble is-them">{tr(m)}</p>
      ))}

      {!chosen && (
        <div className="ev-replies" role="group" aria-label={tr('events.ui.reply')}>
          <p className="ev-muted">{tr('events.ui.reply')}</p>
          {thread.choices.map((c) => {
            const ok = canChoose(life, c);
            return (
              <button
                key={c.id}
                className={`k-btn ev-choice ${ok ? '' : 'is-dim'}`}
                aria-disabled={!ok}
                onClick={() => ok && answer(thread.id, c.id)}
              >
                <span className="ev-choice-label">{tr(c.label)}</span>
                {!ok && <span className="ev-why">{tr('events.ui.not_enough')}</span>}
              </button>
            );
          })}
        </div>
      )}

      {chosen && (
        <>
          <p className="ev-bubble is-you">{tr(chosen.label)}</p>
          {chosen.reply && <p className="ev-bubble is-them">{tr(chosen.reply)}</p>}
          <div className="ev-outcome k-panel" role="status">
            <p className={`ev-verdict ${scam ? 'is-scam' : 'is-real'}`}>
              <PixelIcon id={scam ? 'warn' : 'person'} />
              <span>{tr(scam ? 'events.ui.it_was_scam' : 'events.ui.it_was_real')}</span>
            </p>
            <p>{tr(chosen.outcome)}</p>
            {item?.delta && <DeltaChips lang={lang} delta={item.delta} />}
            {thread.redFlags && (
              <div>
                <p className="ev-lesson-head">{tr('events.ui.red_flags')}</p>
                <ul className="ev-flags">
                  {thread.redFlags.map((f) => (
                    <li key={f}>{tr(f)}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="ev-lesson">
              <p className="ev-lesson-head">{tr('events.ui.lesson')}</p>
              <p>{tr(chosen.lesson)}</p>
            </div>
            {scam && <p className="ev-helpline">{tr('events.ui.helpline')}</p>}
            <button className="k-btn is-primary ev-wide" onClick={onDone}>
              {tr('events.ui.done')}
            </button>
          </div>
        </>
      )}
      <div ref={endRef} />
    </div>
  );
}
