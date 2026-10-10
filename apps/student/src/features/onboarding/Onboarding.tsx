import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { JoinError, joinClass } from '../../api/joinClass';
import type { JoinResult } from '../../api/joinClass';
import { track } from '../../api/track';
import { formatRupees, t } from './content';
import { AVATARS, PERSONAS } from './presets';
import { saveProfile } from './profile';
import type { Lang, PersonaId, Profile } from './types';
import { cleanCode, isValidNickname, NICKNAME_MAX } from './validate';
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

type Joined = { code: string; nickname: string; result: JoinResult };

/**
 * First launch: language → class code → nickname + avatar → persona → how to play.
 * join_class needs the nickname (CLAUDE.md 5.5), so step 2 only checks the code and the call
 * runs on step 3's Next; a wrong code sends the player back to step 2.
 */
export function Onboarding({ onDone, initialLang = 'en' }: { onDone: (profile: Profile) => void; initialLang?: Lang }) {
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<Lang>(initialLang);
  const [code, setCode] = useState(() => cleanCode(new URLSearchParams(window.location.search).get('code') ?? ''));
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [persona, setPersona] = useState<PersonaId | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ step: number; key: string } | null>(null);
  const furthest = useRef(0); // furthest step whose data is still valid; caps browser back/forward
  const titleRef = useRef<HTMLHeadingElement>(null);
  const tr = (key: string, vars?: Record<string, string | number>) => t(lang, key, vars);

  // Android back steps back through onboarding instead of leaving the app (CLAUDE.md 6). The
  // entries have no `screen` key, so App's popstate handler reads them as the main screen once we're done.
  useEffect(() => {
    const on = (e: PopStateEvent) => {
      const s = (e.state as { onboardingStep?: number } | null)?.onboardingStep ?? 0;
      setStep(Math.min(s, furthest.current));
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  // Move focus to the title on each step, so screen readers read it next.
  useEffect(() => titleRef.current?.focus(), [step]);

  const nicknameOk = isValidNickname(nickname);
  const canContinue = [true, cleanCode(code) !== '', nicknameOk && avatar !== null, persona !== null, joined !== null][step];

  function goTo(n: number) {
    furthest.current = Math.max(furthest.current, n);
    window.history.pushState({ onboardingStep: n }, '');
    setStep(n);
  }

  // Editing the code or nickname invalidates the steps after this one.
  function edit(set: (v: string) => void, v: string) {
    set(v);
    setError(null);
    furthest.current = step;
  }

  function chooseLang(l: Lang) {
    if (l === lang) return;
    setLang(l);
    track('language_changed', { lang: l });
  }

  async function join() {
    const c = cleanCode(code);
    const n = nickname.trim();
    if (joined?.code === c && joined.nickname === n) return goTo(3);
    setBusy(true);
    try {
      setJoined({ code: c, nickname: n, result: await joinClass(c, n) });
      goTo(3);
    } catch (err) {
      const kind = err instanceof JoinError ? err.code : null;
      if (kind === 'class_not_found') {
        setError({ step: 1, key: 'onboarding.class.notFound' });
        window.history.back(); // to the class-code step
      } else {
        setError({ step: 2, key: kind === 'nickname_rejected' ? 'onboarding.nickname.rejected' : 'onboarding.error.generic' });
      }
    } finally {
      setBusy(false);
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
    };
    setBusy(true);
    try {
      await saveProfile(profile);
    } catch (err) {
      console.warn('Profile not saved; onboarding will show again next launch.', err);
    }
    track('persona_selected', { persona_id: persona });
    track('onboarding_complete', { persona_id: persona, lang });
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

  return (
    <form className="ob-screen" lang={lang} onSubmit={submit} noValidate>
      <header className="ob-top">
        {step > 0 ? (
          <button type="button" className="k-round ob-back" onClick={() => window.history.back()} aria-label={tr('onboarding.back')}>
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
        <h1 className="ob-title" ref={titleRef} tabIndex={-1}>{tr(TITLES[step])}</h1>

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
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                aria-describedby="ob-code-hint"
              />
            </label>
            <p id="ob-code-hint" className="ob-hint">{tr('onboarding.class.hint')}</p>
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
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                aria-invalid={nickname !== '' && !nicknameOk}
                aria-describedby="ob-nick-hint"
              />
            </label>
            <div id="ob-nick-hint">
              <p className="ob-hint">{tr('onboarding.nickname.hint')}</p>
              {nickname !== '' && !nicknameOk && (
                <p className="ob-warn"><span aria-hidden="true">⚠ </span>{tr('onboarding.nickname.invalid')}</p>
              )}
            </div>
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
          <ol className="ob-list">
            {HOWTO.map((h) => (
              <li key={h.key} className="k-panel ob-card">
                <span className="ob-emoji" aria-hidden="true">{h.icon}</span>
                <p>{tr(h.key)}</p>
              </li>
            ))}
          </ol>
        )}

        {error?.step === step && (
          <p className="k-panel ob-error" role="alert"><span aria-hidden="true">⚠ </span>{tr(error.key)}</p>
        )}
      </main>

      <footer className="ob-foot">
        <button type="submit" className={`k-btn ob-next ${canContinue ? 'is-primary' : 'is-dim'}`} disabled={!canContinue || busy}>
          {tr(busy && step === 2 ? 'onboarding.joining' : ACTIONS[step])}
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
