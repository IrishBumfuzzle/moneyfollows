import { useEffect, useState } from 'react';
import { projectGrowth } from '@paisa/engine';
import { useGame } from '../../game/useGame';
import type { Profile } from '../onboarding';
import { PixelIcon } from '../life/PixelIcon';
import { DEFAULT_FEED, loadVanguardFeed } from './api';
import type { VanguardFeed } from './api';
import { formatRupees, t } from './content';
import type { Lang } from './content';
import { TIPS } from './tips';

const MONTHLY_MIN = 100;
const MONTHLY_MAX = 1000;
const MONTHLY_STEP = 50;
const YEAR_CHOICES = [1, 5, 10, 20];

/**
 * The Vanguard app: a learning app on the character's phone. My money, a growth explorer (the
 * Time Machine: projectGrowth, always a low/average/high range with the assumption banner,
 * CLAUDE.md 5.4 and 7.2 rule 5), tips of the week and the scam helpline. It never names a
 * product or recommends buying anything.
 */
export function VanguardApp({ lang, profile }: { lang: Lang; profile: Profile }) {
  const life = useGame((s) => s.life);
  const [feed, setFeed] = useState<VanguardFeed>(DEFAULT_FEED);
  const [monthly, setMonthly] = useState(300);
  const [years, setYears] = useState(10);
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);

  useEffect(() => {
    let live = true;
    void loadVanguardFeed(profile).then((f) => live && setFeed(f));
    return () => {
      live = false;
    };
  }, [profile]);

  const p = projectGrowth(monthly, years, feed.rates);
  const pct = (r: number) => Math.round(r * 1000) / 10;
  const rows = [
    { key: 'low', label: tr('phone.vg.growth.low', { rate: pct(feed.rates.low) }), value: p.low[years] },
    { key: 'avg', label: tr('phone.vg.growth.avg', { rate: pct(feed.rates.avg) }), value: p.avg[years] },
    { key: 'high', label: tr('phone.vg.growth.high', { rate: pct(feed.rates.high) }), value: p.high[years] },
  ];
  const max = Math.max(...rows.map((r) => r.value), 1);
  const tips = feed.tips.map((id) => TIPS.find((x) => x.id === id)).filter((x) => x !== undefined);

  return (
    <div className="vg">
      <header className="vg-head">
        <span className="vg-logo" aria-hidden="true">V</span>
        <div>
          <h2 className="vg-title">{tr('phone.vg.title')}</h2>
          <p className="vg-sub">{tr('phone.vg.subtitle')}</p>
        </div>
      </header>

      <section className="vg-card" aria-labelledby="vg-money">
        <h3 id="vg-money" className="vg-h">{tr('phone.vg.my_money')}</h3>
        <dl className="vg-stats">
          <div><dt><PixelIcon id="coin" /> {tr('phone.vg.money')}</dt><dd>{formatRupees(life.money)}</dd></div>
          {life.debt > 0 && <div><dt><PixelIcon id="sack" /> {tr('phone.vg.owe')}</dt><dd className="vg-owe">{formatRupees(life.debt)}</dd></div>}
          <div><dt><PixelIcon id="heart" /> {tr('phone.vg.health')}</dt><dd>{life.vitals.health}</dd></div>
          <div><dt><PixelIcon id="smile" /> {tr('phone.vg.sanity')}</dt><dd>{life.vitals.sanity}</dd></div>
        </dl>
      </section>

      <section className="vg-card" aria-labelledby="vg-growth">
        <h3 id="vg-growth" className="vg-h">{tr('phone.vg.growth.title')}</h3>
        <p>{tr('phone.vg.growth.intro')}</p>
        <label className="vg-slider">
          <span>{tr('phone.vg.growth.monthly', { amount: formatRupees(monthly) })}</span>
          <input
            type="range"
            min={MONTHLY_MIN}
            max={MONTHLY_MAX}
            step={MONTHLY_STEP}
            value={monthly}
            onChange={(e) => setMonthly(Number(e.target.value))}
            aria-valuetext={formatRupees(monthly)}
          />
        </label>
        <p className="vg-label">{tr('phone.vg.growth.years')}</p>
        <div className="vg-chips" role="group" aria-label={tr('phone.vg.growth.years')}>
          {YEAR_CHOICES.map((y) => (
            <button key={y} className={`vg-chip ${y === years ? 'is-on' : ''}`} aria-pressed={y === years} onClick={() => setYears(y)}>
              {tr('phone.vg.growth.year_n', { n: y })}
            </button>
          ))}
        </div>
        <p className="vg-put-in">{tr('phone.vg.growth.put_in', { amount: formatRupees(monthly * 12 * years) })}</p>
        <ul className="vg-bars">
          {rows.map((r) => (
            <li key={r.key} className={`vg-bar is-${r.key}`}>
              <span className="vg-bar-label">{r.label}</span>
              <span className="vg-bar-track">
                <span className="vg-bar-fill" style={{ width: `${(100 * r.value) / max}%` }} />
              </span>
              <span className="vg-bar-value">{formatRupees(r.value)}</span>
            </li>
          ))}
        </ul>
        <p className="vg-assume" role="note">
          <PixelIcon id="warn" /> {tr('phone.vg.assumption')}
        </p>
        <p className="vg-what">{tr('phone.vg.growth.what')}</p>
      </section>

      <section className="vg-card" aria-labelledby="vg-tips">
        <h3 id="vg-tips" className="vg-h">{tr('phone.vg.tips')}</h3>
        <ul className="vg-tips">
          {tips.map((tip) => (
            <li key={tip.id}>
              <p className="vg-tip-title">{tr(`${tip.id}.title`)}</p>
              <p>{tr(`${tip.id}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="vg-safe">{tr('phone.vg.safe')}</p>
      <p className="vg-footer">{tr('phone.vg.footer')}</p>
    </div>
  );
}
