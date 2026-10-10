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
  rejoinCode?: string;         // from join_class / class_status: gets the student back on a new phone
  endlineOpen?: boolean;       // last known class_status.endline_open, so an offline cold start keeps the gate
}
