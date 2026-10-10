import { describe, expect, it } from 'vitest';
import { buildReviewSheet, readContent, type ReviewInput } from '../gen-review-sheet';

const draft = { status: 'draft', author: 'claude' } as const;
const reviewed = { status: 'reviewed', author: 'claude' } as const;

const input = (over: Partial<ReviewInput> = {}): ReviewInput => ({
  contentVersion: '2026.10.10',
  files: [
    {
      path: 'scenarios/plan_budget.json',
      data: [
        {
          id: 'budget.test.01',
          pillar: 'plan_budget',
          concept: 'test',
          personas: ['sana'],
          difficulty: 1,
          text: 't:budget.test.01.story',
          choices: [
            {
              id: 'a',
              label: 't:budget.test.01.a.label',
              effects: { jars: { needs: -400 } },
              delayed: [{ afterWeeks: 2, effects: { jars: { savings: 50 } }, note: 't:budget.test.01.a.later' }],
              lesson: 't:budget.test.01.a.lesson',
              rating: 'best',
            },
          ],
          meta: draft,
        },
        { id: 'budget.done.01', text: 't:budget.done.01.story', choices: [], meta: reviewed },
      ],
    },
    {
      path: 'quizzes/baseline.json',
      data: [
        {
          id: 'quiz.test.baseline',
          quiz: 'baseline',
          pillar: 'stay_safe',
          concept: 'otp',
          text: 't:quiz.test.q',
          options: ['t:quiz.test.o1', 't:quiz.test.o2'],
          answer: 1,
          explanation: 't:quiz.test.why',
          meta: draft,
        },
      ],
    },
  ],
  i18n: {
    en: {
      'budget.test.01.story': 'Pay | day is here.',
      'budget.test.01.a.label': 'Buy the pass',
      'budget.test.01.a.later': 'Interest landed.',
      'budget.test.01.a.lesson': 'Plan ahead.',
      'quiz.test.q': 'Share an OTP?',
      'quiz.test.o1': 'Yes',
      'quiz.test.o2': 'Never',
      'quiz.test.why': 'Banks never ask.',
    },
    hi: { 'budget.test.01.story': 'तनख़्वाह का दिन।' },
  },
  ...over,
});

describe('buildReviewSheet', () => {
  const sheet = buildReviewSheet(input());

  it('lists only draft items, with counts', () => {
    expect(sheet).toContain('**2 draft** and 1 reviewed out of 3 items');
    expect(sheet).toContain('### budget.test.01');
    expect(sheet).toContain('### quiz.test.baseline');
    expect(sheet).not.toContain('### budget.done.01');
  });

  it('shows en and hi side by side, escapes pipes and flags missing Hindi', () => {
    expect(sheet).toContain('| `budget.test.01.story` | Pay \\| day is here. | तनख़्वाह का दिन। |');
    expect(sheet).toContain('| `budget.test.01.a.label` | Buy the pass | **MISSING** |');
  });

  it('shows the facts a reviewer needs', () => {
    expect(sheet).toContain('- Choice `a` _(rated best)_: needs -₹400; after 2 wk: savings +₹50');
    expect(sheet).toContain('- Correct answer: option 2 (`t:quiz.test.o2`)');
    expect(sheet).toContain('- [ ] Reviewed by: ________ (author: claude)');
  });

  it('is deterministic and says when everything is reviewed', () => {
    expect(buildReviewSheet(input())).toBe(sheet);
    const allDone = buildReviewSheet(
      input({ files: [{ path: 'personas.json', data: [{ id: 'sana', meta: reviewed }] }] }),
    );
    expect(allDone).toContain('Every item is reviewed');
    expect(allDone).not.toContain('### ');
  });
});

describe('the real content', () => {
  it('lists every draft item in the content pack', () => {
    const real = readContent();
    const sheet = buildReviewSheet(real);
    const drafts = real.files.flatMap((f) =>
      Array.isArray(f.data)
        ? f.data
            .filter((i: { meta?: { status?: string } }) => i.meta?.status === 'draft')
            .map((i: { id: string }) => i.id)
        : [],
    );
    expect(drafts.length).toBeGreaterThan(0);
    for (const id of drafts) expect(sheet).toContain(`### ${id}\n`);
    expect(sheet).not.toContain('**MISSING**');
  });
});
