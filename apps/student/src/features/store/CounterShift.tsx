import { useEffect, useMemo, useRef, useState } from 'react';
import { WORK } from '../life/config';
import { PixelIcon } from '../life/PixelIcon';
import { rupees, t } from './content';
import type { Lang } from './content';
import {
  CUSTOMERS_PER_SHIFT,
  DRAWER,
  PAY_PER_CUSTOMER,
  changeDue,
  checkChange,
  checkUpi,
  dealShift,
  shiftWage,
  sumNotes,
} from './counter';
import type { Answer, Customer, UpiCustomer } from './counter';
import '../../design/kenney.css';
import '../life/life.css'; // the 'Paisa Digits' face
import './counter.css';

type Phase = 'intro' | 'serve' | 'feedback' | 'done';

/**
 * The convenience store's work mini-game: serve five customers at the kirana counter. It only
 * plays the shift; `onFinish` hands the wage to the parent, which pays it through lifeApi.work
 * (once a week). In `practice` (already worked this week) nothing is paid.
 */
export function CounterShift({ lang, seed, practice: practiceProp, onFinish, onExit }: {
  lang: Lang;
  seed: number;
  practice: boolean;
  /**
   * Called once when the shift ends: the wage earned (0 to the full wage; 0 in practice) and
   * how many customers were served right.
   */
  onFinish: (result: { wage: number; correct: number; total: number }) => void;
  onExit: () => void;
}) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);
  // Fixed when the shift starts: paying the wage marks the week as worked, which must not
  // turn the end screen into "practice".
  const [practice] = useState(practiceProp);
  const shift = useMemo(() => dealShift(seed), [seed]);
  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [given, setGiven] = useState<number[]>([]);
  const headRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const customer = shift[index]!;
  const answer = answers[index];
  const wage = shiftWage(answers);
  const last = index === shift.length - 1;

  // Each new step moves focus to its heading, so screen readers hear what changed. After an
  // answer, focus (and scroll) goes to Next, below the explanation, so it stays in view.
  useEffect(() => {
    (phase === 'feedback' ? nextRef : headRef).current?.focus();
  }, [phase, index]);

  function answerWith(a: Answer) {
    setAnswers((xs) => [...xs, a]);
    setPhase('feedback');
  }

  function next() {
    if (last) {
      setPhase('done');
      onFinish({ wage: practice ? 0 : wage, correct: answers.filter((a) => a.ok).length, total: shift.length });
      return;
    }
    setIndex((i) => i + 1);
    setGiven([]);
    setPhase('serve');
  }

  return (
    <div className="ct-screen" lang={lang}>
      <div className="ct-card k-panel">
        <div className="ct-head">
          <button className="k-round" onClick={onExit} aria-label={tr('counter.back')}>
            <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="#4a2b17" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
            </svg>
          </button>
          <h1 className="k-banner ct-title">{tr('counter.title')}</h1>
          {!practice && <span className="ct-earned">{tr('counter.earned', { money: rupees(wage) })}</span>}
        </div>

        {phase !== 'intro' && (
          <ol className="ct-pips" aria-label={tr('counter.progress', { n: index + 1, total: shift.length })}>
            {shift.map((_, i) => {
              const a = answers[i];
              const state = a ? (a.ok ? 'is-right' : 'is-wrong') : i === index ? 'is-now' : '';
              return <li key={i} className={`k-pip ${state}`} />;
            })}
          </ol>
        )}

        {phase === 'intro' && (
          <section className="ct-body">
            <h2 ref={headRef} tabIndex={-1}>{tr('counter.intro.title')}</h2>
            <p>{tr('counter.intro.body', { total: CUSTOMERS_PER_SHIFT })}</p>
            <p className="ct-note">
              {practice
                ? tr('counter.intro.practice')
                : tr('counter.intro.pay', { money: rupees(PAY_PER_CUSTOMER), sanity: -WORK.sanity })}
            </p>
            <button className="k-btn is-primary ct-main" onClick={() => setPhase('serve')}>
              {tr('counter.start')}
            </button>
          </section>
        )}

        {(phase === 'serve' || phase === 'feedback') && (
          <section className="ct-body">
            <h2 ref={headRef} tabIndex={-1} className="ct-who">
              <PixelIcon id="person" size={24} />
              {tr(`counter.who.${customer.who}`)}
            </h2>
            <Bill customer={customer} tr={tr} />

            {customer.kind === 'cash' ? (
              <CashCounter
                key={index}
                paid={customer.paid}
                given={given}
                locked={phase === 'feedback'}
                tr={tr}
                onAdd={(n) => setGiven((g) => [...g, n].sort((a, b) => b - a))}
                onRemove={(i) => setGiven((g) => g.filter((_, j) => j !== i))}
                onClear={() => setGiven([])}
                onGive={() => answerWith(checkChange(customer, sumNotes(given)))}
              />
            ) : (
              <UpiCounter
                customer={customer}
                locked={phase === 'feedback'}
                tr={tr}
                onAnswer={(accept) => answerWith(checkUpi(customer, accept))}
              />
            )}

            {phase === 'feedback' && answer && (
              <div className={`ct-feedback k-panel ${answer.ok ? 'is-right' : 'is-wrong'}`} role="status">
                <p className="ct-feedback-title">{tr(answer.ok ? 'counter.right' : 'counter.wrong')}</p>
                <p>{tr(`counter.why.${answer.reason}`, whyVars(customer, sumNotes(given)))}</p>
                <button ref={nextRef} className="k-btn is-primary ct-main" onClick={next}>
                  {tr(last ? 'counter.finish' : 'counter.next')}
                </button>
              </div>
            )}
          </section>
        )}

        {phase === 'done' && (
          <section className="ct-body ct-done">
            <h2 ref={headRef} tabIndex={-1}>{tr('counter.done.title')}</h2>
            <p>{tr('counter.done.score', { right: answers.filter((a) => a.ok).length, total: shift.length })}</p>
            <p className="ct-wage">
              <PixelIcon id="coin" size={24} />
              {practice
                ? tr('counter.done.practice', { money: rupees(wage) })
                : tr('counter.done.paid', { money: rupees(wage), sanity: -WORK.sanity })}
            </p>
            <button className="k-btn is-primary ct-main" onClick={onExit}>
              {tr('counter.done.back')}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** The amounts an explanation line can use, already formatted. */
function whyVars(c: Customer, given: number) {
  return {
    bill: rupees(c.bill),
    paid: c.kind === 'cash' ? rupees(c.paid) : '',
    due: c.kind === 'cash' ? rupees(changeDue(c)) : '',
    given: rupees(given),
    shown: c.kind === 'upi' ? rupees(c.shown) : '',
  };
}

function Bill({ customer, tr }: { customer: Customer; tr: Tr }) {
  return (
    <div className="ct-bill">
      <ul>
        {customer.items.map((it) => (
          <li key={it.id}>
            <span>{tr(`store.item.${it.id}`)}</span>
            <span className="ct-num">{rupees(it.price)}</span>
          </li>
        ))}
      </ul>
      <p className="ct-total">
        <span>{tr('counter.bill')}</span>
        <span className="ct-num">{rupees(customer.bill)}</span>
      </p>
    </div>
  );
}

function CashCounter({ paid, given, locked, tr, onAdd, onRemove, onClear, onGive }: {
  paid: number;
  given: number[];
  locked: boolean;
  tr: Tr;
  onAdd: (note: number) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onGive: () => void;
}) {
  return (
    <div className="ct-cash">
      <p className="ct-paid">
        <PixelIcon id="sack" size={24} />
        {tr('counter.cash.paid', { money: rupees(paid) })}
      </p>
      {!locked && <p>{tr('counter.cash.ask')}</p>}
      <p className="ct-given" aria-live="polite">{tr('counter.cash.given', { money: rupees(sumNotes(given)) })}</p>
      {given.length > 0 && (
        <ul className="ct-chips">
          {given.map((n, i) => (
            <li key={i}>
              <button
                className={`ct-chip ${n >= 10 ? 'is-note' : 'is-coin'}`}
                disabled={locked}
                onClick={() => onRemove(i)}
                aria-label={tr('counter.cash.remove', { money: rupees(n) })}
              >
                {rupees(n)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <>
          <div className="ct-drawer" role="group" aria-label={tr('counter.cash.drawer')}>
            {DRAWER.map((n) => (
              <button
                key={n}
                className={`k-btn ct-denom ${n >= 10 ? 'is-note' : 'is-coin'}`}
                onClick={() => onAdd(n)}
                aria-label={tr('counter.cash.add', { money: rupees(n) })}
              >
                {rupees(n)}
              </button>
            ))}
          </div>
          <div className="ct-actions">
            <button className="k-btn ct-clear" onClick={onClear} disabled={given.length === 0}>
              {tr('counter.cash.clear')}
            </button>
            <button className="k-btn is-primary ct-main" onClick={onGive} disabled={given.length === 0}>
              {tr('counter.cash.give')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function UpiCounter({ customer, locked, tr, onAnswer }: {
  customer: UpiCustomer;
  locked: boolean;
  tr: Tr;
  onAnswer: (accept: boolean) => void;
}) {
  const yours =
    customer.upi === 'fake_screenshot'
      ? { cls: 'is-none', text: tr('counter.upi.nothing') }
      : customer.upi === 'collect_request'
        ? { cls: 'is-request', text: tr('counter.upi.request', { money: rupees(customer.shown) }) }
        : { cls: 'is-received', text: tr('counter.upi.received', { money: rupees(customer.shown) }) };
  return (
    <div className="ct-upi">
      <p className="ct-says">{tr('counter.upi.says')}</p>
      <div className="ct-phones">
        <figure className="ct-phone">
          <figcaption>{tr('counter.upi.their_phone')}</figcaption>
          <div className="ct-phone-screen is-received">
            <PixelIcon id="phone" size={24} />
            <span>{tr('counter.upi.their_screen', { money: rupees(customer.bill) })}</span>
          </div>
        </figure>
        <figure className="ct-phone is-yours">
          <figcaption>{tr('counter.upi.your_phone')}</figcaption>
          <div className={`ct-phone-screen ${yours.cls}`}>
            <PixelIcon id={yours.cls === 'is-received' ? 'coin' : 'warn'} size={24} />
            <span>{yours.text}</span>
          </div>
        </figure>
      </div>
      {!locked && (
        <>
          <p>{tr('counter.upi.ask')}</p>
          <div className="ct-actions">
            <button className="k-btn ct-choice" onClick={() => onAnswer(false)}>
              <PixelIcon id="warn" size={24} />
              {tr('counter.upi.refuse')}
            </button>
            <button className="k-btn ct-choice" onClick={() => onAnswer(true)}>
              <PixelIcon id="sack" size={24} />
              {tr('counter.upi.accept')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
