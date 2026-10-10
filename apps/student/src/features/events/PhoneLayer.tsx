import { useEffect } from 'react';
import { PixelIcon } from '../life/PixelIcon';
import { t } from './content';
import type { Lang } from './content';
import { getEvent } from './data';
import { useEvents } from './useEvents';
import '../../design/kenney.css';
import './events.css';

const BANNER_MS = 7000;

/**
 * The phone button (with an unread count) and the banner a new message drops in as. Rendered
 * only on the map and main screen, so a message never interrupts a scene; it waits in the inbox.
 */
export function PhoneLayer({ lang, name, where, onOpen }: {
  lang: Lang;
  name: string;
  where: 'map' | 'main';
  onOpen: (threadId?: string) => void;
}) {
  const notify = useEvents((s) => s.notify);
  const unread = useEvents((s) => s.inbox.filter((m) => !m.read).length + s.calls.filter((c) => c.status === 'missed').length);
  const dismiss = useEvents((s) => s.dismissNotify);
  // A sudden event or a ringing call has the player's full attention; the banner waits.
  const busy = useEvents((s) => s.sudden !== null || s.ringing !== null);
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, { name, ...vars });

  useEffect(() => {
    if (!notify || busy) return;
    const id = window.setTimeout(dismiss, BANNER_MS);
    return () => window.clearTimeout(id);
  }, [notify, busy, dismiss]);

  const ev = notify && !busy ? getEvent(notify) : undefined;
  const thread = ev?.kind === 'phone' ? ev : undefined;

  return (
    <div className={`ev-phone-layer is-${where}`} lang={lang}>
      <button className="ev-phone-btn" onClick={() => onOpen()} aria-label={`${tr('events.ui.open_phone')}${unread ? `, ${tr('events.ui.unread', { n: unread })}` : ''}`}>
        <PixelIcon id="phone" size={32} />
        {unread > 0 && (
          <span className="ev-phone-badge" aria-hidden="true">
            {unread}
          </span>
        )}
      </button>

      {thread && (
        <div className="ev-banner k-panel" role="status">
          <button
            className="ev-banner-main"
            onClick={() => {
              dismiss();
              onOpen(thread.id);
            }}
          >
            <PixelIcon id={thread.icon} size={24} />
            <span className="ev-banner-body">
              <span className="ev-banner-top">
                <span className="ev-banner-sender">{tr(thread.sender)}</span>
                <span className="ev-muted">{tr('events.ui.new_message')}</span>
              </span>
              <span className="ev-banner-text">{tr(thread.messages[0])}</span>
            </span>
          </button>
          <button className="ev-banner-later" onClick={dismiss}>
            {tr('events.ui.dismiss')}
          </button>
        </div>
      )}
    </div>
  );
}
