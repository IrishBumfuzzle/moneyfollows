import { useEffect, useRef, useState } from 'react';
import { t as storeT } from '../store/content';
import { WORK } from './config';
import { rupees, signed, signedRupees, t } from './content';
import type { Lang } from './content';
import { lifeApi } from './life';
import { PixelIcon } from './PixelIcon';
import type { LifeDelta, LifeOutcome, LifeState, ShopKind } from './types';
import '../../design/kenney.css';
import './life.css';

/**
 * The convenience store's two options as a bottom sheet over the map, plus a shift at the
 * counter (the Counter Shift mini-game). It only asks lifeApi and reports the outcome; the
 * parent owns the state (and later queues toLifeEvent).
 */
export function StoreSheet<S extends LifeState>({ lang, state, worked, onBuy, onWork, onClose }: {
  lang: Lang;
  state: S;
  /** Already worked this week: the counter shift is practice only. */
  worked: boolean;
  onBuy: (kind: ShopKind, outcome: LifeOutcome<S>) => void;
  onWork: () => void;
  onClose: () => void;
}) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const [last, setLast] = useState<{ id: number; delta: LifeDelta } | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  function buy(kind: ShopKind) {
    const out = lifeApi.buy(state, kind);
    if (out.blocked) return;
    setLast((p) => ({ id: (p?.id ?? 0) + 1, delta: out.delta }));
    onBuy(kind, out);
  }

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
          {lifeApi.shopOffers(state).map((o, i) => (
            <button
              key={o.kind}
              ref={i === 0 ? firstRef : undefined}
              className={`k-btn lf-offer ${o.affordable ? '' : 'is-dim'}`}
              aria-disabled={!o.affordable}
              onClick={() => buy(o.kind)}
            >
              <span className="lf-offer-icon">
                <PixelIcon id={o.icon} size={32} />
              </span>
              <span className="lf-offer-body">
                <span className="lf-offer-label">{tr(o.label)}</span>
                <span className="lf-offer-hint">{tr(o.hint)}</span>
                <span className="lf-offer-cost">
                  <span>{rupees(o.price)}</span>
                  <span className="lf-inline">
                    <PixelIcon id="smile" />
                    {tr('life.meter.sanity')} {signed(o.sanity)}
                  </span>
                </span>
                {!o.affordable && <span className="lf-offer-why">{tr('life.blocked.not_enough_money')}</span>}
              </span>
            </button>
          ))}
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

        <p className="lf-status" role="status" aria-live="polite">
          {last && (
            <span key={last.id} className="lf-status-text">
              {tr('life.store.bought')} {signedRupees(last.delta.money)}
              {last.delta.sanity !== 0 && ` · ${tr('life.meter.sanity')} ${signed(last.delta.sanity)}`}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
