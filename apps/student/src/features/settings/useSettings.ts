// Per-phone settings: data saver and voice. Saved to IndexedDB with the game. Data saver puts
// `data-saver` on <html>, which settings.css treats like prefers-reduced-motion: no animation.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { idbStorage } from '../../game/storage';

interface SettingsStore {
  dataSaver: boolean;
  voice: boolean;
  setDataSaver: (on: boolean) => void;
  setVoice: (on: boolean) => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      dataSaver: false,
      voice: true,
      setDataSaver: (on) => set({ dataSaver: on }),
      setVoice: (on) => set({ voice: on }),
    }),
    {
      name: 'paisa.settings',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ dataSaver: s.dataSaver, voice: s.voice }),
    },
  ),
);

/** The `data-saver` attribute on <html> follows the setting, from the saved value on. The other
 * screens' CSS and RestScene key off the attribute (`html[data-saver]`), not a class. */
export function applyDataSaver(
  on: boolean,
  root: Pick<Element, 'toggleAttribute'> = document.documentElement,
): void {
  root.toggleAttribute('data-saver', on);
}

if (typeof document !== 'undefined') {
  useSettings.subscribe((s) => applyDataSaver(s.dataSaver));
}
