import { useEffect, useRef } from 'react';
import type { Lang } from '@paisa/shared';
import { useAvailableVoice } from '../news/speech';
import type { Profile } from '../onboarding';
import { t } from './content';
import { changeLang, isDraftLang, languageChoices } from './lang';
import { useSettings } from './useSettings';
import '../../design/kenney.css';
import '../life/life.css';
import './settings.css';

const SHOW_DRAFT = import.meta.env.VITE_SHOW_DRAFT_LANGS === 'true';

/** Settings behind the gear on the main screen: language, data saver, voice-over (CLAUDE.md 6). */
export function SettingsSheet({ profile, lang, setProfile, onClose }: {
  profile: Profile;
  lang: Lang;
  setProfile: (p: Profile) => void;
  onClose: () => void;
}) {
  const tr = (k: string) => t(lang, k);
  const { dataSaver, voice, setDataSaver, setVoice } = useSettings();
  const hasVoice = useAvailableVoice(lang) !== null;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  const toggle = (label: string, hint: string, on: boolean, set: (v: boolean) => void) => (
    <div className="st-group">
      <button className="k-btn st-row" role="switch" aria-checked={on} onClick={() => set(!on)}>
        <span>{label}</span>
        <span>{tr(on ? 'settings.on' : 'settings.off')}</span>
      </button>
      <p className="st-hint">{hint}</p>
    </div>
  );

  return (
    <div className="lf-overlay" lang={lang} onClick={onClose}>
      <div className="lf-sheet k-panel" role="dialog" aria-modal="true" aria-labelledby="st-title" onClick={(e) => e.stopPropagation()}>
        <div className="lf-sheet-head">
          <h2 id="st-title" className="k-banner lf-title">{tr('settings.title')}</h2>
          <button ref={closeRef} className="k-round" onClick={onClose} aria-label={tr('settings.close')}>
            <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="#4a2b17" d="M0 0h1v1H0zM6 0h1v1H6zM1 1h1v1H1zM5 1h1v1H5zM2 2h1v1H2zM4 2h1v1H4zM3 3h1v1H3zM2 4h1v1H2zM4 4h1v1H4zM1 5h1v1H1zM5 5h1v1H5zM0 6h1v1H0zM6 6h1v1H6z" />
            </svg>
          </button>
        </div>
        <div className="st-list">
          <fieldset className="st-group" role="radiogroup" aria-labelledby="st-lang">
            <legend id="st-lang" className="st-legend">{tr('settings.language')}</legend>
            {languageChoices(SHOW_DRAFT).map((l) => (
              <button
                key={l}
                className="k-btn st-row"
                role="radio"
                aria-checked={profile.lang === l}
                lang={l}
                onClick={() => void changeLang(profile, l, setProfile)}
              >
                <span>{tr(`settings.lang.${l}`)}</span>
                {isDraftLang(l) && <span className="st-draft">{tr('settings.draft')}</span>}
              </button>
            ))}
          </fieldset>
          {toggle(tr('settings.data_saver'), tr('settings.data_saver.hint'), dataSaver, setDataSaver)}
          {hasVoice && toggle(tr('settings.voice'), tr('settings.voice.hint'), voice, setVoice)}
        </div>
      </div>
    </div>
  );
}
