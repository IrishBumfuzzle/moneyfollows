import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../game/useGame';
import { PixelIcon } from '../life/PixelIcon';
import { formatRupees, t } from './content';
import type { Lang } from './content';
import { getEvent } from './data';
import { DeltaChips } from './DeltaChips';
import { canChoose } from './resolve';
import { useEvents } from './useEvents';
import '../../design/kenney.css';
import './events.css';

/**
 * A sudden event (the injury): it happens → go to the hospital → pay, borrow or rest → what
 * happened and the lesson. It can't be dismissed before a choice, like real life; it never opens
 * over a scene in progress, only on the map or main screen (CLAUDE.md 5.8).
 */
export function SuddenEventSheet({ lang, name }: { lang: Lang; name: string }) {
  const sudden = useEvents((s) => s.sudden);
  const choose = useEvents((s) => s.chooseSudden);
  const close = useEvents((s) => s.closeSudden);
  const life = useGame((s) => s.life);
  const [step, setStep] = useState<'hit' | 'bill'>('hit');
  const focusRef = useRef<HTMLButtonElement>(null);
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, { name, ...vars });

  const ev = sudden ? getEvent(sudden.id) : undefined;
  const phase = sudden?.choice ? 'done' : step;
  useEffect(() => focusRef.current?.focus(), [phase]);
  useEffect(() => {
    if (!sudden) setStep('hit');
  }, [sudden]);
  if (!sudden || !ev || ev.kind !== 'sudden') return null;
  const chosen = ev.choices.find((c) => c.id === sudden.choice);

  return (
    <div className="ev-overlay" lang={lang}>
      <div
        className={`ev-sheet k-panel ${phase === 'hit' ? 'is-hit' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ev-sudden-title"
      >
        {phase === 'hit' && (
          <>
            <div className="ev-sheet-head">
              <PixelIcon id="bandage" size={40} />
              <h2 id="ev-sudden-title" className="ev-title">{tr(ev.title)}</h2>
            </div>
            <p>{tr(ev.story)}</p>
            <DeltaChips lang={lang} delta={sudden.hit} />
            <button ref={focusRef} className="k-btn is-primary ev-wide" onClick={() => setStep('bill')}>
              <PixelIcon id="cross" />
              <span>{tr('events.ui.go_hospital')}</span>
            </button>
          </>
        )}

        {phase === 'bill' && (
          <>
            <div className="ev-sheet-head">
              <PixelIcon id="cross" size={40} />
              <h2 id="ev-sudden-title" className="ev-title">{tr(ev.billTitle)}</h2>
            </div>
            <p>{tr(ev.bill)}</p>
            <p className="ev-muted">{tr('events.ui.you_have', { money: formatRupees(life.money) })}</p>
            <div className="ev-choices" role="group" aria-labelledby="ev-sudden-title">
              {ev.choices.map((c, i) => {
                const ok = canChoose(life, c);
                return (
                  <button
                    key={c.id}
                    ref={i === 0 ? focusRef : undefined}
                    className={`k-btn ev-choice ${ok ? '' : 'is-dim'}`}
                    aria-disabled={!ok}
                    onClick={() => ok && choose(c.id)}
                  >
                    <span className="ev-choice-label">{tr(c.label)}</span>
                    {!ok && <span className="ev-why">{tr('events.ui.not_enough')}</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {phase === 'done' && chosen && (
          <>
            <div className="ev-sheet-head">
              <PixelIcon id="cross" size={40} />
              <h2 id="ev-sudden-title" className="ev-title">{tr('events.ui.what_happened')}</h2>
            </div>
            <p>{tr(chosen.outcome)}</p>
            {sudden.delta && <DeltaChips lang={lang} delta={sudden.delta} />}
            <div className="ev-lesson">
              <p className="ev-lesson-head">{tr('events.ui.lesson')}</p>
              <p>{tr(chosen.lesson)}</p>
            </div>
            <button ref={focusRef} className="k-btn is-primary ev-wide" onClick={close}>
              {tr('events.ui.done')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
