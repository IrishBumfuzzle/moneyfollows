import { describe, expect, it } from 'vitest';
import { assessmentKind, nextAssessment, recordAssessment, resultNote, useAssessments } from './assessments';
import type { Assessments } from './assessments';
import { STRINGS } from './content';

const at = '2026-10-11T02:00:00.000Z';

describe('nextAssessment', () => {
  it('offers the start-of-term check first, whether or not the end-of-term one is open', () => {
    expect(nextAssessment({}, false)).toBe('baseline');
    expect(nextAssessment({}, true)).toBe('baseline');
  });

  it('then waits for the teacher to open the end-of-term check', () => {
    const done: Assessments = { baseline: { score: 50, at } };
    expect(nextAssessment(done, false)).toBeNull();
    expect(nextAssessment(done, true)).toBe('endline');
  });

  it('offers nothing once both are done', () => {
    const done: Assessments = { baseline: { score: 50, at }, endline: { score: 83, at } };
    expect(nextAssessment(done, true)).toBeNull();
    expect(nextAssessment(done, false)).toBeNull();
  });
});

describe('recordAssessment', () => {
  it('adds a check without touching its input', () => {
    const before: Assessments = Object.freeze({});
    const after = recordAssessment(before, 'baseline', 67, at);
    expect(after).toEqual({ baseline: { score: 67, at } });
    expect(before).toEqual({});
  });

  it('keeps the first score, like the server', () => {
    const first = recordAssessment({}, 'baseline', 67, at);
    expect(recordAssessment(first, 'baseline', 100, '2026-10-12T00:00:00.000Z')).toBe(first);
  });

  it('keeps the two checks apart', () => {
    const both = recordAssessment(recordAssessment({}, 'baseline', 33, at), 'endline', 83, at);
    expect(both).toEqual({ baseline: { score: 33, at }, endline: { score: 83, at } });
  });
});

describe('assessmentKind', () => {
  it('is null for the practice quiz', () => {
    expect(assessmentKind('baseline')).toBe('baseline');
    expect(assessmentKind('endline')).toBe('endline');
    expect(assessmentKind('classroom')).toBeNull();
  });
});

describe('resultNote', () => {
  it('compares the end-of-term score to the start, kindly in every case', () => {
    expect(resultNote('baseline', 17).key).toBe('classroom.assess.note.baseline');
    expect(resultNote('endline', 83, 33)).toEqual({ key: 'classroom.assess.note.endline.up', vars: { before: 33 } });
    expect(resultNote('endline', 50, 50).key).toBe('classroom.assess.note.endline.same');
    expect(resultNote('endline', 33, 83).key).toBe('classroom.assess.note.endline.down');
    expect(resultNote('endline', 33).key).toBe('classroom.assess.note.endline.none');
  });

  it('only ever points at strings that exist in en and hi', () => {
    const notes = [resultNote('baseline', 0), resultNote('endline', 1, 0), resultNote('endline', 0, 0), resultNote('endline', 0, 1), resultNote('endline', 0)];
    for (const { key } of notes) {
      expect(STRINGS.en![key], `en ${key}`).toBeTruthy();
      expect(STRINGS.hi![key], `hi ${key}`).toBeTruthy();
    }
  });
});

describe('useAssessments store', () => {
  it('records a check once and forgets on reset', async () => {
    await useAssessments.persist.rehydrate(); // no IndexedDB in node: reads as empty
    expect(useAssessments.persist.hasHydrated()).toBe(true);
    useAssessments.getState().reset();

    useAssessments.getState().record('baseline', 67, at);
    useAssessments.getState().record('baseline', 100, '2026-10-12T00:00:00.000Z');
    expect(useAssessments.getState().done).toEqual({ baseline: { score: 67, at } });

    useAssessments.getState().record('endline', 83);
    const { endline } = useAssessments.getState().done;
    expect(endline?.score).toBe(83);
    expect(Number.isNaN(Date.parse(endline!.at))).toBe(false);

    useAssessments.getState().reset();
    expect(useAssessments.getState().done).toEqual({});
  });
});
