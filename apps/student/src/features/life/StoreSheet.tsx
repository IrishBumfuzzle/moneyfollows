import { useEffect, useRef } from 'react';
import { t as storeT } from '../store/content';
import { WORK } from './config';
import { rupees, t } from './content';
import type { Lang } from './content';
import { PixelIcon } from './PixelIcon';
import type { LifeState } from './types';
import '../../design/kenney.css';
import './life.css';

/**
 * The convenience store as a bottom sheet over the map: go shopping (the Kirana Run mini-game)
 * or work a shift at the counter (the Counter Shift mini-game). The games do the buying and
 * earning; this sheet only opens them.
 */
export function StoreSheet({ lang, state, worked, onShop, onWork, onClose }: {
  lang: Lang;
  state: LifeState;
  /** Already worked this week: the counter shift is practice only. */
  worked: boolean;
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
          <button ref={firstRef} className="k-btn lf-offer" onClick={onShop}>
            <span className="lf-offer-icon">
              <PixelIcon id="sack" size={32} />
            </span>
            <span className="lf-offer-body">
              <span className="lf-offer-label">{storeT(lang, 'store.sheet.shop.label')}</span>
              <span className="lf-offer-hint">{storeT(lang, 'store.sheet.shop.hint')}</span>
            </span>
          </button>
          <button className="k-btn lf-offer" onClick={onWork}>
            <span className="lf-offer-icon">
              <PixelIcon id="coin" size={32} />
            </span>
            <span className="lf-offer-body">
              <span className="lf-offer-label">{storeT(lang, 'counter.store.label')}</span>
              <span className="lf-offer-hint">
                {worked ? storeT(lang, 'counter.store.practice') : storeT(lang, 'counter.store.hint', { money: rupees(WORK.wage) })}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
