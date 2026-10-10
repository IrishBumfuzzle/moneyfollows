import { useEffect, useState } from 'react';
import { useGame } from '../../game/useGame';
import { lifeApi } from '../life/life';
import { useHasUnread } from '../news';
import type { Profile } from '../onboarding';
import { PERSONAS } from '../onboarding/presets';
import { formatRejoinCode } from '../onboarding/validate';
import { trackAppOpen } from './appOpen';
import { formatRupees, t } from './content';
import '../../design/kenney.css';
import './main.css';

// Backdrop: public/assets/main/room.png, 360x640, built by tools/build-main.py together with the
// rack and persona sprites. Everything below is laid out in those stage pixels and scaled as one,
// like the classroom: whole-number zoom when the screen is big enough, a fractional fit on short phones.
const STAGE = { w: 360, h: 640 };
const MAX_ZOOM = 3;

// Same as ClassroomScreen's, which doesn't export it.
function useStageScale() {
  const read = () => {
    const s = Math.min(window.innerWidth / STAGE.w, window.innerHeight / STAGE.h);
    return s >= 1 ? Math.min(MAX_ZOOM, Math.floor(s)) : s;
  };
  const [scale, setScale] = useState(read);
  useEffect(() => {
    const on = () => setScale(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return scale;
}

/**
 * The screen every session starts on (CLAUDE.md 1.1): the persona on a couch, a news rack that
 * opens Paisa Times, and one big Play button that opens the map.
 */
export function MainScreen({ profile, lang, onPlay, onOpenNews }: {
  profile: Profile;
  lang: Profile['lang'];
  onPlay: () => void;
  onOpenNews: () => void;
}) {
  const scale = useStageScale();
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const life = useGame((s) => s.life);
  const apply = useGame((s) => s.apply);
  const unread = useHasUnread();
  const [paid, setPaid] = useState<number | null>(null);
  const name = tr(`persona.${profile.persona}.name`);
  const sprite = PERSONAS.some((p) => p.id === profile.persona) ? profile.persona : 'sana';
  const money = formatRupees(life.money);

  // Home is Plan & budget (CLAUDE.md 5.8): pay back a family loan from here.
  const payBack = () => {
    const out = lifeApi.repay(life);
    if (out.blocked) return;
    apply(out);
    setPaid(-out.delta.money);
  };

  useEffect(() => {
    trackAppOpen();
  }, []);

  return (
    <div className="ms-screen" lang={lang}>
      <div className="ms-stage" style={{ width: STAGE.w, height: STAGE.h, transform: `scale(${scale})` }}>
        <h1 className="ms-sr">{tr('main.title', { name })}</h1>

        <div className="ms-hud">
          <p className="k-panel ms-chip">
            <Coin />
            <span className="ms-sr">{`${tr('main.money')}: ${money}`}</span>
            <span aria-hidden="true">{money}</span>
          </p>
          <p className="k-panel ms-chip">{tr('main.week', { month: life.month, week: life.week, day: life.day })}</p>
        </div>

        <div className="ms-char" role="img" aria-label={tr('main.persona', { name })} style={{ backgroundImage: `url(/assets/main/${sprite}.png)` }} />

        <button className="ms-news" onClick={onOpenNews} aria-label={tr(unread ? 'main.news.open_new' : 'main.news.open')}>
          <img className="ms-rack" src="/assets/main/rack.png" alt="" width={80} height={110} />
          {unread && <span className="ms-new" aria-hidden="true">{tr('main.new')}</span>}
          <span className="ms-news-label" aria-hidden="true">{tr('main.news')}</span>
        </button>

        <div className="ms-bottom">
          {life.debt > 0 && (
            <div className="ms-debt k-panel">
              <span>{tr('main.owe', { debt: formatRupees(life.debt) })}</span>
              <button className="k-btn ms-debt-btn" onClick={payBack} disabled={life.money <= 0}>
                {tr('main.pay_back')}
              </button>
            </div>
          )}
          <p className="ms-paid" role="status">
            {paid !== null && life.debt === 0 ? tr('main.paid_back', { amount: formatRupees(paid) }) : ''}
          </p>
          <p className="ms-greeting">{tr('main.greeting', { nickname: profile.nickname })}</p>
          {profile.rejoinCode && <p className="ms-rejoin">{tr('main.rejoin', { code: formatRejoinCode(profile.rejoinCode) })}</p>}
          <button className="k-btn is-primary ms-play" onClick={onPlay}>
            <svg viewBox="0 0 5 9" width="15" height="27" aria-hidden="true" shapeRendering="crispEdges">
              <path fill="currentColor" d="M0 0h1v9H0zM1 1h1v7H1zM2 2h1v5H2zM3 3h1v3H3zM4 4h1v1H4z" />
            </svg>
            <span>{tr('main.play')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pixel coin for the wallet chip. */
function Coin() {
  return (
    <svg viewBox="0 0 7 7" width="21" height="21" aria-hidden="true" shapeRendering="crispEdges">
      <path fill="#a0603a" d="M2 0h3v1H2zM1 1h1v1H1zM5 1h1v1H5zM0 2h1v3H0zM6 2h1v3H6zM1 5h1v1H1zM5 5h1v1H5zM2 6h3v1H2z" />
      <path fill="#ffd23f" d="M2 1h3v1H2zM1 2h5v3H1zM2 5h3v1H2z" />
      <path fill="#fff3a6" d="M2 2h1v2H2z" />
    </svg>
  );
}
