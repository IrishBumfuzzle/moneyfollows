import { useEffect, useRef } from 'react';
import type { Overnight } from '../../game/useGame';
import { rupees } from '../decisions/content';
import { FlashbackCard } from '../decisions/FlashbackCard';
import { JarDeltas } from '../decisions/JarDelta';
import { t } from './content';
import type { Lang } from './content';
import '../../design/kenney.css';
import '../decisions/decisions.css';
import './home.css';

/**
 * After the week ends at Home: payday (the month's income split into the four jars) and
 * flashbacks, the delayed effects of earlier choices that land now.
 */
export function OvernightSheet({ lang, name, overnight, onClose }: {
  lang: Lang;
  name: string;
  overnight: Overnight;
  onClose: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const { payday, landed } = overnight;
  return (
    <div className="dc-overlay" lang={lang}>
      <div className="dc-sheet k-panel" role="dialog" aria-modal="true" aria-labelledby="hm-night-title">
        <h2 id="hm-night-title" className="k-banner dc-title">
          {t(lang, payday ? 'home.payday.title' : 'home.overnight.title')}
        </h2>
        {payday && (
          <>
            <p>{t(lang, 'home.payday.intro', { name, amount: rupees(payday.income) })}</p>
            <JarDeltas lang={lang} applied={payday.applied} />
          </>
        )}
        {landed.map((item, i) => (
          <FlashbackCard key={i} lang={lang} name={name} item={item} />
        ))}
        <button ref={ref} className="k-btn is-primary dc-wide" onClick={onClose}>
          {t(lang, payday ? 'home.payday.ok' : 'home.overnight.ok')}
        </button>
      </div>
    </div>
  );
}
