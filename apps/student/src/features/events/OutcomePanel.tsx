import { PixelIcon } from '../life/PixelIcon';
import type { LifeDelta } from '../life/types';
import { t } from './content';
import type { Lang } from './content';
import { DeltaChips } from './DeltaChips';
import type { EventChoice, TKey } from './types';

/** After a chat or call reply: scam or real, what happened, the changes, warning signs, lesson. */
export function OutcomePanel({ lang, name, verdict, kind, chosen, delta, redFlags, onDone }: {
  lang: Lang;
  name: string;
  verdict: 'scam' | 'legit';
  kind: 'message' | 'call';
  chosen: EventChoice;
  delta?: LifeDelta;
  redFlags?: TKey[];
  onDone: () => void;
}) {
  const tr = (k: string) => t(lang, k, { name });
  const scam = verdict === 'scam';
  const head = scam
    ? kind === 'call' ? 'events.ui.it_was_scam_call' : 'events.ui.it_was_scam'
    : kind === 'call' ? 'events.ui.it_was_real_call' : 'events.ui.it_was_real';
  return (
    <div className="ev-outcome k-panel" role="status">
      <p className={`ev-verdict ${scam ? 'is-scam' : 'is-real'}`}>
        <PixelIcon id={scam ? 'warn' : 'person'} />
        <span>{tr(head)}</span>
      </p>
      <p>{tr(chosen.outcome)}</p>
      {delta && <DeltaChips lang={lang} delta={delta} />}
      {redFlags && (
        <div>
          <p className="ev-lesson-head">{tr('events.ui.red_flags')}</p>
          <ul className="ev-flags">
            {redFlags.map((f) => (
              <li key={f}>{tr(f)}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="ev-lesson">
        <p className="ev-lesson-head">{tr('events.ui.lesson')}</p>
        <p>{tr(chosen.lesson)}</p>
      </div>
      {scam && <p className="ev-helpline">{tr('events.ui.helpline')}</p>}
      <button className="k-btn is-primary ev-wide" onClick={onDone}>
        {tr('events.ui.done')}
      </button>
    </div>
  );
}
