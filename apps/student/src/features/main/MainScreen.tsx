import { useEffect, useState } from 'react';
import { track } from '../../api/track';
import { useGame } from '../../game/useGame';
import { lifeApi } from '../life/life';
import { useHasUnread } from '../news';
import type { Profile } from '../onboarding';
import { formatRupees, t } from './content';
import { PersonaSprite } from './PersonaSprite';
import '../../design/kenney.css';
import './main.css';

/**
 * The screen every session starts on (CLAUDE.md 1.1): the persona on a couch, a news rack that
 * opens Paisa Times, and one big Play button that opens the map. Placeholder CSS art for now.
 */
export function MainScreen({ profile, lang, onPlay, onOpenNews }: {
  profile: Profile;
  lang: Profile['lang'];
  onPlay: () => void;
  onOpenNews: () => void;
}) {
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);
  const life = useGame((s) => s.life);
  const apply = useGame((s) => s.apply);
  const unread = useHasUnread();
  const [paid, setPaid] = useState<number | null>(null);

  // Home is Plan & budget (CLAUDE.md 5.8): pay back a family loan from here.
  const payBack = () => {
    const out = lifeApi.repay(life);
    if (out.blocked) return;
    apply(out);
    setPaid(-out.delta.money);
  };

  useEffect(() => {
    track('app_open');
  }, []);

  return (
    <div className="ms-screen" lang={lang}>
      <header className="ms-top k-panel">
        <span className="ms-money" aria-label={`${tr('main.money')}: ${formatRupees(life.money)}`}>
          <span className="ms-coin" aria-hidden="true" />
          <span aria-hidden="true">{formatRupees(life.money)}</span>
        </span>
        <span className="ms-week">{tr('main.week', { month: life.month, week: life.week })}</span>
      </header>

      <section className="ms-room" aria-label={tr('main.persona', { name: tr(`persona.${profile.persona}.name`) })}>
        <div className="ms-window" aria-hidden="true" />
        <div className="ms-couch" aria-hidden="true">
          <span className="ms-couch-back" />
          <span className="ms-sitter">
            <PersonaSprite persona={profile.persona} />
          </span>
          <span className="ms-couch-seat" />
          <span className="ms-couch-arm is-left" />
          <span className="ms-couch-arm is-right" />
        </div>

        <button className="ms-rack" onClick={onOpenNews} aria-label={tr('main.news.open')}>
          <span className="ms-rack-papers" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="ms-rack-label">{tr('main.news')}</span>
          {unread && <span className="ms-badge">{tr('main.new')}</span>}
        </button>
      </section>

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
        <button className="k-btn is-primary ms-play" onClick={onPlay}>
          <svg viewBox="0 0 5 7" width="15" height="21" aria-hidden="true" shapeRendering="crispEdges">
            <path fill="#fff" d="M0 0h1v7H0zM1 1h1v5H1zM2 2h1v3H2zM3 3h1v1H3z" />
          </svg>
          <span>{tr('main.play')}</span>
        </button>
      </div>
    </div>
  );
}
