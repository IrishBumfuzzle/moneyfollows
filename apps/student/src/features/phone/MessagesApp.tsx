import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../game/useGame';
import { t } from '../events/content';
import { getEvent } from '../events/data';
import { OutcomePanel } from '../events/OutcomePanel';
import { canChoose } from '../events/resolve';
import type { PhoneThread } from '../events/types';
import { useEvents } from '../events/useEvents';
import { MessageInspector } from '../scams';
import { t as phoneT } from './content';
import { threadMessage } from './inspect';
import { PixelIcon } from '../life/PixelIcon';
import type { Lang } from './content';

/** The Messages app: the inbox, newest first. */
export function Inbox({ lang, name, onOpen }: { lang: Lang; name: string; onOpen: (id: string) => void }) {
  const inbox = useEvents((s) => s.inbox);
  const tr = (k: string) => t(lang, k, { name });
  if (inbox.length === 0) return <p className="ev-empty">{tr('events.ui.inbox_empty')}</p>;
  return (
    <ul className="ev-inbox">
      {inbox.map((m) => {
        const e = getEvent(m.id);
        if (!e || e.kind !== 'phone') return null;
        return (
          <li key={m.id}>
            <button className={`ev-inbox-item ${m.read ? '' : 'is-unread'}`} onClick={() => onOpen(m.id)}>
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
  );
}

/** One chat: their messages, two replies to pick from, then what happened. */
export function ChatThread({ lang, name, thread, onDone }: { lang: Lang; name: string; thread: PhoneThread; onDone: () => void }) {
  const item = useEvents((s) => s.inbox.find((m) => m.id === thread.id));
  const answer = useEvents((s) => s.answerThread);
  const markRead = useEvents((s) => s.markRead);
  const life = useGame((s) => s.life);
  const endRef = useRef<HTMLDivElement>(null);
  const tr = (k: string) => t(lang, k, { name });

  useEffect(() => {
    markRead(thread.id);
  }, [thread.id, markRead]);
  useEffect(() => {
    // Block body on purpose: newer browsers return a Promise from smooth scrolling, and an
    // effect's return value is treated as its cleanup.
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [item?.choice]);

  const chosen = thread.choices.find((c) => c.id === item?.choice);
  // The Message Inspector: tap each line to check it before replying (the same one Scam or Safe? uses).
  const [inspecting, setInspecting] = useState(false);
  const [inspected, setInspected] = useState<Set<number>>(new Set());

  return (
    <div className="ev-chat">
      <button className="k-btn ph-inspect" aria-pressed={inspecting} onClick={() => setInspecting((v) => !v)}>
        {phoneT(lang, inspecting ? 'phone.inspect.close' : 'phone.inspect.open')}
      </button>
      {inspecting ? (
        <MessageInspector
          lang={lang}
          message={threadMessage(thread)}
          inspected={inspected}
          onInspect={(i) => setInspected((s) => new Set(s).add(i))}
          text={(k) => tr(k)}
        />
      ) : (
        thread.messages.map((m) => (
          <p key={m} className="ev-bubble is-them">{tr(m)}</p>
        ))
      )}
      {!chosen && (
        <div className="ev-replies" role="group" aria-label={tr('events.ui.reply')}>
          <p className="ev-muted">{tr('events.ui.reply')}</p>
          {thread.choices.map((c) => {
            const ok = canChoose(life, c);
            return (
              <button key={c.id} className={`k-btn ev-choice ${ok ? '' : 'is-dim'}`} aria-disabled={!ok} onClick={() => ok && answer(thread.id, c.id)}>
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
          <OutcomePanel lang={lang} name={name} verdict={thread.verdict} kind="message" chosen={chosen} delta={item?.delta} redFlags={thread.redFlags} onDone={onDone} />
        </>
      )}
      <div ref={endRef} />
    </div>
  );
}
