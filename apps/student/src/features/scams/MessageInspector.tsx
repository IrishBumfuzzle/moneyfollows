import type { ScamMessage } from '@paisa/shared';
import { PixelIcon } from '../life/PixelIcon';
import { t } from './content';
import type { Lang } from './content';

/**
 * The Message Inspector (CLAUDE.md 6): a message drawn as a phone card (SMS, WhatsApp, a call
 * or a QR code), one tappable line per segment. Inspecting a suspicious line highlights it and
 * shows its reason; an ordinary line says so. `reveal` shows every reason (after the call).
 */
export function MessageInspector({ lang, message, inspected, reveal = false, onInspect }: {
  lang: Lang;
  message: ScamMessage;
  inspected: ReadonlySet<number>;
  reveal?: boolean;
  onInspect: (index: number) => void;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  return (
    <figure className={`mi-card is-${message.channel}`}>
      <figcaption className="mi-head">
        <span className="mi-avatar" aria-hidden="true">
          <PixelIcon id={message.channel === 'call' ? 'phone' : 'person'} size={24} />
        </span>
        <span className="mi-sender">{tr(message.sender)}</span>
        <span className="mi-channel">{tr(`scams.channel.${message.channel}`)}</span>
      </figcaption>
      <ul className="mi-lines">
        {message.segments.map((seg, i) => {
          const open = inspected.has(i) || reveal;
          const flagged = open && seg.suspicious;
          const text = tr(seg.text);
          return (
            <li key={i}>
              <button
                className={`mi-line ${open ? 'is-open' : ''} ${flagged ? 'is-flagged' : ''}`}
                aria-expanded={open}
                aria-label={tr('scams.inspect.line', { text })}
                onClick={() => onInspect(i)}
              >
                <span className="mi-text">{text}</span>
              </button>
              {open && (
                <p className={`mi-reason ${flagged ? 'is-flagged' : ''}`} role="status">
                  <PixelIcon id={flagged ? 'warn' : 'smile'} />
                  <span>{seg.suspicious ? tr(seg.suspicious) : tr('scams.inspect.ok')}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
