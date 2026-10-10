import { useEffect, useRef } from 'react';
import { REST } from '../life/config';
import { schoolToday, workedToday } from '../life/life';
import { PixelIcon } from '../life/PixelIcon';
import type { LifeState } from '../life/types';
import { t } from './content';
import type { Lang } from './content';
import '../../design/kenney.css';
import '../life/life.css';
import './home.css';

/**
 * Home on the map: a sheet at the top of the screen (under the meters bar) with two choices,
 * back to the menu or rest until tomorrow. It only reports the choice; the parent rests.
 */
export function HomeSheet({ lang, state, onMenu, onRest, onClose }: {
  lang: Lang;
  state: LifeState;
  onMenu: () => void;
  onRest: () => void;
  onClose: () => void;
}) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const firstRef = useRef<HTMLButtonElement>(null);
  const school = schoolToday(state);
  const work = workedToday(state);

  useEffect(() => {
    firstRef.current?.focus();
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  return (
    <div className="lf-overlay hm-overlay" lang={lang} onClick={onClose}>
      <div
        className="lf-sheet k-panel hm-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lf-sheet-head">
          <h2 id="hm-title" className="k-banner lf-title">{tr('home.title')}</h2>
          <button className="k-round" onClick={onClose} aria-label={tr('home.close')}>
            <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="#4a2b17" d="M0 0h1v1H0zM6 0h1v1H6zM1 1h1v1H1zM5 1h1v1H5zM2 2h1v1H2zM4 2h1v1H4zM3 3h1v1H3zM2 4h1v1H2zM4 4h1v1H4zM1 5h1v1H1zM5 5h1v1H5zM0 6h1v1H0zM6 6h1v1H6z" />
            </svg>
          </button>
        </div>

        <div className="lf-offers">
          <button ref={firstRef} className="k-btn lf-offer" onClick={onMenu}>
            <span className="lf-offer-icon">
              <PixelIcon id="house" size={32} />
            </span>
            <span className="lf-offer-body">
              <span className="lf-offer-label">{tr('home.menu.label')}</span>
              <span className="lf-offer-hint">{tr('home.menu.hint')}</span>
            </span>
          </button>
          <button className="k-btn lf-offer" onClick={onRest}>
            <span className="lf-offer-icon">
              <PixelIcon id="moon" size={32} />
            </span>
            <span className="lf-offer-body">
              <span className="lf-offer-label">{tr('home.rest.label')}</span>
              <span className="lf-offer-hint">{tr('home.rest.hint', { sanity: REST.sanity, health: REST.health })}</span>
            </span>
          </button>
        </div>

        <p className="hm-today">{tr('home.today', { month: state.month, week: state.week, day: state.day })}</p>
        <ul className="hm-checks">
          <li className={school ? 'is-done' : ''}>
            <PixelIcon id="school" />
            {school ? '✓ ' : '○ '}
            {tr(school ? 'home.done.school' : 'home.todo.school')}
          </li>
          <li className={work ? 'is-done' : ''}>
            <PixelIcon id="coin" />
            {work ? '✓ ' : '○ '}
            {tr(work ? 'home.done.work' : 'home.todo.work')}
          </li>
        </ul>
      </div>
    </div>
  );
}
