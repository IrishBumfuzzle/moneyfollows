// The hidden demo panel's buttons (CLAUDE.md 9), as a plain list: add one line per action.
// Staff-only tool, so the labels are English-only and never shown to students.
import type { Lang, PersonaId } from '@paisa/shared';
import { isSimulatingOffline, simulateOffline } from '../../api/backend';
import { useGame } from '../../game/useGame';
import { triggerEvent } from '../events';
import { lifeApi } from '../life/life';
import { markNewEdition } from '../news';
import type { Profile } from '../onboarding';
import { changeLang } from '../settings/lang';
import { saveProfile } from '../onboarding/profile';
import { resetSaves } from './reset';

/** Screens the panel can jump to; App.tsx's open() accepts each of these. */
export const JUMPS = [
  'map', 'home', 'store', 'kirana', 'counter', 'hospital', 'cover', 'claims', 'classroom', 'news', 'phone', 'learn',
] as const;
export type JumpScreen = (typeof JUMPS)[number];

export interface DemoContext {
  go: (screen: JumpScreen) => void;
  profile: Profile;
  setProfile: (p: Profile) => void;
}

export interface DemoAction {
  group: 'Jump' | 'Events' | 'Money & time' | 'App';
  label: string | (() => string);
  run: (ctx: DemoContext) => void | Promise<void>;
  /** Keep the panel open afterwards (toggles). Default: close it. */
  stay?: boolean;
}

const life = () => useGame.getState().life;
const apply = useGame.getState().apply;

/** Sleeps until the week (or month) rolls over: up to seven rests. */
export function endWeek(): void {
  const start = life();
  for (let i = 0; i < 7; i++) {
    const out = lifeApi.rest(life());
    apply(out);
    if (out.state.week !== start.week || out.state.month !== start.month) return;
  }
}

async function setPersona(ctx: DemoContext, persona: PersonaId) {
  const p = { ...ctx.profile, persona };
  await saveProfile(p).catch(() => {});
  ctx.setProfile(p);
}

const switchLang = (ctx: DemoContext, lang: Lang) => changeLang(ctx.profile, lang, ctx.setProfile);

export const ACTIONS: DemoAction[] = [
  ...JUMPS.map((s): DemoAction => ({ group: 'Jump', label: s, run: (ctx) => ctx.go(s) })),

  { group: 'Events', label: 'Scam message (KYC)', run: () => triggerEvent('phone.kyc.01') },
  { group: 'Events', label: 'Scam message (OTP)', run: () => triggerEvent('phone.otp.01') },
  { group: 'Events', label: 'Incoming call (bank officer)', run: () => triggerEvent('call.bank_officer.01') },
  { group: 'Events', label: 'Injury (hospital bill)', run: () => triggerEvent('event.injury.01') },
  { group: 'Events', label: 'New Paisa Times edition', run: () => markNewEdition() },

  { group: 'Money & time', label: '+₹500', run: () => apply(lifeApi.applyEffects(life(), { money: 500 })), stay: true },
  { group: 'Money & time', label: 'Next day', run: () => apply(lifeApi.rest(life())), stay: true },
  { group: 'Money & time', label: 'End the week', run: endWeek, stay: true },

  {
    group: 'App',
    label: () => (isSimulatingOffline() ? 'Back online (flush queue)' : 'Simulate offline'),
    run: () => simulateOffline(!isSimulatingOffline()),
    stay: true,
  },
  { group: 'App', label: 'Persona: Sana', run: (ctx) => setPersona(ctx, 'sana') },
  { group: 'App', label: 'Persona: Ravi', run: (ctx) => setPersona(ctx, 'ravi') },
  { group: 'App', label: 'Language: English', run: (ctx) => switchLang(ctx, 'en') },
  { group: 'App', label: 'Language: Hindi', run: (ctx) => switchLang(ctx, 'hi') },
  { group: 'App', label: 'Reset everything', run: resetSaves },
];
