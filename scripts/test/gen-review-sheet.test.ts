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

describe('map and Paisa Times kinds', () => {
  const article = {
    id: 'upi_fraud',
    edition: '2026-W41',
    headline: 't:news.2026-W41.upi_fraud.headline',
    body: 't:news.2026-W41.upi_fraud.body',
    terms: ['upi'],
    question: {
      prompt: 't:news.2026-W41.upi_fraud.q',
      options: ['t:news.2026-W41.upi_fraud.o1', 't:news.2026-W41.upi_fraud.o2'],
      correct: 1,
      explanation: 't:news.2026-W41.upi_fraud.why',
    },
    reward: { wage: 60, xp: 12 },
    meta: draft,
  };
  const sheet = buildReviewSheet({
    contentVersion: 'v',
    files: [
      {
        path: 'news/2026-W41.json',
        data: [article, { ...article, id: 'done', meta: { ...reviewed, factsCheckedBy: 'Asha' } }],
      },
      {
        path: 'glossary.json',
        data: [
          {
            id: 'upi',
            word: 't:glossary.upi.word',
            simple: 't:glossary.upi.simple',
            example: 't:glossary.upi.example',
          },
        ],
      },
      {
        path: 'places.json',
        data: [
          {
            id: 'convenience.kirana',
            name: 't:place.convenience.kirana',
            parent: 'convenience',
            position: { x: 10, y: 20 },
          },
        ],
      },
      {
        path: 'scenarios/plan_budget.json',
        data: [
          {
            id: 'budget.x.01',
            location: 'convenience',
            sublocation: 'convenience.phone_shop',
            channel: 'phone',
            speaker: 't:speaker.friend',
            choices: [],
            meta: draft,
          },
        ],
      },
    ],
    i18n: { en: { 'news.2026-W41.upi_fraud.headline': 'The PIN trick' }, hi: {} },
  });

  it('lists draft articles with their reward, answer and a fact-check box', () => {
    expect(sheet).toContain('### upi_fraud');
    expect(sheet).toContain('- Edition 2026-W41 · glossary words: upi · pays ₹60 and 12 XP');
    expect(sheet).toContain('- Correct answer: option 2 (`t:news.2026-W41.upi_fraud.o2`)');
    expect(sheet).toContain('- [ ] Facts checked by: ________');
    expect(sheet).not.toContain('### done');
  });

  it('shows where a card is played and who speaks', () => {
    expect(sheet).toContain('- Place: convenience › convenience.phone_shop · phone chat · speaker `t:speaker.friend`');
  });

  it('lists glossary terms and places as reference sections, outside the draft count', () => {
    expect(sheet).toContain('## `glossary.json` (reference: 1, no status to flip)');
    expect(sheet).toContain('## `places.json` (reference: 1, no status to flip)');
    expect(sheet).toContain('- Map position 10%, 20% · inside convenience');
    expect(sheet).toContain('**2 draft** and 1 reviewed out of 3 items');
  });
});
