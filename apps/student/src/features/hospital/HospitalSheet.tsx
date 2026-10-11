import { useEffect, useRef } from 'react';
import { PixelIcon } from '../life/PixelIcon';
import { t } from './content';
import type { Lang } from './content';
import '../../design/kenney.css';
import '../life/life.css';

/**
 * The hospital as a bottom sheet over the map, like the store's: it only opens the two
 * insurance mini-games, Cover or Cash? and Claim Desk.
 */
export function HospitalSheet({ lang, onCover, onClaims, onClose }: {
  lang: Lang;
  onCover: () => void;
  onClaims: () => void;
  onClose: () => void;
}) {
  const tr = (key: string) => t(lang, key);
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
        aria-labelledby="lf-hospital-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lf-sheet-head">
          <h2 id="lf-hospital-title" className="k-banner lf-title">{tr('hospital.title')}</h2>
          <button className="k-round" onClick={onClose} aria-label={tr('hospital.close')}>
            <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="#4a2b17" d="M0 0h1v1H0zM6 0h1v1H6zM1 1h1v1H1zM5 1h1v1H5zM2 2h1v1H2zM4 2h1v1H4zM3 3h1v1H3zM2 4h1v1H2zM4 4h1v1H4zM1 5h1v1H1zM5 5h1v1H5zM0 6h1v1H0zM6 6h1v1H6z" />
            </svg>
          </button>
        </div>

        <p>{tr('hospital.intro')}</p>

        <div className="lf-offers">
          <button ref={firstRef} className="k-btn lf-offer" onClick={onCover}>
            <span className="lf-offer-icon">
              <PixelIcon id="cross" size={32} />
            </span>
            <span className="lf-offer-body">
              <span className="lf-offer-label">{tr('hospital.cover.label')}</span>
              <span className="lf-offer-hint">{tr('hospital.cover.hint')}</span>
            </span>
          </button>
          <button className="k-btn lf-offer" onClick={onClaims}>
            <span className="lf-offer-icon">
              <PixelIcon id="bandage" size={32} />
            </span>
            <span className="lf-offer-body">
              <span className="lf-offer-label">{tr('hospital.claims.label')}</span>
              <span className="lf-offer-hint">{tr('hospital.claims.hint')}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
