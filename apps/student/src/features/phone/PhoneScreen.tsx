import { useEffect, useState } from 'react';
import { t as et } from '../events/content';
import { getEvent } from '../events/data';
import { useEvents } from '../events/useEvents';
import type { Profile } from '../onboarding';
import { trackPhoneApp } from './api';
import type { PhoneApp } from './api';
import { CallLog, CallView } from './CallsApp';
import { t } from './content';
import type { Lang } from './content';
import { ChatThread, Inbox } from './MessagesApp';
import { SnakeApp } from './SnakeApp';
import { VanguardApp } from './VanguardApp';
import '../../design/kenney.css';
import '../events/events.css';
import './phone.css';

/**
 * Where on the phone the player is. Each level is a history entry ({ screen: 'phone', app, item }),
 * so Android back goes item → app → home screen → wherever the phone was opened from (CLAUDE.md 6).
 */
export interface PhoneNav {
  app?: PhoneApp;
  item?: string;     // a message thread or call id
}

const navOf = (s: unknown): PhoneNav => {
  const n = s as { screen?: string; app?: PhoneApp; item?: string } | null;
  return n?.screen === 'phone' ? { app: n.app, item: n.item } : {};
};

const APPS: PhoneApp[] = ['messages', 'calls', 'vanguard', 'snake'];

function useClock(): string {
  const read = () => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const [now, setNow] = useState(read);
  useEffect(() => {
    const id = window.setInterval(() => setNow(read()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function PhoneScreen({ lang, name, profile, onExit }: { lang: Lang; name: string; profile: Profile; onExit: () => void }) {
  const [nav, setNav] = useState<PhoneNav>(() => navOf(window.history.state));
  const unread = useEvents((s) => s.inbox.filter((m) => !m.read).length);
  const missed = useEvents((s) => s.calls.filter((c) => c.status === 'missed').length);
  const clock = useClock();
  const tr = (k: string, vars?: Record<string, string | number>) => t(lang, k, vars);

  useEffect(() => {
    const on = (e: PopStateEvent) => setNav(navOf(e.state));
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  const go = (n: PhoneNav) => {
    window.history.pushState({ screen: 'phone', ...n }, '');
    setNav(n);
    if (n.app && !n.item) trackPhoneApp(n.app);
  };
  // Up one level. Uses history when this level has its own entry, else just changes the view.
  const back = () => {
    const here = navOf(window.history.state);
    if (here.app || here.item) window.history.back();
    else if (nav.item) setNav({ app: nav.app });
    else if (nav.app) setNav({});
    else onExit();
  };
  const home = () => {
    if (!nav.app) return onExit();
    // Unwind this phone's entries so Android back from the home screen leaves the phone.
    const depth = nav.item ? 2 : 1;
    if (navOf(window.history.state).app) window.history.go(-depth);
    else setNav({});
  };

  const badge = (app: PhoneApp) => (app === 'messages' ? unread : app === 'calls' ? missed : 0);
  const item = nav.item ? getEvent(nav.item) : undefined;
  const title = item
    ? item.kind === 'phone' ? et(lang, item.sender, { name }) : item.kind === 'call' ? et(lang, item.caller, { name }) : ''
    : nav.app ? tr(`phone.app.${nav.app}`) : '';

  return (
    <div className="ev-phone-screen" lang={lang}>
      <div className="ev-device ph-device">
        <div className="ph-status" aria-hidden="true">
          <span>{clock}</span>
          <span className="ph-status-icons">
            <span className="ph-signal"><i /><i /><i /><i /></span>
            <span className="ph-battery"><i /></span>
          </span>
        </div>

        {nav.app ? (
          <>
            <div className={`ev-device-bar ph-bar is-${nav.app}`}>
              <button className="ev-device-back" onClick={back} aria-label={tr('phone.back')}>
                <svg viewBox="0 0 7 7" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
                  <path fill="currentColor" d="M3 0h1v1H3zM2 1h1v1H2zM1 2h1v1H1zM0 3h7v1H0zM1 4h1v1H1zM2 5h1v1H2zM3 6h1v1H3z" />
                </svg>
              </button>
              <span className="ev-device-title">
                <span className="ev-device-name">{title}</span>
              </span>
            </div>
            <div className="ev-device-screen">
              {nav.app === 'messages' &&
                (item?.kind === 'phone' ? (
                  <ChatThread lang={lang} name={name} thread={item} onDone={back} />
                ) : (
                  <Inbox lang={lang} name={name} onOpen={(id) => go({ app: 'messages', item: id })} />
                ))}
              {nav.app === 'calls' &&
                (item?.kind === 'call' ? (
                  <CallView lang={lang} name={name} call={item} onDone={back} />
                ) : (
                  <>
                    <h3 className="ph-section">{tr('phone.calls.title')}</h3>
                    <CallLog lang={lang} name={name} onOpen={(id) => go({ app: 'calls', item: id })} />
                  </>
                ))}
              {nav.app === 'vanguard' && <VanguardApp lang={lang} profile={profile} />}
              {nav.app === 'snake' && <SnakeApp lang={lang} />}
            </div>
          </>
        ) : (
          <div className="ph-home">
            <ul className="ph-apps">
              {APPS.map((app) => (
                <li key={app}>
                  <button
                    className="ph-app"
                    onClick={() => go({ app })}
                    aria-label={badge(app) ? `${tr(`phone.app.${app}`)}, ${tr('phone.badge', { n: badge(app) })}` : tr(`phone.app.${app}`)}
                  >
                    <span className={`ph-icon is-${app}`} aria-hidden="true">
                      <AppGlyph app={app} />
                      {badge(app) > 0 && <span className="ph-badge">{badge(app)}</span>}
                    </span>
                    <span className="ph-app-name" aria-hidden="true">{tr(`phone.app.${app}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button className="ph-home-bar" onClick={home} aria-label={tr(nav.app ? 'phone.home' : 'phone.close')}>
          <span />
        </button>
      </div>
    </div>
  );
}

/** Pixel glyphs for the four app icons (8x8, white on the icon colour). */
function AppGlyph({ app }: { app: PhoneApp }) {
  const paths: Record<PhoneApp, string> = {
    messages: 'M1 1h6v1H1zM0 2h1v3H0zM7 2h1v3H7zM1 5h3v1H1zM5 5h2v1H5zM2 6h1v1H2zM2 3h4v1H2z',
    calls: 'M1 1h2v2H1zM2 3h1v1H2zM3 4h1v1H3zM4 5h1v1H4zM5 5h2v2H5z',
    vanguard: 'M0 1h2v1H0zM6 1h2v1H6zM1 2h2v1H1zM5 2h2v1H5zM2 3h1v2H2zM5 3h1v2H5zM3 5h2v1H3zM3 6h2v1H3z',
    snake: 'M1 1h4v1H1zM1 2h1v2H1zM2 3h4v1H2zM5 4h1v2H5zM2 5h3v1H2zM6 1h1v1H6z',
  };
  return (
    <svg viewBox="0 0 8 8" width="32" height="32" shapeRendering="crispEdges">
      <path fill="#fff" d={paths[app]} />
    </svg>
  );
}
