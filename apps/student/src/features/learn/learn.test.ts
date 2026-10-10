import { describe, expect, it } from 'vitest';
import { content } from '@paisa/content';
import { EVENTS } from '../events/data';
import { GUIDES, STRINGS, conceptById } from './content';
import { EVENT_CONCEPTS, eventLesson, guideLesson, quizLessons } from './record';
import { addNote, conceptState, emptyLearning, finishGuide, meet, understand, type LearningState } from './store';
import en from './content/en.json';
import hi from './content/hi.json';

const T1 = '2026-10-11T05:00:00.000Z';
const T2 = '2026-10-11T06:00:00.000Z';
const frozen = (s: LearningState) => JSON.parse(JSON.stringify(s)) as LearningState;

describe('learning rules', () => {
  it('meets and understands concepts once, keeping the first time, without mutating', () => {
    const s0 = emptyLearning();
    const s1 = meet(s0, ['kyc', null], T1);
    expect(s0).toEqual(emptyLearning());
    expect(s1.met).toEqual({ kyc: T1 });
    expect(meet(s1, ['kyc'], T2)).toBe(s1); // nothing new: same object
    const s2 = understand(s1, ['kyc', 'inflation'], T2);
    expect(s2.met).toEqual({ kyc: T1, inflation: T2 });
    expect(s2.understood).toEqual({ kyc: T2, inflation: T2 });
    expect([conceptState(s2, 'kyc'), conceptState(s1, 'kyc'), conceptState(s0, 'kyc')]).toEqual([
      'understood',
      'met',
      'new',
    ]);
  });

  it('adds each lesson to the Notebook once, newest first', () => {
    const note = (key: string) => ({ key, source: 'event' as const, concept: null, pillar: null, at: T1 });
    let s = addNote(emptyLearning(), note('a'));
    s = addNote(s, note('b'));
    expect(addNote(s, note('a'))).toBe(s);
    expect(s.notes.map((n) => n.key)).toEqual(['b', 'a']);
  });

  it('records a guide once: the first answer counts, and only a right one marks it understood', () => {
    const guide = { id: 'guide.x', concepts: ['kyc', 'savings_account'] };
    const wrong = finishGuide(emptyLearning(), guide, false, T1);
    expect(wrong.guides['guide.x']).toEqual({ correct: false, at: T1 });
    expect(wrong.understood).toEqual({});
    expect(Object.keys(wrong.met)).toEqual(['kyc', 'savings_account']);
    expect(finishGuide(wrong, guide, true, T2)).toBe(wrong);
    expect(finishGuide(emptyLearning(), guide, true, T1).understood).toEqual({ kyc: T1, savings_account: T1 });
  });

  it('survives a JSON round trip (it is saved to IndexedDB)', () => {
    const s = understand(meet(emptyLearning(), ['kyc'], T1), ['inflation'], T2);
    expect(frozen(s)).toEqual(s);
  });
});

describe('feeding Learn from the game', () => {
  it('maps every app event to a concept in the catalogue', () => {
    for (const ev of EVENTS) expect(conceptById.has(EVENT_CONCEPTS[ev.id] ?? ''), ev.id).toBe(true);
  });

  it('an answered event meets its concept and notes the chosen lesson', () => {
    const s = eventLesson(emptyLearning(), 'phone.otp.01', 'refuse', T1);
    expect(s.met).toEqual({ never_share_otp: T1 });
    expect(s.notes).toEqual([
      { key: 'events.otp.lesson', source: 'event', concept: 'never_share_otp', pillar: 'stay_safe', at: T1 },
    ]);
    expect(eventLesson(s, 'no.such.event', 'x', T2)).toBe(s);
  });

  const questionOf = (kind: 'baseline' | 'endline' | 'classroom') => {
    const q = content.quizzes.find((x) => x.quiz === kind);
    if (!q) throw new Error(`no ${kind} question in the content pack`);
    return q;
  };
  const answer = (q: ReturnType<typeof questionOf>, correct: boolean) => ({
    questionId: q.id,
    pillar: q.pillar,
    choice: 0,
    correct,
  });

  it('a practice round marks right answers understood, wrong ones met, and notes every explanation', () => {
    const q = questionOf('classroom');
    const right = quizLessons(emptyLearning(), { kind: 'classroom', answers: [answer(q, true)] }, T1);
    expect(right.understood[q.concept]).toBe(T1);
    expect(right.notes).toEqual([
      { key: q.explanation.slice(2), source: 'classroom', concept: q.concept, pillar: q.pillar, at: T1 },
    ]);
    const wrong = quizLessons(emptyLearning(), { kind: 'classroom', answers: [answer(q, false)] }, T1);
    expect(wrong.met[q.concept]).toBe(T1);
    expect(wrong.understood).toEqual({});
    expect(wrong.notes).toHaveLength(1);
  });

  it('start- and end-of-term checks count for progress but never add notes (no answer sheet)', () => {
    for (const kind of ['baseline', 'endline'] as const) {
      const q = questionOf(kind);
      const s = quizLessons(emptyLearning(), { kind, answers: [answer(q, true)] }, T1);
      expect(s.understood[q.concept], kind).toBe(T1);
      expect(s.notes, kind).toEqual([]);
    }
  });

  it('ignores answers to questions it does not know', () => {
    const s = emptyLearning();
    expect(
      quizLessons(
        s,
        { kind: 'classroom', answers: [{ questionId: 'nope', pillar: 'stay_safe', choice: 0, correct: true }] },
        T1,
      ),
    ).toBe(s);
  });

  it('a finished guide notes its explanation under its pillar', () => {
    const g = GUIDES[0]!;
    const s = guideLesson(emptyLearning(), g, true, T1);
    expect(s.guides[g.id]?.correct).toBe(true);
    expect(s.notes[0]).toMatchObject({ source: 'guide', pillar: g.pillar, concept: g.concepts[0] });
    expect(STRINGS.hi?.[s.notes[0]!.key]).toBeTruthy();
  });
});

describe('Learn strings', () => {
  it('has the same UI keys in en and hi, and a name for every pillar', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
    for (const p of ['plan_budget', 'save_manage', 'understand_investing', 'stay_safe'])
      expect(en[`learn.pillar.${p}` as keyof typeof en]).toBeTruthy();
  });
});
