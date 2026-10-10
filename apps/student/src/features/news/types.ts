// Paisa Times types come from the frozen contracts in packages/shared (CLAUDE.md 5.1).
import type { Article } from '@paisa/shared';

export type { Article, GlossaryTerm, Lang, TKey } from '@paisa/shared';

export interface Edition {
  id: string;                                    // "2026-W41"
  articles: Article[];
}
