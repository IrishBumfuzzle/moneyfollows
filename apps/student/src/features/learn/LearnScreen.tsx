import { useEffect, useMemo, useState } from 'react';
import { glossary } from '@paisa/content';
import { PILLARS, type Guide, type Lang, type Pillar } from '@paisa/shared';
import { track } from '../../api/track';
import { useWordWallet } from '../news/useWordWallet';
import { CONCEPTS, GUIDES, conceptById, t } from './content';
import { guideLesson } from './record';
import { conceptState, learn, useLearning, type ConceptState, type Note } from './store';
import '../../design/kenney.css';
import './learn.css';

type Tab = 'guides' | 'progress' | 'notebook';
const TABS: Tab[] = ['guides', 'progress', 'notebook'];

const guideOf = (state: unknown): string | null => (state as { guide?: string } | null)?.guide ?? null;

/**
 * Learn: real-life guides, concept progress and the Notebook of every lesson seen. A normal
 * scrolling page like Paisa Times. Opening a guide is its own history entry, so Android back
 * closes the guide before it leaves the screen (CLAUDE.md 6).
 */
export function LearnScreen({ lang, onExit }: { lang: Lang; onExit: () => void }) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const [tab, setTab] = useState<Tab>('guides');
  const [open, setOpen] = useState<string | null>(() => guideOf(window.history.state));

  useEffect(() => {
    const on = (e: PopStateEvent) => setOpen(guideOf(e.state));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  const openGuide = (id: string) => {
    window.history.pushState({ screen: 'learn', guide: id }, '');
    setOpen(id);
    window.scrollTo(0, 0);
  };
  const guide = open ? GUIDES.find((g) => g.id === open) : undefined;

  return (
    <div className="ln-screen" lang={lang}>
      <header className="ln-topbar">
        <button
          className="k-round ln-back"
          onClick={guide ? () => window.history.back() : onExit}
          aria-label={tr('learn.back')}
        >
          <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
            <path fill="#4a2b17" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
          </svg>
        </button>
        <h1 className="ln-title">{guide ? tr(guide.title) : tr('learn.title')}</h1>
      </header>

      {guide ? (
        <GuideReader lang={lang} guide={guide} onDone={() => window.history.back()} />
      ) : (
        <>
          <div className="ln-tabs" role="tablist" aria-label={tr('learn.title')}>
            {TABS.map((id) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={`k-btn ln-tab${tab === id ? ' is-primary' : ''}`}
                onClick={() => setTab(id)}
              >
                {tr(`learn.tab.${id}`)}
              </button>
            ))}
          </div>
          <main className="ln-body" role="tabpanel">
            {tab === 'guides' && <GuideList lang={lang} onOpen={openGuide} />}
            {tab === 'progress' && <Progress lang={lang} />}
            {tab === 'notebook' && <Notebook lang={lang} />}
          </main>
        </>
      )}
    </div>
  );
}

// ---- Real life: guides ----------------------------------------------------------------------

function GuideList({ lang, onOpen }: { lang: Lang; onOpen: (id: string) => void }) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const done = useLearning((s) => s.guides);
  return (
    <>
      <p className="ln-intro">{tr('learn.guides.intro')}</p>
      <ul className="ln-guides">
        {GUIDES.map((g) => {
          const rec = done[g.id];
          return (
            <li key={g.id}>
              <button className="k-panel ln-guide" onClick={() => onOpen(g.id)}>
                <GuideIcon name={g.icon} />
                <span className="ln-guide-text">
                  <span className="ln-guide-title">{tr(g.title)}</span>
                  <span className="ln-meta">
                    {tr(`learn.pillar.${g.pillar}`)} · {tr('learn.guide.steps', { n: g.steps.length })}
                  </span>
                </span>
                {rec && (
                  <span className="ln-chip is-understood">
                    <StateIcon state="understood" />
                    {tr(rec.correct ? 'learn.guide.done_right' : 'learn.guide.done')}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function GuideReader({ lang, guide, onDone }: { lang: Lang; guide: Guide; onDone: () => void }) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === guide.check.correct;

  const pick = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const correct = i === guide.check.correct;
    // The first answer counts and is sent once; a re-read can try again but changes nothing.
    if (!useLearning.getState().guides[guide.id]) track('guide_completed', { guide_id: guide.id, correct });
    learn((s, at) => guideLesson(s, guide, correct, at));
  };

  return (
    <main className="ln-body ln-reader">
      {!guide.meta.factsCheckedBy && <p className="ln-draft">{tr('learn.guide.draft')}</p>}
      <p className="ln-lead">{tr(guide.intro)}</p>
      <ol className="ln-steps">
        {guide.steps.map((s, i) => (
          <li key={s} className="k-panel ln-step">
            <span className="ln-step-n">{tr('learn.guide.step', { n: i + 1 })}</span>
            <p>{tr(s)}</p>
          </li>
        ))}
      </ol>

      <section className="ln-check" aria-labelledby="ln-check-head">
        <h2 id="ln-check-head" className="ln-h2">
          {tr('learn.guide.check')}
        </h2>
        <p className="ln-q">{tr(guide.check.prompt)}</p>
        <div className="ln-options">
          {guide.check.options.map((o, i) => {
            const state =
              picked === null ? '' : i === guide.check.correct ? ' is-correct' : i === picked ? ' is-wrong' : ' is-dim';
            return (
              <button key={o} className={`k-btn ln-option${state}`} onClick={() => pick(i)} aria-pressed={picked === i}>
                {tr(o)}
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <div className="k-panel ln-feedback" role="status">
            <p className={`ln-verdict ${right ? 'is-right' : 'is-wrong'}`}>
              {tr(right ? 'learn.guide.right' : 'learn.guide.wrong')}
            </p>
            {!right && (
              <p>{tr('learn.guide.answer', { answer: tr(guide.check.options[guide.check.correct] ?? '') })}</p>
            )}
            <p>{tr(guide.check.explanation)}</p>
          </div>
        )}
      </section>

      {guide.pillar === 'stay_safe' && <p className="ln-help">{tr('learn.guide.help')}</p>}
      {picked !== null && (
        <button className="k-btn is-primary ln-finish" onClick={onDone}>
          {tr('learn.guide.finish')}
        </button>
      )}
    </main>
  );
}

// ---- My progress: concepts by pillar ---------------------------------------------------------

function Progress({ lang }: { lang: Lang }) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const met = useLearning((s) => s.met);
  const understood = useLearning((s) => s.understood);
  const state = (id: string) => conceptState({ met, understood, guides: {}, notes: [] }, id);
  return (
    <>
      <p className="ln-intro">{tr('learn.progress.intro')}</p>
      {PILLARS.map((p) => {
        const list = CONCEPTS.filter((c) => c.pillar === p);
        const count = list.filter((c) => state(c.id) === 'understood').length;
        return (
          <section key={p} className="ln-pillar" aria-labelledby={`ln-p-${p}`}>
            <div className="ln-pillar-head">
              <h2 id={`ln-p-${p}`} className="ln-h2">
                {tr(`learn.pillar.${p}`)}
              </h2>
              <span className="ln-meta">{tr('learn.progress.count', { understood: count, total: list.length })}</span>
            </div>
            <div
              className="ln-bar"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={list.length}
              aria-valuenow={count}
              aria-label={tr(`learn.pillar.${p}`)}
            >
              <span style={{ width: `${(100 * count) / Math.max(1, list.length)}%` }} />
            </div>
            <ul className="ln-concepts">
              {list.map((c) => {
                const s = state(c.id);
                return (
                  <li key={c.id}>
                    <details className="ln-concept">
                      <summary>
                        <span className="ln-concept-name">{tr(c.name)}</span>
                        <span className={`ln-chip is-${s}`}>
                          <StateIcon state={s} />
                          {tr(`learn.state.${s}`)}
                        </span>
                      </summary>
                      <p>{tr(c.simple)}</p>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}

// ---- Notebook: every lesson seen, and the Word Wallet ----------------------------------------

function Notebook({ lang }: { lang: Lang }) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const notes = useLearning((s) => s.notes);
  const words = useWordWallet((s) => s.words);
  const terms = useMemo(() => new Map(glossary.map((g) => [g.id, g])), []);
  const byPillar = (p: Pillar) => notes.filter((n) => n.pillar === p);
  const other = notes.filter((n) => !n.pillar);

  return (
    <>
      <p className="ln-intro">{tr('learn.notebook.intro')}</p>
      {notes.length === 0 && <p className="k-panel ln-empty">{tr('learn.notebook.empty')}</p>}
      {PILLARS.map((p) => {
        const list = byPillar(p);
        if (list.length === 0) return null;
        return (
          <section key={p} className="ln-pillar" aria-labelledby={`ln-n-${p}`}>
            <h2 id={`ln-n-${p}`} className="ln-h2">
              {tr(`learn.pillar.${p}`)}
            </h2>
            <ul className="ln-notes">
              {list.map((n) => (
                <NoteCard key={n.key} lang={lang} note={n} />
              ))}
            </ul>
          </section>
        );
      })}
      {other.length > 0 && (
        <ul className="ln-notes">
          {other.map((n) => (
            <NoteCard key={n.key} lang={lang} note={n} />
          ))}
        </ul>
      )}

      <section className="ln-pillar" aria-labelledby="ln-words">
        <h2 id="ln-words" className="ln-h2">
          {tr('learn.notebook.words')}
        </h2>
        {words.length === 0 ? (
          <p className="ln-meta">{tr('learn.notebook.words_empty')}</p>
        ) : (
          <dl className="ln-words">
            {words.map((w) => {
              const term = terms.get(w.termId);
              if (!term) return null;
              return (
                <div key={w.termId} className="k-panel ln-word">
                  <dt>{tr(term.word)}</dt>
                  <dd>{tr(term.simple)}</dd>
                </div>
              );
            })}
          </dl>
        )}
      </section>
    </>
  );
}

function NoteCard({ lang, note }: { lang: Lang; note: Note }) {
  const tr = (k: string) => t(lang, k);
  const concept = note.concept ? conceptById.get(note.concept) : undefined;
  return (
    <li className="k-panel ln-note">
      <p>{tr(note.key)}</p>
      <p className="ln-meta">
        {tr(`learn.from.${note.source}`)}
        {concept ? ` · ${tr(concept.name)}` : ''}
      </p>
    </li>
  );
}

// ---- Icons: pixel art as SVG, so every phone draws the same thing ---------------------------

function StateIcon({ state }: { state: ConceptState }) {
  const d =
    state === 'understood'
      ? 'M1 4h1v1H1zM2 5h1v1H2zM3 4h1v1H3zM4 3h1v1H4zM5 2h1v1H5z'
      : state === 'met'
        ? 'M2 2h3v3H2z'
        : 'M2 1h3v1H2zM1 2h1v3H1zM5 2h1v3H5zM2 5h3v1H2z';
  return (
    <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="currentColor" d={d} />
    </svg>
  );
}

const GUIDE_ICONS: Record<string, string> = {
  bank: 'M4 0h1v1H4zM2 1h5v1H2zM0 2h9v1H0zM1 3h1v4H1zM4 3h1v4H4zM7 3h1v4H7zM0 7h9v1H0z',
  phone: 'M2 0h5v1H2zM2 1h1v7H2zM6 1h1v7H6zM3 6h3v1H3zM2 8h5v1H2zM4 7h1v1H4z',
  shield: 'M1 0h7v1H1zM1 1h1v4H1zM7 1h1v4H7zM2 5h1v1H2zM6 5h1v1H6zM3 6h1v1H3zM5 6h1v1H5zM4 7h1v1H4zM4 2h1v3H4z',
  wallet: 'M0 1h8v1H0zM0 2h1v5H0zM0 7h9v1H0zM8 2h1v5H8zM6 4h3v1H6z',
  message: 'M0 0h9v1H0zM0 1h1v5H0zM8 1h1v5H8zM0 6h3v1H0zM4 6h5v1H4zM2 7h1v1H2zM2 2h5v1H2zM2 4h3v1H2z',
  coins: 'M2 1h5v1H2zM1 2h7v1H1zM2 3h5v1H2zM1 4h7v1H1zM2 5h5v1H2zM1 6h7v1H1zM2 7h5v1H2z',
};

function GuideIcon({ name }: { name: string }) {
  return (
    <svg
      className="ln-guide-icon"
      viewBox="0 0 9 9"
      width="36"
      height="36"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <path fill="currentColor" d={GUIDE_ICONS[name] ?? GUIDE_ICONS.message} />
    </svg>
  );
}
