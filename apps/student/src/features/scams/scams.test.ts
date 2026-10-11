import { describe, expect, it } from 'vitest';
import { STRINGS, UI_STRINGS } from './content';
import { HELP_LINKS, MESSAGES, ROUNDS, dealGame, flagged, judge, scoreGame } from './scams';

const SEEDS = Array.from({ length: 100 }, (_, i) => i * 7919 + 5);

describe('dealGame', () => {
  it('is deterministic and never mutates the content', () => {
    const before = JSON.stringify(MESSAGES);
    expect(dealGame(4)).toEqual(dealGame(4));
    expect(JSON.stringify(MESSAGES)).toBe(before);
  });

  it('deals ROUNDS distinct messages, mixing scams and safe ones', () => {
    for (const seed of SEEDS) {
      const g = dealGame(seed);
      expect(g).toHaveLength(ROUNDS);
      expect(new Set(g.map((m) => m.id)).size).toBe(ROUNDS);
      expect(g.filter((m) => m.verdict === 'safe')).toHaveLength(2);
    }
  });
});

describe('judge and scoreGame', () => {
  const scam = MESSAGES.find((m) => m.verdict === 'scam' && flagged(m).length >= 2)!;
  const safe = MESSAGES.find((m) => m.verdict === 'safe')!;

  it('scores the call and counts the warning signs inspected', () => {
    const first = flagged(scam)[0]!;
    expect(judge(scam, 'scam', new Set([first]))).toEqual({ id: scam.id, pick: 'scam', ok: true, found: 1, flags: flagged(scam).length });
    expect(judge(safe, 'scam', new Set()).ok).toBe(false);
    expect(judge(safe, 'safe', new Set([0])).found).toBe(0);
  });

  it('sums a game', () => {
    const calls = [judge(scam, 'scam', new Set(flagged(scam))), judge(safe, 'scam', new Set())];
    expect(scoreGame(calls)).toEqual({ correct: 1, total: 2, score: 50, found: flagged(scam).length, flags: flagged(scam).length });
    expect(scoreGame([])).toEqual({ correct: 0, total: 0, score: 0, found: 0, flags: 0 });
  });
});

describe('scam strings (CLAUDE.md 7.2)', () => {
  it('UI strings: en and hi have the same keys, the same {{vars}} and no empty strings', () => {
    expect(Object.keys(UI_STRINGS.hi!).sort()).toEqual(Object.keys(UI_STRINGS.en!).sort());
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(UI_STRINGS.en!)) {
      expect(v.trim(), k).not.toBe('');
      expect(vars(UI_STRINGS.hi![k]!), k).toEqual(vars(v));
    }
  });

  it('every message key from the content pack resolves in en and hi', () => {
    for (const m of MESSAGES) {
      const keys = [m.sender, m.explanation, ...m.segments.flatMap((s) => [s.text, ...(s.suspicious ? [s.suspicious] : [])])];
      for (const k of keys) {
        for (const lang of ['en', 'hi'] as const) expect(STRINGS[lang]![k.slice(2)], `${lang} ${k}`).toBeTruthy();
      }
      expect(UI_STRINGS.en![`scams.channel.${m.channel}`], m.channel).toBeDefined();
    }
  });

  it('links only to the 1930 helpline and cybercrime.gov.in (rule 6)', () => {
    expect(Object.values(HELP_LINKS)).toEqual(['tel:1930', 'https://cybercrime.gov.in']);
  });
});
