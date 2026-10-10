import { useEffect, useRef } from 'react';
import { useGame } from '../../game/useGame';
import { t } from '../events/content';
import { getEvent } from '../events/data';
import { OutcomePanel } from '../events/OutcomePanel';
import { canChoose } from '../events/resolve';
import type { PhoneCall } from '../events/types';
import { useEvents } from '../events/useEvents';
import { PixelIcon } from '../life/PixelIcon';
import type { Lang } from './content';
import { t as pt } from './content';

/** The Phone app: recent calls. A missed call can be called back. */
export function CallLog({ lang, name, onOpen }: { lang: Lang; name: string; onOpen: (id: string) => void }) {
  const calls = useEvents((s) => s.calls);
  const tr = (k: string) => t(lang, k, { name });
  if (calls.length === 0) return <p className="ev-empty">{pt(lang, 'phone.calls.empty')}</p>;
  return (
    <ul className="ev-inbox">
      {calls.map((c) => {
        const e = getEvent(c.id);
        if (!e || e.kind !== 'call') return null;
        const missed = c.status === 'missed';
        return (
          <li key={c.id}>
            <button className="ev-inbox-item" onClick={() => onOpen(c.id)}>
              <PixelIcon id={e.icon} size={32} />
              <span className="ev-inbox-body">
                <span className={`ev-inbox-sender ${missed ? 'ph-missed' : ''}`}>{tr(e.caller)}</span>
                <span className="ev-inbox-text">{missed ? tr('events.ui.missed') : e.number}</span>
              </span>
              {missed && <span className="ph-callback">{tr('events.ui.call_back')}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A call in progress: what the caller says, your reply, then what happened. */
export function CallView({ lang, name, call, onDone }: { lang: Lang; name: string; call: PhoneCall; onDone: () => void }) {
  const item = useEvents((s) => s.calls.find((c) => c.id === call.id));
  const answer = useEvents((s) => s.answerCall);
  const pickUp = useEvents((s) => s.pickUp);
  const life = useGame((s) => s.life);
  const endRef = useRef<HTMLDivElement>(null);
  const tr = (k: string) => t(lang, k, { name });

  useEffect(() => {
    pickUp(call.id);
  }, [call.id, pickUp]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [item?.choice]);

  const chosen = call.choices.find((c) => c.id === item?.choice);

  return (
    <div className="ev-chat ph-call">
      <div className="ph-caller">
        <span className="ph-avatar">
          <PixelIcon id={call.icon} size={48} />
        </span>
        <span className="ph-caller-name">{tr(call.caller)}</span>
        <span className="ph-caller-number">{call.number}</span>
      </div>
      {call.lines.map((l) => (
        <p key={l} className="ev-bubble is-them">{tr(l)}</p>
      ))}
      {!chosen && (
        <div className="ev-replies" role="group" aria-label={tr('events.ui.reply')}>
          <p className="ev-muted">{tr('events.ui.reply')}</p>
          {call.choices.map((c) => {
            const ok = canChoose(life, c);
            return (
              <button key={c.id} className={`k-btn ev-choice ${ok ? '' : 'is-dim'}`} aria-disabled={!ok} onClick={() => ok && answer(call.id, c.id)}>
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
          <OutcomePanel lang={lang} name={name} verdict={call.verdict} kind="call" chosen={chosen} delta={item?.delta} redFlags={call.redFlags} onDone={onDone} />
        </>
      )}
      <div ref={endRef} />
    </div>
  );
}
