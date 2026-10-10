// The classroom's copy of the baseline / end-line questions and strings must match
// packages/content (BE-1's source of truth); this fails the moment either side is edited alone.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ASSESSMENT_BANK, STRINGS } from './content';
import { answer, isFinished, next, result, startQuiz, toSubmittedEvent } from './quiz';
import type { QuizSession } from './quiz';
import { PILLARS } from './types';
import type { QuizKind, QuizQuestion } from './types';

const fromRepo = <T>(path: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../../${path}`, import.meta.url)), 'utf8')) as T;

const source = [...fromRepo<QuizQuestion[]>('packages/content/quizzes/baseline.json'), ...fromRepo<QuizQuestion[]>('packages/content/quizzes/endline.json')];
const keysOf = (q: QuizQuestion) => [q.text, ...q.options, q.explanation].map((k) => k.slice(2));
const usedKeys = source.flatMap(keysOf);

describe('assessment content stays in step with packages/content', () => {
  it('has the same questions as quizzes/baseline.json and quizzes/endline.json', () => {
    expect(ASSESSMENT_BANK).toEqual(source);
  });

  it.each(['en', 'hi'] as const)('has the same %s strings for every key those questions use', (lang) => {
    const upstream = fromRepo<Record<string, string>>(`packages/content/i18n/${lang}.json`);
    for (const k of usedKeys) {
      expect(STRINGS[lang]![k], `${lang} ${k}`).toBe(upstream[k]);
    }
  });

  it.each(['en', 'hi'] as const)('carries no stray %s quiz strings beyond the questions it holds', (lang) => {
    const own = Object.keys(STRINGS[lang]!).filter((k) => !k.startsWith('classroom.') && !k.startsWith('quiz.classroom.'));
    expect(own.sort()).toEqual([...usedKeys].sort());
  });
});

describe('assessment quizzes', () => {
  const play = (kind: 'baseline' | 'endline', pick: (s: QuizSession) => number): QuizSession => {
    let s = startQuiz(ASSESSMENT_BANK, { kind, seed: 7, quizId: kind, feedback: 'end' });
    while (!isFinished(s)) s = next(answer(s, pick(s)).session);
    return s;
  };

  it.each(['baseline', 'endline'] as const)('%s uses all 6 of its questions, across all four pillars, and only its own', (kind) => {
    const s = startQuiz(ASSESSMENT_BANK, { kind, seed: 1, quizId: kind, feedback: 'end' });
    expect(s.questions).toHaveLength(6);
    expect(new Set(s.questions.map((q) => q.id)).size).toBe(6);
    expect(new Set(s.questions.map((q) => q.pillar))).toEqual(new Set(PILLARS));
    expect(s.questions.every((q) => q.quiz === (kind as QuizKind))).toBe(true);
    expect(s.feedback).toBe('end');
  });

  it('reveals nothing while playing', () => {
    const s = startQuiz(ASSESSMENT_BANK, { kind: 'baseline', seed: 1, quizId: 'baseline', feedback: 'end' });
    const { feedback } = answer(s, s.questions[0]!.answer);
    expect(feedback.correct).toBe(true);
    expect(feedback.correctChoice).toBeNull();
    expect(feedback.explanation).toBeNull();
  });

  it.each(['baseline', 'endline'] as const)('%s result is a quiz_submitted the server accepts', (kind) => {
    const r = result(play(kind, (s) => s.questions[s.index]!.answer));
    expect(r).toMatchObject({ kind, quizId: kind, score: 100, correct: 6, total: 6 });
    const ev = toSubmittedEvent(r, { event_id: 'e', anon_id: 'a', class_id: 'c', client_ts: '2026-10-11T00:00:00.000Z', content_version: 'v' });
    const p = ev.payload as { quiz_type: string; quiz_id: string; score: number; answers: { questionId: string; choice: number; correct: boolean }[] };
    // The server drops string payload values that are not ^[A-Za-z0-9_.:-]{1,64}$ (and rejects the event).
    const idLike = /^[A-Za-z0-9_.:-]{1,64}$/;
    expect(p.quiz_type).toBe(kind);
    expect(idLike.test(p.quiz_id)).toBe(true);
    expect(p.answers).toHaveLength(6);
    for (const a of p.answers) {
      expect(idLike.test(a.questionId)).toBe(true);
      expect(typeof a.choice).toBe('number');
      expect(typeof a.correct).toBe('boolean');
    }
    expect(JSON.stringify(p).length).toBeLessThan(4096);
  });

  it('scores a wrong-everywhere run as 0 with a split across all four pillars', () => {
    const r = result(play('baseline', (s) => (s.questions[s.index]!.answer + 1) % s.questions[s.index]!.options.length));
    expect(r.score).toBe(0);
    expect(Object.keys(r.byPillar).sort()).toEqual([...PILLARS].sort());
  });
});
