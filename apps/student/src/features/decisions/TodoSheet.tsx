import { useEffect, useRef } from 'react';
import { Icon } from './icons';
import type { PlanPin } from './plan';
import { t } from './content';
import type { Lang } from './content';
import '../../design/kenney.css';
import './decisions.css';

const PLACE_ICON: Record<string, string> = { home: 'house', convenience: 'basket', school: 'book', hospital: 'shield', bank: 'coins' };

/**
 * Resting on day 7 ends the week, so it waits until this week's pins are played (CLAUDE.md
 * 5.8). A friendly list of what's left; tapping one plays it straight away.
 */
export function TodoSheet({ lang, pins, onPlay, onClose }: {
  lang: Lang;
  pins: PlanPin[];
  onPlay: (pin: PlanPin) => void;
  onClose: () => void;
}) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  return (
    <div className="dc-overlay" lang={lang} onClick={onClose}>
      <div
        className="dc-sheet k-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dc-todo-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dc-todo-title" className="k-banner dc-title">{t(lang, 'dec.todo.title')}</h2>
        <p>{t(lang, 'dec.todo.intro')}</p>
        <ul className="dc-todo">
          {pins.map((p, i) => (
            <li key={p.scenarioId}>
              <button ref={i === 0 ? firstRef : undefined} className="k-btn dc-choice is-pin" onClick={() => onPlay(p)}>
                <Icon name={PLACE_ICON[p.location]} size={32} />
                <span>{t(lang, `t:place.${p.sublocation ?? p.location}`)}</span>
              </button>
            </li>
          ))}
        </ul>
        <button className="k-btn dc-wide" onClick={onClose}>
          {t(lang, 'dec.todo.back')}
        </button>
      </div>
    </div>
  );
}
