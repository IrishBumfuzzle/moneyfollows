// Voice-over through the browser's speechSynthesis (CLAUDE.md 2 "Should"). The speaker button
// hides itself when the phone has no voice for the current language.
import { useEffect, useState } from 'react';
import type { Lang } from './types';

const BCP47: Partial<Record<Lang, string>> = { en: 'en-IN', hi: 'hi-IN' };

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const want = BCP47[lang];
  if (!want) return null;
  const voices = window.speechSynthesis.getVoices();
  const base = want.split('-')[0];
  return (
    voices.find((v) => v.lang.replace('_', '-') === want) ??
    // en-IN is often missing; any English voice still reads English text. Hindi needs a Hindi voice.
    (lang === 'en' ? voices.find((v) => v.lang.startsWith(base)) : undefined) ??
    null
  );
}

/** The voice for `lang`, or null; updates when the browser finishes loading its voices. */
export function useVoice(lang: Lang): SpeechSynthesisVoice | null {
  const [voice, setVoice] = useState(() => pickVoice(lang));
  useEffect(() => {
    setVoice(pickVoice(lang));
    if (!('speechSynthesis' in window)) return;
    const on = () => setVoice(pickVoice(lang));
    window.speechSynthesis.addEventListener('voiceschanged', on);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', on);
  }, [lang]);
  return voice;
}

export function speak(text: string, voice: SpeechSynthesisVoice): void {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}
