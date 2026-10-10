import { rupees, signed, signedRupees, t } from './content';
import { PixelIcon } from './PixelIcon';
import type { Lang } from './content';
import type { IconId, LifeDelta, LifeState } from './types';
import '../../design/kenney.css';
import './life.css';

/** The last change to show as "+12" pops; `id` restarts the pop when the same change repeats. */
export interface MeterPop {
  id: number;
  delta: LifeDelta;
}

// Icon + label + number on every meter, never colour alone (CLAUDE.md 6).
export function MetersBar({ lang, state, pop }: { lang: Lang; state: LifeState; pop?: MeterPop | null }) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  const d = pop?.delta;
  return (
    <section className="lf-bar k-panel" lang={lang} aria-label={tr('life.meters.label')}>
      <div className="lf-meter">
        <span className="lf-meter-head">
          <PixelIcon id="coin" />
          <span>{tr('life.meter.money')}</span>
        </span>
        <span className="lf-value-row">
          <span className="lf-value">{rupees(state.money)}</span>
          {d && d.money !== 0 && (
            <span key={pop.id} className={`lf-pop ${d.money > 0 ? 'is-up' : 'is-down'}`} aria-hidden="true">
              {signedRupees(d.money)}
            </span>
          )}
        </span>
        {state.debt > 0 && <span className="lf-debt">{tr('life.meter.debt', { debt: rupees(state.debt) })}</span>}
      </div>
      <Vital lang={lang} id="health" icon="heart" value={state.vitals.health} change={d?.health} popId={pop?.id} />
      <Vital lang={lang} id="sanity" icon="smile" value={state.vitals.sanity} change={d?.sanity} popId={pop?.id} />
    </section>
  );
}

function Vital({ lang, id, icon, value, change, popId }: {
  lang: Lang;
  id: 'health' | 'sanity';
  icon: IconId;
  value: number;
  change?: number;
  popId?: number;
}) {
  const label = t(lang, `life.meter.${id}`);
  return (
    <div className="lf-meter">
      <span className="lf-meter-head">
        <PixelIcon id={icon} />
        <span>{label}</span>
      </span>
      <span className="lf-value-row">
        <span className="lf-value">{value}</span>
        {change ? (
          <span key={popId} className={`lf-pop ${change > 0 ? 'is-up' : 'is-down'}`} aria-hidden="true">
            {signed(change)}
          </span>
        ) : null}
      </span>
      <span
        className={`lf-track is-${id}`}
        role="meter"
        aria-label={t(lang, 'life.meter.value', { label, value })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span className="lf-fill" style={{ width: `${value}%` }} />
      </span>
    </div>
  );
}
