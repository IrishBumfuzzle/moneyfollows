// Demo mode's seeded save (CLAUDE.md 9: ?demo=1). Pure: builds the values the slot writes into the
// demo database before the stores read it. The persist envelopes ({ state, version }) match the
// zustand stores' names and versions; an older version here simply runs that store's migrate.
import type { Lang, PersonaId } from '@paisa/shared';
import type { LifeState } from '../life/types';
import type { Profile } from '../onboarding/types';

export const DEMO_CLASS_CODE = 'HYD234';
const PERSONAS: PersonaId[] = ['sana', 'ravi'];

export interface DemoOptions {
  persona: PersonaId;
  lang: Lang;
  /** VITE_SHOW_DRAFT_LANGS: Telugu may be picked only then. */
  draftLangs?: boolean;
}

/** ?persona= (sana | ravi, default sana) and ?lang= (en | hi, te with draft langs; default en). */
export function demoOptions(params: URLSearchParams, draftLangs = false): DemoOptions {
  const p = params.get('persona') as PersonaId | null;
  const l = params.get('lang');
  const lang: Lang = l === 'hi' || (l === 'te' && draftLangs) ? l : 'en';
  return { persona: p && PERSONAS.includes(p) ? p : 'sana', lang };
}

/** Who the demo student is. `ids` come from a real join of HYD234, or the offline stand-in. */
export function demoProfile(o: DemoOptions, ids: { anonId: string; classId: string; nickname: string; rejoinCode?: string | null }): Profile {
  return {
    version: 1,
    nickname: ids.nickname,
    avatar: 'tiger',
    persona: o.persona,
    lang: o.lang,
    classCode: DEMO_CLASS_CODE,
    classId: ids.classId,
    anonId: ids.anonId,
    ...(ids.rejoinCode ? { rejoinCode: ids.rejoinCode } : {}),
    endlineOpen: false,
  };
}

/** Mid-week in month 1: some money saved, meters part-used, nothing earned or flagged yet today. */
export function demoLife(): LifeState {
  return { month: 1, week: 2, day: 3, money: 1240, debt: 0, flags: [], earned: [], vitals: { health: 18, sanity: 15 } };
}

/** "Demo" plus four digits, so repeat demos never collide on join_class's unique nicknames. */
export const demoNickname = (n: number) => `Demo${String(Math.abs(Math.trunc(n)) % 10000).padStart(4, '0')}`;

/**
 * Every key the demo database starts with. Paisa Times is left out on purpose, so the edition is
 * unread. The event schedule starts one step in, so the first map visit brings the KYC scam text.
 */
export function demoEntries(profile: Profile): [string, unknown][] {
  const envelope = (state: unknown, version: number) => JSON.stringify({ state, version });
  return [
    ['paisa.profile', profile],
    ['paisa.game', envelope({ life: demoLife() }, 3)],
    ['paisa.events', envelope({ steps: 1, fired: [], inbox: [], sudden: null, calls: [] }, 2)],
  ];
}

/** The URL after seeding: reset=1 is dropped so a reload keeps the demo instead of starting over. */
export function withoutReset(href: string): string {
  const u = new URL(href);
  u.searchParams.delete('reset');
  return u.pathname + (u.search ? u.search : '') + u.hash;
}
