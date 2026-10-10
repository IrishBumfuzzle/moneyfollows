import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ShopKind } from '../life/types';
import { PixelIcon } from '../life/PixelIcon';
import { NEED_HEALTH } from '../life/config';
import { rupees, t } from './content';
import type { Lang } from './content';
import { checkout, dealTrip } from './kirana';
import type { Receipt, ShelfItem } from './kirana';
import '../../design/kenney.css';
import '../life/life.css'; // the 'Paisa Digits' face
import './counter.css';

/**
 * The convenience store's shopping mini-game: Ammi's list, the player's plan for the trip, and
 * a basket filled from the needs and wants shelves. It only plays the trip; `onPay` hands the
 * receipt to the parent, which takes the money and applies sanity and health through lifeApi.
 */
export function KiranaRun({ lang, seed, money, onPay, onExit }: {
  lang: Lang;
  seed: number;
  /** The wallet: a basket can't cost more. */
  money: number;
  /** Pays for the basket; returns false if the wallet could not cover it. */
  onPay: (receipt: Receipt) => boolean;
  onExit: () => void;
}) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const trip = useMemo(() => dealTrip(seed), [seed]);
  const [basket, setBasket] = useState<string[]>([]);
  const [paid, setPaid] = useState<Receipt | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const preview = checkout(trip, basket);
  const affordable = preview.total <= money;
  const item = (id: string) => tr(`store.item.${id}`);

  useEffect(() => {
    if (paid) headRef.current?.focus();
  }, [paid]);

  const toggle = (id: string) => setBasket((b) => (b.includes(id) ? b.filter((x) => x !== id) : [...b, id]));

  function pay() {
    if (basket.length === 0 || !affordable) return;
    if (onPay(preview)) setPaid(preview);
  }

  const shelf = (kind: ShopKind, items: ShelfItem[]) => (
    <section className="kr-shelf" aria-labelledby={`kr-${kind}`}>
      <h2 id={`kr-${kind}`} className="kr-shelf-title">
        <PixelIcon id={kind === 'necessity' ? 'sack' : 'headphones'} size={24} />
        {tr(kind === 'necessity' ? 'kirana.needs' : 'kirana.wants')}
      </h2>
      <p className="ct-note">
        {kind === 'necessity' ? tr('kirana.needs.hint', { health: NEED_HEALTH }) : tr('kirana.wants.hint')}
      </p>
      <div className="kr-grid">
        {items.map((it) => {
          const inBasket = basket.includes(it.id);
          return (
            <button
              key={it.id}
              className={`k-btn kr-item ${inBasket ? 'is-correct' : ''}`}
              aria-pressed={inBasket}
              aria-label={tr(inBasket ? 'kirana.remove' : 'kirana.add', { item: item(it.id) })}
              onClick={() => toggle(it.id)}
            >
              <span className="kr-item-name">{item(it.id)}</span>
              <span className="kr-item-price">{rupees(it.price)}</span>
              <span className="kr-item-fx">
                <span className="lf-inline"><PixelIcon id="smile" />+{it.sanity}</span>
                {it.health > 0 && <span className="lf-inline"><PixelIcon id="heart" />+{it.health}</span>}
              </span>
              {trip.list.includes(it.id as never) && <span className="kr-tag">{tr('kirana.on_list')}</span>}
              {inBasket && <span className="kr-tag">{tr('kirana.in_basket')}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="ct-screen" lang={lang}>
      <div className="ct-card k-panel">
        <div className="ct-head">
          <button className="k-round" onClick={onExit} aria-label={tr('kirana.back')}>
            <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="#4a2b17" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
            </svg>
          </button>
          <h1 className="k-banner ct-title">{tr('kirana.title')}</h1>
          <span className="ct-earned">{tr('kirana.wallet', { money: rupees(money) })}</span>
        </div>

        {paid ? (
          <ReceiptView receipt={paid} trip={trip} tr={tr} item={item} headRef={headRef} onDone={onExit} />
        ) : (
          <>
            <section className="ct-bill kr-list" aria-labelledby="kr-list">
              <h2 id="kr-list" className="kr-shelf-title">{tr('kirana.list')}</h2>
              <ul>
                {trip.list.map((id) => {
                  const got = basket.includes(id);
                  return (
                    <li key={id}>
                      <span>{got ? '✓' : '○'} {item(id)}</span>
                      <span className={got ? 'kr-got' : 'ct-note'}>{tr(got ? 'kirana.list.got' : 'kirana.list.todo')}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="ct-total">
                <span>{tr('kirana.plan', { money: rupees(trip.plan) })}</span>
              </p>
            </section>

            {shelf('necessity', trip.needs)}
            {shelf('want', trip.wants)}

            <div className="kr-basket k-panel">
              <p className="kr-basket-sum" aria-live="polite">
                <span>{tr('kirana.basket', { money: rupees(preview.total) })}</span>
                <span className={preview.withinPlan ? 'kr-got' : 'kr-over'}>
                  {preview.withinPlan
                    ? tr('kirana.basket.plan_ok')
                    : tr('kirana.basket.over_plan', { money: rupees(preview.total - trip.plan) })}
                </span>
              </p>
              {!affordable && <p className="kr-over" role="status">{tr('kirana.basket.too_much')}</p>}
              <button className="k-btn is-primary ct-main" onClick={pay} disabled={basket.length === 0 || !affordable}>
                {tr('kirana.pay', { money: rupees(preview.total) })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type Tr = (key: string, vars?: Record<string, string | number>) => string;

function ReceiptView({ receipt, trip, tr, item, headRef, onDone }: {
  receipt: Receipt;
  trip: { plan: number };
  tr: Tr;
  item: (id: string) => string;
  headRef: RefObject<HTMLHeadingElement>;
  onDone: () => void;
}) {
  const { spent } = receipt;
  const lesson =
    spent.want === 0 ? 'kirana.lesson.needs_only' : spent.necessity === 0 ? 'kirana.lesson.wants_only' : 'kirana.lesson.with_wants';
  return (
    <section className="ct-body">
      <h2 ref={headRef} tabIndex={-1}>{tr('kirana.receipt')}</h2>
      <div className="ct-bill">
        <ul>
          {receipt.items.map((it) => (
            <li key={it.id}>
              <span>{item(it.id)}</span>
              <span className="ct-num">{rupees(it.price)}</span>
            </li>
          ))}
        </ul>
        <p className="ct-total">
          <span>{tr('kirana.total')}</span>
          <span className="ct-num">{rupees(receipt.total)}</span>
        </p>
      </div>
      <p className="kr-fx">
        <span className="lf-inline"><PixelIcon id="smile" />{tr('kirana.got.sanity', { n: receipt.sanity })}</span>
        <span className="lf-inline"><PixelIcon id="heart" />{tr('kirana.got.health', { n: receipt.health })}</span>
      </p>
      <p>{tr('kirana.split', { needs: rupees(spent.necessity), wants: rupees(spent.want) })}</p>
      <ul className="kr-checks">
        <li className={receipt.listDone ? 'kr-got' : 'kr-over'}>
          {receipt.listDone ? '✓ ' : '✗ '}
          {receipt.listDone
            ? tr('kirana.check.list_done')
            : tr('kirana.check.list_missed', { items: receipt.missing.map(item).join(', ') })}
        </li>
        <li className={receipt.withinPlan ? 'kr-got' : 'kr-over'}>
          {receipt.withinPlan ? '✓ ' : '✗ '}
          {receipt.withinPlan
            ? tr('kirana.check.plan_ok')
            : tr('kirana.check.plan_over', { money: rupees(receipt.total - trip.plan) })}
        </li>
      </ul>
      <p className="ct-feedback k-panel">{tr(lesson)}</p>
      <button className="k-btn is-primary ct-main" onClick={onDone}>
        {tr('kirana.done')}
      </button>
    </section>
  );
}
