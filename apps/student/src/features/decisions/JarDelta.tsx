import type { AppliedEffects, JarId } from '@paisa/shared';
import { Icon, JAR_ICON } from './icons';
import { jarChanges } from './plan';
import { rupees, signedRupees, t } from './content';
import type { Lang } from './content';

/** One jar's change: jar colour + icon + label + signed amount, and the new balance if given. */
export function JarDelta({ lang, jar, amount, balance }: { lang: Lang; jar: JarId; amount: number; balance?: number }) {
  return (
    <li className={`dc-jar is-${jar}`}>
      <Icon name={JAR_ICON[jar]} />
      <span className="dc-jar-label">{t(lang, `dec.jar.${jar}`)}</span>
      <span className={`dc-jar-num ${amount > 0 ? 'is-up' : 'is-down'}`}>{signedRupees(amount)}</span>
      {balance !== undefined && <span className="dc-jar-now">{t(lang, 'dec.now', { amount: rupees(balance) })}</span>}
    </li>
  );
}

/** Every jar (and the debt) an effect changed. `jars` adds each jar's balance after it. */
export function JarDeltas({ lang, applied, jars, debt }: {
  lang: Lang;
  applied: AppliedEffects;
  jars?: Record<JarId, number>;
  debt?: number;
}) {
  const changes = jarChanges(applied);
  if (changes.length === 0 && applied.debt === 0) return <p className="dc-muted">{t(lang, 'dec.result.nothing')}</p>;
  return (
    <ul className="dc-jars">
      {changes.map((c) => (
        <JarDelta key={c.jar} lang={lang} jar={c.jar} amount={c.amount} balance={jars?.[c.jar]} />
      ))}
      {applied.debt !== 0 && (
        <li className="dc-jar is-debt">
          <Icon name="loan" />
          <span className="dc-jar-label">{t(lang, 'dec.debt')}</span>
          {/* Borrowing more is a "down"; paying back is an "up". */}
          <span className={`dc-jar-num ${applied.debt < 0 ? 'is-up' : 'is-down'}`}>{signedRupees(applied.debt)}</span>
          {debt !== undefined && <span className="dc-jar-now">{t(lang, 'dec.now', { amount: rupees(debt) })}</span>}
        </li>
      )}
    </ul>
  );
}
