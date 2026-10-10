// Word filter for nicknames (B4). Lists are short on purpose: the facilitator
// sees every nickname and can rename a student. Matching ignores case, spaces
// and common letter swaps, so "b@dw0rd" is caught too.

const BLOCKED: Record<string, string[]> = {
  en: ['fuck', 'shit', 'bitch', 'bastard', 'dick', 'cunt', 'slut', 'whore', 'sex', 'porn', 'nude', 'rape', 'kill', 'nazi', 'idiot', 'stupid'],
  // Common Hindi/Hinglish abuse, in Latin letters and Devanagari.
  hi: ['chutiya', 'madarchod', 'behenchod', 'bhenchod', 'gandu', 'randi', 'harami', 'kutta', 'kutiya', 'saala', 'chod', 'लौड़ा', 'चूतिया', 'मादरचोद', 'बहनचोद', 'गांडू', 'रंडी', 'हरामी', 'कुत्ता', 'कुतिया'],
};

const SWAPS: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

export type NicknameProblem = 'blocked_word' | 'personal_info';

export function checkNickname(nickname: string): NicknameProblem | null {
  // No phone numbers or emails: nicknames are visible to the facilitator and in reports.
  if (/\d{5,}/.test(nickname.replace(/[\s.-]/g, '')) || nickname.includes('@')) return 'personal_info';
  const squashed = [...nickname.toLowerCase()].map((c) => SWAPS[c] ?? c).join('').replace(/[\s_.-]/g, '');
  for (const words of Object.values(BLOCKED)) {
    if (words.some((w) => squashed.includes(w))) return 'blocked_word';
  }
  return null;
}
