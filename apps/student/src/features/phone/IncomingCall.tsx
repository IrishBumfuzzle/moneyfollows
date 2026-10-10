import { useEffect, useRef } from 'react';
import { t } from '../events/content';
import { getEvent } from '../events/data';
import { useEvents } from '../events/useEvents';
import { PixelIcon } from '../life/PixelIcon';
import type { Lang } from './content';
import '../events/events.css';
import './phone.css';

/**
 * The ringing screen. Shown only on the map and main screen (never over a scene), and held back
 * while a sudden event is open. Answer opens the call in the Phone app; Decline leaves a missed call.
 */
export function IncomingCall({ lang, name, onAnswer }: { lang: Lang; name: string; onAnswer: (id: string) => void }) {
  const ringing = useEvents((s) => s.ringing);
  const busy = useEvents((s) => s.sudden !== null);
  const decline = useEvents((s) => s.declineCall);
  const answerRef = useRef<HTMLButtonElement>(null);
  const tr = (k: string) => t(lang, k, { name });
  const call = ringing && !busy ? getEvent(ringing) : undefined;

  useEffect(() => {
    if (!call) return;
    answerRef.current?.focus();
    navigator.vibrate?.([300, 200, 300]);
  }, [call]);

  if (!call || call.kind !== 'call') return null;
  return (
    <div className="ph-ring" lang={lang} role="alertdialog" aria-modal="true" aria-labelledby="ph-ring-name">
      <p className="ph-ring-label">{tr('events.ui.incoming')}</p>
      <span className="ph-avatar ph-ring-avatar">
        <PixelIcon id={call.icon} size={64} />
      </span>
      <p id="ph-ring-name" className="ph-ring-name">{tr(call.caller)}</p>
      <p className="ph-ring-number">{call.number}</p>
      <div className="ph-ring-actions">
        <button className="ph-ring-btn is-decline" onClick={decline} aria-label={tr('events.ui.decline')}>
          <svg viewBox="0 0 8 8" width="28" height="28" aria-hidden="true" shapeRendering="crispEdges">
            <path fill="#fff" d="M1 3h6v1H1zM0 4h2v2H0zM6 4h2v2H6z" />
          </svg>
          <span>{tr('events.ui.decline')}</span>
        </button>
        <button ref={answerRef} className="ph-ring-btn is-accept" onClick={() => onAnswer(call.id)} aria-label={tr('events.ui.accept')}>
          <svg viewBox="0 0 8 8" width="28" height="28" aria-hidden="true" shapeRendering="crispEdges">
            <path fill="#fff" d="M1 1h2v2H1zM2 3h1v1H2zM3 4h1v1H3zM4 5h1v1H4zM5 5h2v2H5z" />
          </svg>
          <span>{tr('events.ui.accept')}</span>
        </button>
      </div>
    </div>
  );
}
