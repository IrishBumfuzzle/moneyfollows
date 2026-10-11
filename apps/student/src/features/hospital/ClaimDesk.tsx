import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelIcon } from '../life/PixelIcon';
import { rupees, t } from './content';
import type { Lang } from './content';
import { LIFE_COVER, LIFE_YEARS, WAITING_DAYS, dealClaims, judge, score, split } from './claims';
import type { Claim, ClaimReason, PolicyId, Verdict } from './claims';
import { COPAY_PCT } from './cover';
import { BackButton } from './BackButton';
import '../../design/kenney.css';
import '../life/life.css'; // the 'Paisa Digits' face
import '../store/counter.css';
import './hospital.css';

type Phase = 'intro' | 'judge' | 'feedback' | 'done';
type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** Each policy's rules, in the order the card lists them: what it pays, then what it doesn't. */
const RULES: Record<PolicyId, { reason: ClaimReason; pays: boolean }[]> = {
  health: [
    { reason: 'stay', pays: true },
    { reason: 'accident', pays: true },
    { reason: 'waiting', pays: false },
    { reason: 'opd', pays: false },
    { reason: 'cosmetic', pays: false },
    { reason: 'lapsed', pays: false },
  ],
  life: [
    { reason: 'life_paid', pays: true },
    { reason: 'term_end', pays: false },
    { reason: 'life_lapsed', pays: false },
  ],
};

/** The amounts and numbers any rule or explanation line can use, already formatted. */
const VARS = {
  shield: 100 - COPAY_PCT,
  copay: COPAY_PCT,
  days: WAITING_DAYS,
  years: LIFE_YEARS,
  money: rupees(LIFE_COVER),
};

/**
 * The hospital's insurance-desk mini-game: judge six claims against the policy card. Practice
 * only; `onFinish` reports the score for the tracker.
 */
export function ClaimDesk({ lang, seed, onFinish, onExit }: {
  lang: Lang;
  seed: number;
  /** Called once when the desk closes, with the number judged right. */
  onFinish: (result: { score: number; total: number }) => void;
  onExit: () => void;
}) {
  const tr: Tr = (key, vars) => t(lang, key, vars);
  const round = useMemo(() => dealClaims(seed), [seed]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const headRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const claim = round[index]!;
  const verdict = verdicts[index];
  const last = index === round.length - 1;
  const right = score(verdicts);

  // Focus follows the step: the heading for a new claim, Next once the explanation shows.
  useEffect(() => {
    (phase === 'feedback' ? nextRef : headRef).current?.focus();
  }, [phase, index]);

  function answer(saysCovered: boolean) {
    setVerdicts((v) => [...v, judge(claim, saysCovered)]);
    setPhase('feedback');
  }

  function next() {
    if (last) {
      setPhase('done');
      onFinish({ score: right, total: round.length });
      return;
    }
    setIndex((i) => i + 1);
    setPhase('judge');
  }

  return (
    <div className="ct-screen" lang={lang}>
      <div className="ct-card k-panel">
        <div className="ct-head">
          <BackButton label={tr('hospital.back')} onClick={onExit} />
          <h1 className="k-banner ct-title">{tr('claims.title')}</h1>
          {phase !== 'intro' && <span className="ct-earned">{tr('claims.score', { n: right })}</span>}
        </div>

        {(phase === 'judge' || phase === 'feedback') && (
          <ol className="ct-pips" aria-label={tr('claims.progress', { n: index + 1, total: round.length })}>
            {round.map((_, i) => {
              const v = verdicts[i];
              const state = v ? (v.ok ? 'is-right' : 'is-wrong') : i === index ? 'is-now' : '';
              return <li key={i} className={`k-pip ${state}`} />;
            })}
          </ol>
        )}

        {phase === 'intro' && (
          <section className="ct-body">
            <h2 ref={headRef} tabIndex={-1}>{tr('claims.intro.title')}</h2>
            <p>{tr('claims.intro.body')}</p>
            <p className="ct-note">{tr('claims.intro.note')}</p>
            <button className="k-btn is-primary ct-main" onClick={() => setPhase('judge')}>
              {tr('claims.start')}
            </button>
          </section>
        )}

        {(phase === 'judge' || phase === 'feedback') && (
          <section className="ct-body">
            <h2 ref={headRef} tabIndex={-1} className="ct-who">
              <PixelIcon id="person" size={24} />
              {tr(`claims.who.${claim.who}`)}
            </h2>
            <ClaimSlip claim={claim} tr={tr} />
            <PolicyCard policy={claim.policy} tr={tr} highlight={phase === 'feedback' ? claim.reason : undefined} />

            {phase === 'judge' && (
              <>
                <p>{tr('claims.ask')}</p>
                <div className="ct-actions">
                  <button className="k-btn ct-main" onClick={() => answer(true)}>
                    ✓ {tr('claims.yes')}
                  </button>
                  <button className="k-btn ct-main" onClick={() => answer(false)}>
                    ✗ {tr('claims.no')}
                  </button>
                </div>
              </>
            )}

            {phase === 'feedback' && verdict && (
              <div className={`ct-feedback k-panel ${verdict.ok ? 'is-right' : 'is-wrong'}`} role="status">
                <p className="ct-feedback-title">
                  {tr(verdict.ok ? 'claims.right' : 'claims.wrong')} {tr(claim.covered ? 'claims.answer.yes' : 'claims.answer.no')}
                </p>
                <p>{tr(`claims.why.${claim.reason}`, whyVars(claim))}</p>
                <button ref={nextRef} className="k-btn is-primary ct-main" onClick={next}>
                  {tr(last ? 'claims.finish' : 'claims.next')}
                </button>
              </div>
            )}
          </section>
        )}

        {phase === 'done' && (
          <section className="ct-body ct-done">
            <h2 ref={headRef} tabIndex={-1}>{tr('claims.done.title')}</h2>
            <p>{tr('claims.done.score', { n: right, total: round.length })}</p>
            <p className="ct-feedback k-panel">{tr('claims.done.lesson')}</p>
            <p className="ct-note">{tr('claims.done.term')}</p>
            <button className="k-btn is-primary ct-main" onClick={onExit}>
              {tr('hospital.done')}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

function whyVars(claim: Claim) {
  const { youPay, policyPays } = split(claim);
  return { ...VARS, you: rupees(youPay), policy: rupees(policyPays) };
}

function ClaimSlip({ claim, tr }: { claim: Claim; tr: Tr }) {
  return (
    <div className="ct-bill">
      <p>{tr(`claims.case.${claim.id}`)}</p>
      <p className="ct-total">
        <span>{tr(claim.policy === 'health' ? 'claims.bill.health' : 'claims.bill.life')}</span>
        <span className="ct-num">{rupees(claim.bill)}</span>
      </p>
    </div>
  );
}

function PolicyCard({ policy, tr, highlight }: { policy: PolicyId; tr: Tr; highlight?: ClaimReason }) {
  const id = `hp-policy-${policy}`;
  return (
    <section className="ct-bill hp-policy" aria-labelledby={id}>
      <h3 id={id} className="hp-policy-title">
        <PixelIcon id={policy === 'health' ? 'cross' : 'heart'} size={24} />
        {tr('claims.policy')}: {tr(`policy.${policy}.name`)}
      </h3>
      <ul className="hp-rules">
        {RULES[policy].map((r) => (
          <li key={r.reason} className={`${r.pays ? 'hp-yes' : 'hp-no'} ${highlight === r.reason ? 'is-hit' : ''}`}>
            {tr(`claims.rule.${r.reason}`, VARS)}
          </li>
        ))}
      </ul>
      <p className="hp-made-up">{tr('hospital.made_up')}</p>
    </section>
  );
}
