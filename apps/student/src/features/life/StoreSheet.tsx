import { useEffect, useRef } from 'react';
import { t as placeT } from '../decisions/content';
import { Icon } from '../decisions/icons';
import { subPlaces } from '../decisions/plan';
import { t as storeT } from '../store/content';
import { WORK } from './config';
import { rupees, t } from './content';
import type { Lang } from './content';
import { PixelIcon } from './PixelIcon';
import type { LifeState } from './types';
import '../../design/kenney.css';
import './life.css';

const KIRANA = 'convenience.kirana';
const SPOT_ICON: Record<string, string> = { 'convenience.phone_shop': 'phone', [KIRANA]: 'basket', 'convenience.clothes_stall': 'festival' };

/**
 * The Shop's sub-map as a bottom sheet over the map (CLAUDE.md 5.8): the phone shop, the
 * kirana and the clothes stall (places.json), plus a shift at the counter (Counter Shift; once
 * a day, after school). A spot holding this week's pin shows a badge and plays it first; the
 * kirana otherwise opens Kirana Run. The games and scenes do the buying and earning.
 */
export function StoreSheet({ lang, state, work, pinned = [], onSpot, onShop, onWork, onClose }: {
  lang: Lang;
  state: LifeState;
  /** Work is once a day, after school: 'open', 'practice' (already worked today) or 'school_first'. */
  work: 'open' | 'practice' | 'school_first';
  /** Sub-map spots holding one of this week's pins, e.g. "convenience.phone_shop". */
  pinned?: readonly string[];
  /** A pinned spot was tapped: play its card. */
  onSpot: (spot: string) => void;
  onShop: () => void;
  onWork: () => void;
  onClose: () => void;
}) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  return (
    <div className="lf-overlay" lang={lang} onClick={onClose}>
      <div
        className="lf-sheet k-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lf-store-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lf-sheet-head">
          <h2 id="lf-store-title" className="k-banner lf-title">{tr('life.store.title')}</h2>
          <button className="k-round" onClick={onClose} aria-label={tr('life.store.close')}>
            <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="#4a2b17" d="M0 0h1v1H0zM6 0h1v1H6zM1 1h1v1H1zM5 1h1v1H5zM2 2h1v1H2zM4 2h1v1H4zM3 3h1v1H3zM2 4h1v1H2zM4 4h1v1H4zM1 5h1v1H1zM5 5h1v1H5zM0 6h1v1H0zM6 6h1v1H6z" />
            </svg>
          </button>
        </div>

        <p>{tr('life.store.intro', { money: rupees(state.money) })}</p>

        <div className="lf-offers">
          {subPlaces('convenience').map((spot, i) => {
            const pin = pinned.includes(spot);
            // Without a pin, only the kirana has something to do: Kirana Run.
            const open = pin || spot === KIRANA;
            return (
              <button
                key={spot}
                ref={i === 0 ? firstRef : undefined}
                className={`k-btn lf-offer ${open ? '' : 'is-dim'} ${pin ? 'is-pinned' : ''}`}
                aria-disabled={!open}
                onClick={() => (pin ? onSpot(spot) : spot === KIRANA ? onShop() : undefined)}
              >
                <span className="lf-offer-icon">
                  <Icon name={SPOT_ICON[spot]} size={32} />
                </span>
                <span className="lf-offer-body">
                  <span className="lf-offer-label">
                    {placeT(lang, `t:place.${spot}`)}
                    {pin && <span className="lf-spot-pin" aria-hidden="true">!</span>}
                  </span>
                  <span className="lf-offer-hint">
                    {pin
                      ? tr('life.store.spot.pinned')
                      : spot === KIRANA
                        ? storeT(lang, 'store.sheet.shop.hint')
                        : tr('life.store.spot.quiet')}
                  </span>
                </span>
              </button>
            );
          })}
          <button
            className={`k-btn lf-offer ${work === 'school_first' ? 'is-dim' : ''}`}
            aria-disabled={work === 'school_first'}
            onClick={() => work !== 'school_first' && onWork()}
          >
            <span className="lf-offer-icon">
              <PixelIcon id="coin" size={32} />
            </span>
            <span className="lf-offer-body">
              <span className="lf-offer-label">{storeT(lang, 'counter.store.label')}</span>
              <span className="lf-offer-hint">
                {work === 'practice'
                  ? storeT(lang, 'counter.store.practice')
                  : storeT(lang, 'counter.store.hint', { money: rupees(WORK.wage) })}
              </span>
              {work === 'school_first' && <span className="lf-offer-why">{storeT(lang, 'counter.store.school_first')}</span>}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
