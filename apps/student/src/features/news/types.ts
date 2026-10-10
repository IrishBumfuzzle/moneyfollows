// Mirror of the Paisa Times types in packages/shared (origin/Backend, CLAUDE.md 5.1). When
// packages/shared is on main, delete this file and import from '@paisa/shared'.

export type Lang = 'en' | 'hi' | 'te' | 'ur';
export type TKey = `t:${string}`;

export interface GlossaryTerm {
  id: string;
  word: TKey;
  simple: TKey;
  example: TKey;
}

export interface Article {
  id: string;
  edition: string;                               // e.g. "2026-W41"
  headline: TKey;
  body: TKey;                                    // contains [[termId]] markers
  terms: string[];                               // GlossaryTerm ids
  question: { prompt: TKey; options: TKey[]; correct: number; explanation: TKey };
  reward: { wage: number; xp: number };          // wage = in-game rupees for the paper-route shift
  meta: { status: 'draft' | 'reviewed'; author: string; factsCheckedBy?: string };
}

export interface Edition {
  id: string;                                    // "2026-W41"
  articles: Article[];
}
