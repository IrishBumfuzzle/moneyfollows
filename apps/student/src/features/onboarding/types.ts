// Mirror of the types onboarding needs from packages/shared (CLAUDE.md 5.1). `packages/shared`
// is not on main yet; when it lands, import Lang and PersonaId from '@paisa/shared' instead.

export type Lang = 'en' | 'hi' | 'te' | 'ur';
export type PersonaId = 'ravi' | 'sana' | 'kiran' | 'lakshmi';

/** Saved on the phone (IndexedDB) after onboarding. Nickname + class only, no real names (CLAUDE.md 7.5). */
export interface Profile {
  version: 1;
  nickname: string;
  avatar: string;              // AVATARS id
  persona: PersonaId;
  lang: Lang;
  classCode: string;
  classId: string;             // from join_class
  anonId: string;              // from join_class
}
