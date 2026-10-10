import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { identify } from '../../api/backend';
import { joinClass, rejoinClass, toJoinError } from '../../api/joinClass';
import { track } from '../../api/track';
import { formatRupees, t } from './content';
import { JOIN_ERRORS } from './joinErrors';
import { clearJoined, loadJoined, saveJoined } from './joined';
import type { Joined, SavedJoin } from './joined';
import { AVATARS, PERSONAS } from './presets';
import { saveProfile } from './profile';
import type { Lang, PersonaId, Profile } from './types';
import {
  cleanCode,
  cleanRejoinCode,
  formatRejoinCode,
  isValidRejoinCode,
  NICKNAME_MAX,
  nicknameProblem,
  NICKNAME_MIN,
  REJOIN_LENGTH,
} from './validate';
import '../../design/kenney.css';
import './onboarding.css';

const LANGS: Lang[] = ['en', 'hi'];
const TITLES = ['onboarding.lang.title', 'onboarding.class.title', 'onboarding.nickname.title', 'onboarding.persona.title', 'onboarding.howto.title'];
const ACTIONS = ['onboarding.next', 'onboarding.class.join', 'onboarding.next', 'onboarding.next', 'onboarding.start'];
const HOWTO = [
  { icon: '📍', key: 'onboarding.howto.pins' },
  { icon: '⏪', key: 'onboarding.howto.choose' },
  { icon: '🌙', key: 'onboarding.howto.week' },
];

type OnboardingError = { step: number; key: string; suggestions?: string[] };

/**
 * First launch: language → class code → nickname + avatar → persona → how to play.
 * join_class needs the nickname (CLAUDE.md 5.5), so step 1 only checks the code and the call
 * runs on step 2's Next; a class problem sends the player back to step 1. A student who played
 * before on another phone switches to rejoin mode on step 1 and adds their rejoin code on step 2.
 * The join happens once: after it succeeds, the code and nickname are locked (Back still works),
 * so editing them can't leave a second student behind on the server.
 */
export function Onboarding({ onDone, onLang, initialLang = 'en' }: {
  onDone: (profile: Profile) => void;
  /** The language in use, when picked or restored from a saved join: lets the sync banner (outside this screen) match it. */
  onLang?: (lang: Lang) => void;
  initialLang?: Lang;
}) {
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<Lang>(initialLang);
  const [code, setCode] = useState(() => cleanCode(new URLSearchParams(window.location.search).get('code') ?? ''));
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [persona, setPersona] = useState<PersonaId | null>(null);
  const [rejoining, setRejoining] = useState(false);
  const [rejoinCode, setRejoinCode] = useState('');
  const [joined, setJoined] = useState<Joined | null>(null);
  const [ready, setReady] = useState(false); // false until a join saved before a reload has been looked for
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OnboardingError | null>(null);
  const furthest = useRef(0); // furthest step whose data is still valid; caps browser back/forward
  const busyRef = useRef(false); // busy, readable from the popstate handler and from after an await
  const stepRef = useRef(step); // the step on screen, readable from after an await
  stepRef.current = step;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);

  // Android back steps back through onboarding instead of leaving the app (CLAUDE.md 6). The
  // entries have no `screen` key, so App's popstate handler reads them as the main screen once we're done.
  // While the join is in flight the step must not change under it: if the browser already went back,
  // put the current step's entry back.
  useEffect(() => {
    const on = (e: PopStateEvent) => {
      const s = (e.state as { onboardingStep?: number } | null)?.onboardingStep ?? 0;
      if (busyRef.current) {
        if (s !== stepRef.current) window.history.pushState({ onboardingStep: stepRef.current }, '');
        return;
      }
      setStep(Math.min(s, furthest.current));
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  // Move focus to the title on each step, so screen readers read it next.
  useEffect(() => titleRef.current?.focus(), [step, ready]);

  // A reload after joining must not join again (the nickname would come back taken), so pick up
  // where the player was: after the nickname step, or on it if the avatar wasn't chosen yet.
  useEffect(() => {
    let alive = true;
    void loadJoined().then((saved) => {
      if (!alive) return;
      if (saved) resume(saved);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Keep the join (and the choices around it) on the phone until the profile is saved.
  useEffect(() => {
    if (joined) void saveJoined({ ...joined, lang, avatar });
  }, [joined, lang, avatar]);

  const nicknameProblemNow = nicknameProblem(nickname);
  const nicknameOk = nicknameProblemNow === null;
  const rejoinOk = isValidRejoinCode(rejoinCode);
  const canContinue = [
    true,
    cleanCode(code) !== '',
    avatar !== null && (joined !== null || (nicknameOk && (!rejoining || rejoinOk))),
    persona !== null,
    joined !== null,
  ][step];
  const title = step === 2 && rejoining ? 'onboarding.rejoin.title' : TITLES[step];
  const action = step === 1 && (joined || rejoining) ? 'onboarding.next' : ACTIONS[step];
  const shownError = error?.step === step ? error : null;
  // Don't nag while the first character is still being typed.
  const nicknameWarning = nicknameProblemNow !== null && nickname.trim().length >= NICKNAME_MIN ? nicknameProblemNow : null;

  function resume(saved: SavedJoin) {
    const { lang: l, avatar: a, ...j } = saved;
    const at = a ? 3 : 2;
    setJoined(j);
    setCode(j.code);
    setNickname(j.nickname);
    setRejoining(j.rejoin === true);
    setLang(l);
    onLang?.(l);
    setAvatar(a);
    // A fresh launch has no history, so rebuild it: Back then walks the steps already done.
    furthest.current = at;
    window.history.replaceState({ onboardingStep: 0 }, '');
    for (let i = 1; i <= at; i++) window.history.pushState({ onboardingStep: i }, '');
    setStep(at);
  }

  function goTo(n: number) {
    furthest.current = Math.max(furthest.current, n);
    window.history.pushState({ onboardingStep: n }, '');
    setStep(n);
  }

  function working(b: boolean) {
    busyRef.current = b;
    setBusy(b);
  }

  // Editing the code or nickname invalidates the steps after this one (and is locked while joining).
  function edit(set: (v: string) => void, v: string) {
    if (busyRef.current) return;
    set(v);
    setError(null);
    furthest.current = step;
  }

  function toggleRejoin() {
    setRejoining((r) => !r);
    setError(null);
    furthest.current = step;
  }

  function chooseLang(l: Lang) {
    if (l === lang) return;
    setLang(l);
    onLang?.(l);
    track('language_changed', { lang: l });
  }

  async function join() {
    if (joined) return goTo(3);
    const c = cleanCode(code);
    const n = nickname.trim();
    working(true);
    try {
      const result = rejoining ? await rejoinClass(c, n, cleanRejoinCode(rejoinCode)) : await joinClass(c, n, lang);
      // Gives the events tracked so far (language_changed) the student's ids and sends them.
      await identify({ anon_id: result.anon_id, class_id: result.class_id });
      setJoined({ code: c, nickname: n, result, rejoin: rejoining });
      if (stepRef.current === 2) goTo(3);
    } catch (err) {
      const e = toJoinError(err);
      const { step: at, key } = JOIN_ERRORS[e.code];
      setError({ step: at, key, suggestions: e.suggestions.slice(0, 3) });
      if (at === 1 && stepRef.current === 2) window.history.back(); // to the class-code step
    } finally {
      working(false);
    }
  }

  async function finish() {
    if (!joined || !avatar || !persona) return;
    const profile: Profile = {
      version: 1,
      nickname: joined.nickname,
      avatar,
      persona,
      lang,
      classCode: joined.code,
      classId: joined.result.class_id,
      anonId: joined.result.anon_id,
      ...(joined.result.rejoin_code ? { rejoinCode: joined.result.rejoin_code } : {}),
      endlineOpen: joined.result.endline_open,
    };
    working(true);
    try {
      await saveProfile(profile);
      await clearJoined(); // only once the profile is safe: otherwise the next launch resumes from the join
    } catch (err) {
      console.warn('Profile not saved; onboarding will show again next launch.', err);
    }
    track('persona_selected', { persona_id: persona });
    track('onboarding_complete', { persona_id: persona, lang, level: 'starter' });
    onDone(profile);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !canContinue) return;
    setError(null);
    if (step === 2) void join();
    else if (step === 4) void finish();
    else goTo(step + 1);
  }

  if (!ready) return null;

  return (
    <form className="ob-screen" lang={lang} onSubmit={submit} noValidate>
      <header className="ob-top">
        {step > 0 ? (
          <button type="button" className="k-round ob-back" onClick={() => window.history.back()} disabled={busy} aria-label={tr('onboarding.back')}>
            <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="currentColor" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
            </svg>
          </button>
        ) : (
          <span className="ob-back" />
        )}
        <ol className="ob-dots" aria-label={tr('onboarding.progress', { n: step + 1, total: TITLES.length })}>
          {TITLES.map((k, i) => (
            <li key={k} className={`k-pip ${i < step ? 'is-right' : i === step ? 'is-now' : ''}`} />
          ))}
        </ol>
        <span className="ob-back" />
      </header>

      <main className="ob-body">
        <h1 className="ob-title" ref={titleRef} tabIndex={-1}>{tr(title)}</h1>

        {shownError && (
          <>
            <p className="k-panel ob-error" role="alert"><span aria-hidden="true">⚠ </span>{tr(shownError.key)}</p>
            {shownError.suggestions && shownError.suggestions.length > 0 && (
              <div className="ob-field">
                <p className="ob-hint">{tr('onboarding.nickname.suggest')}</p>
                <div className="ob-chips">
                  {shownError.suggestions.map((s) => (
                    <button key={s} type="button" className="k-btn ob-chip" onClick={() => edit(setNickname, s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {step === 0 && (
          <div className="ob-list">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                className={`k-btn ob-choice ob-lang ${lang === l ? 'is-selected' : ''}`}
                aria-pressed={lang === l}
                onClick={() => chooseLang(l)}
              >
                <span>{t(l, 'onboarding.lang.name')}</span>
                {lang === l && <Check />}
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <>
            <label className="ob-field">
              <span>{tr('onboarding.class.label')}</span>
              <input
                className="ob-input ob-code"
                value={code}
                onChange={(e) => edit(setCode, e.target.value)}
                placeholder={tr('onboarding.class.placeholder')}
                maxLength={20}
                readOnly={joined !== null}
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                aria-describedby="ob-code-hint"
              />
            </label>
            <p id="ob-code-hint" className="ob-hint">
              {joined ? tr('onboarding.class.locked', { code: joined.code }) : tr('onboarding.class.hint')}
            </p>
            {!joined && (
              <button type="button" className="k-btn ob-choice ob-switch" onClick={toggleRejoin}>
                {tr(rejoining ? 'onboarding.rejoin.back' : 'onboarding.rejoin.switch')}
              </button>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <label className="ob-field">
              <span>{tr('onboarding.nickname.label')}</span>
              <input
                className="ob-input"
                value={nickname}
                onChange={(e) => edit(setNickname, e.target.value)}
                maxLength={NICKNAME_MAX}
                readOnly={joined !== null}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                aria-invalid={nicknameWarning !== null}
                aria-describedby="ob-nick-hint"
              />
            </label>
            <div id="ob-nick-hint">
              {joined ? (
                <p className="ob-hint">{tr('onboarding.nickname.locked', { nickname: joined.nickname })}</p>
              ) : (
                <>
                  <p className="ob-hint">{tr(rejoining ? 'onboarding.rejoin.nicknameHint' : 'onboarding.nickname.hint')}</p>
                  {nicknameWarning && (
                    <p className="ob-warn">
                      <span aria-hidden="true">⚠ </span>
                      {tr(nicknameWarning === 'personal_info' ? 'onboarding.nickname.personal_info' : 'onboarding.nickname.invalid')}
                    </p>
                  )}
                </>
              )}
            </div>
            {rejoining && !joined && (
              <>
                <label className="ob-field">
                  <span>{tr('onboarding.rejoin.label')}</span>
                  <input
                    className="ob-input ob-code"
                    value={rejoinCode}
                    onChange={(e) => edit(setRejoinCode, cleanRejoinCode(e.target.value))}
                    placeholder={tr('onboarding.rejoin.placeholder')}
                    maxLength={REJOIN_LENGTH + 2}
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    aria-describedby="ob-rejoin-hint"
                  />
                </label>
                <p id="ob-rejoin-hint" className="ob-hint">{tr('onboarding.rejoin.hint')}</p>
              </>
            )}
            <fieldset className="ob-field">
              <legend>{tr('onboarding.avatar.label')}</legend>
              <div className="ob-avatars">
                {AVATARS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`k-btn ob-choice ob-avatar ${avatar === a.id ? 'is-selected' : ''}`}
                    aria-pressed={avatar === a.id}
                    aria-label={tr(`onboarding.avatar.${a.id}`)}
                    onClick={() => setAvatar(a.id)}
                  >
                    <span className="ob-emoji" aria-hidden="true">{a.emoji}</span>
                    {avatar === a.id && <Check />}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {step === 3 && (
          <div className="ob-list">
            {PERSONAS.map((p) => {
              const goal = tr(`persona.${p.id}.goal`, p.goalAmount === null ? {} : { amount: formatRupees(p.goalAmount) });
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`k-btn ob-choice ob-persona ${persona === p.id ? 'is-selected' : ''}`}
                  aria-pressed={persona === p.id}
                  onClick={() => setPersona(p.id)}
                >
                  <span className="ob-portrait" aria-hidden="true">{p.portrait}</span>
                  <span className="ob-persona-text">
                    <span>
                      <span className="ob-persona-name">{tr(`persona.${p.id}.name`)}</span>
                      {' · '}
                      {tr('onboarding.persona.age', { age: p.age })}
                    </span>
                    <span>{tr(`persona.${p.id}.story`)}</span>
                    <span><span aria-hidden="true">💰 </span>{tr(`persona.${p.id}.income`, { amount: formatRupees(p.monthlyIncome) })}</span>
                    <span><span aria-hidden="true">🎯 </span>{tr('onboarding.persona.goal', { goal })}</span>
                  </span>
                  {persona === p.id && <Check />}
                </button>
              );
            })}
          </div>
        )}

        {step === 4 && (
          <>
            {joined?.result.rejoin_code && (
              <section className="k-panel ob-rejoin" aria-labelledby="ob-rejoin-title">
                <p id="ob-rejoin-title">{tr('onboarding.rejoin.card.title')}</p>
                <p className="ob-rejoin-code" lang="en">{formatRejoinCode(joined.result.rejoin_code)}</p>
                <p>{tr('onboarding.rejoin.card.note')}</p>
              </section>
            )}
            <ol className="ob-list">
              {HOWTO.map((h) => (
                <li key={h.key} className="k-panel ob-card">
                  <span className="ob-emoji" aria-hidden="true">{h.icon}</span>
                  <p>{tr(h.key)}</p>
                </li>
              ))}
            </ol>
          </>
        )}
      </main>

      <footer className="ob-foot">
        <button type="submit" className={`k-btn ob-next ${canContinue ? 'is-primary' : 'is-dim'}`} disabled={!canContinue || busy}>
          {tr(busy && step === 2 ? 'onboarding.joining' : action)}
        </button>
      </footer>
    </form>
  );
}

/** Pixel tick shown on the chosen option, so the choice never relies on colour alone. */
function Check() {
  return (
    <svg className="ob-check" viewBox="0 0 7 6" width="21" height="18" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="currentColor" d="M6 0h1v1H6zM5 1h1v1H5zM0 2h1v1H0zM4 2h1v1H4zM1 3h1v1H1zM3 3h1v1H3zM2 4h1v1H2z" />
    </svg>
  );
}
