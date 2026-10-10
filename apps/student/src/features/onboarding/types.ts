import type { Lang, PersonaId } from '@paisa/shared';

export type { Lang, PersonaId };

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
  rejoinCode?: string;         // from join_class: lets the student rejoin on a new phone (show on Me)
}
