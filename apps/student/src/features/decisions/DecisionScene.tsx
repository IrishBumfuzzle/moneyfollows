import { forwardRef, useEffect, useRef, useState } from 'react';
import type { Choice, Consequence, Scenario, EventCard } from '@paisa/shared';
import { track } from '../../api/track';
import { useGame } from '../../game/useGame';
import { Icon } from './icons';
import { JarDeltas } from './JarDelta';
import { planRewind } from './plan';
import type { PlayCard } from './plan';
import { rupees, t } from './content';
import type { Lang } from './content';
import '../../design/kenney.css';
import './decisions.css';

type Card = Scenario | EventCard;

/**
 * A pinned card at a place (CLAUDE.md 1.1, 5.8). In person it is a PlaceScene: the speaker's
 * DialogueBubble and 2–4 ChoiceButtons; a phone card is the same choice as a ChatThread. A
 * choice opens the ConsequenceSheet: jar changes, the lesson, Rewind (while a token and a
 * snapshot are left) and Continue, which hands back to the place's usual sheet.
 */
export function DecisionScene({ lang, name, card, onDone }: {
  lang: Lang;
  /** The persona's name, for {{name}} in stories. */
  name: string;
  card: PlayCard;
  onDone: () => void;
}) {
  const choosePlan = useGame((s) => s.choosePlan);
  const rewindPlan = useGame((s) => s.rewindPlan);
  const plan = useGame((s) => s.plan);
  const [result, setResult] = useState<{ choice: Choice; consequence: Consequence } | null>(null);
  const focusRef = useRef<HTMLButtonElement>(null);
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, { name, ...vars });
  const s = card.scenario;

  useEffect(() => {
    focusRef.current?.focus();
  }, [result]);

  const pick = (choice: Choice) => {
    if (result) return;
    const consequence = choosePlan(s.id, choice.id);
    if (!consequence) return;
    track('decision_made', { scenarioId: s.id, choiceId: choice.id, pillar: s.pillar, month: card.month, week: card.week });
    setResult({ choice, consequence });
  };

  const canRewind = !!plan && !!result && planRewind(plan) !== null;
  const doRewind = () => {
    if (!plan || !rewindPlan()) return;
    track('rewind_used', { scenarioId: s.id, month: card.month, week: card.week, tokensLeft: plan.rewindTokens - 1 });
    setResult(null);
  };

  const phone = s.channel === 'phone';
  const assumption = s.assumption === true || s.pillar === 'understand_investing';

  return (
    <div className="dc-screen" lang={lang}>
      <div className={`dc-scene ${phone ? 'is-phone' : ''}`}>
        <p className="dc-when">
          {card.kind === 'event' && <span className="dc-surprise">{tr('dec.surprise')}</span>}
          {tr('dec.when', { month: card.month, week: card.week })}
        </p>

        {phone ? (
          <ChatThread lang={lang} card={s} tr={tr} chosen={result?.choice} />
        ) : (
          <PlaceScene card={s} tr={tr} />
        )}

        {assumption && <p className="dc-assume" role="note">{tr('t:assumption.banner')}</p>}

        {!result && (
          <div className="dc-choices" role="group" aria-label={tr('dec.question')}>
            <p className="dc-question">{tr(phone ? 'dec.phone.reply' : 'dec.question')}</p>
            {s.choices.map((c, i) => (
              <ChoiceButton key={c.id} ref={i === 0 ? focusRef : undefined} choice={c} tr={tr} onPick={pick} />
            ))}
          </div>
        )}
      </div>

      {result && (
        <ConsequenceSheet
          lang={lang}
          tr={tr}
          choice={result.choice}
          consequence={result.consequence}
          rewindTokens={canRewind ? (plan?.rewindTokens ?? 0) : 0}
          focusRef={focusRef}
          onRewind={doRewind}
          onContinue={onDone}
        />
      )}
    </div>
  );
}

type Tr = (k: string, vars?: Record<string, string | number>) => string;

function PlaceScene({ card, tr }: { card: Card; tr: Tr }) {
  return (
    <div className="dc-place">
      <img
        className="dc-place-art"
        src={`/assets/buildings/${card.location}.png`}
        alt=""
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
      <DialogueBubble speaker={tr(card.speaker)} text={tr(card.text)} />
    </div>
  );
}

function DialogueBubble({ speaker, text }: { speaker: string; text: string }) {
  return (
    <div className="dc-bubble k-panel">
      <p className="dc-speaker">{speaker}</p>
      <p>{text}</p>
    </div>
  );
}

/** The phone card: the incoming message, and the reply once chosen. */
function ChatThread({ lang, card, tr, chosen }: { lang: Lang; card: Card; tr: Tr; chosen?: Choice }) {
  return (
    <div className="dc-phone" lang={lang}>
      <p className="dc-phone-head">
        <Icon name="phone" size={20} />
        {tr('dec.phone.from', { speaker: tr(card.speaker) })}
      </p>
      <div className="dc-chat">
        <p className="dc-msg is-in">{tr(card.text)}</p>
        {chosen && <p className="dc-msg is-out">{tr(chosen.label)}</p>}
      </div>
    </div>
  );
}

const ChoiceButton = forwardRef<HTMLButtonElement, { choice: Choice; tr: Tr; onPick: (c: Choice) => void }>(
  function ChoiceButton({ choice, tr, onPick }, ref) {
    return (
      <button ref={ref} className="k-btn dc-choice" onClick={() => onPick(choice)}>
        <Icon name={choice.icon} size={32} />
        <span>{tr(choice.label)}</span>
      </button>
    );
  },
);

function ConsequenceSheet({ lang, tr, choice, consequence, rewindTokens, focusRef, onRewind, onContinue }: {
  lang: Lang;
  tr: Tr;
  choice: Choice;
  consequence: Consequence;
  /** Tokens left; 0 hides Rewind (no token, or nothing to undo). */
  rewindTokens: number;
  focusRef: React.RefObject<HTMLButtonElement>;
  onRewind: () => void;
  onContinue: () => void;
}) {
  const plan = useGame((s) => s.plan);
  const { applied } = consequence;
  return (
    <div className="dc-overlay">
      <div className="dc-sheet k-panel" role="dialog" aria-modal="true" aria-labelledby="dc-result-title">
        <h2 id="dc-result-title" className="k-banner dc-title">{tr('dec.result.title')}</h2>
        <p className="dc-chosen">
          <Icon name={choice.icon} />
          <span>{tr(choice.label)}</span>
        </p>
        <JarDeltas lang={lang} applied={applied} jars={plan?.jars} debt={plan?.debt} />
        {applied.borrowed > 0 && <p className="dc-warn">{tr('dec.result.borrowed', { amount: rupees(applied.borrowed) })}</p>}
        {consequence.delayedQueued > 0 && <p className="dc-muted">{tr('dec.result.later')}</p>}
        {consequence.lesson && <LessonCard tr={tr} lesson={consequence.lesson} />}
        <div className="dc-actions">
          {rewindTokens > 0 && <RewindButton tr={tr} tokens={rewindTokens} onRewind={onRewind} />}
          <button ref={focusRef} className="k-btn is-primary dc-wide" onClick={onContinue}>
            {tr('dec.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LessonCard({ tr, lesson }: { tr: Tr; lesson: string }) {
  return (
    <div className="dc-lesson">
      <p className="dc-lesson-head">
        <Icon name="star" size={20} />
        {tr('dec.lesson')}
      </p>
      <p>{tr(lesson)}</p>
    </div>
  );
}

function RewindButton({ tr, tokens, onRewind }: { tr: Tr; tokens: number; onRewind: () => void }) {
  return (
    <button className="k-btn dc-wide dc-rewind" onClick={onRewind}>
      <Icon name="back" />
      <span>{tr('dec.rewind')}</span>
      <span className="dc-tokens">{tr('dec.rewind.left', { n: tokens })}</span>
    </button>
  );
}
