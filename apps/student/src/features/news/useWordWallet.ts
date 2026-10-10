// Every glossary word the player has opened, newest first, saved to IndexedDB.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { idbStorage } from '../../game/storage';

export interface WalletWord {
  termId: string;
  articleId: string;   // where it was first tapped
}

/** Pure add, exported for tests: a new word goes first; a word already collected stays put. */
export function addWord(words: WalletWord[], termId: string, articleId: string): WalletWord[] {
  return words.some((w) => w.termId === termId) ? words : [{ termId, articleId }, ...words];
}

interface WordWalletStore {
  words: WalletWord[];
  add: (termId: string, articleId: string) => void;
}

export const useWordWallet = create<WordWalletStore>()(
  persist(
    (set) => ({
      words: [],
      add: (termId, articleId) => set((s) => ({ words: addWord(s.words, termId, articleId) })),
    }),
    { name: 'paisa.wordwallet', version: 1, storage: createJSONStorage(() => idbStorage) },
  ),
);
