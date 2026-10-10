// A made-up school for sample mode (?demo=1): five classes, about 240 students. Pure and
// deterministic (seeded, no Math.random), so it runs under vitest and looks the same every visit.
// Dates are relative to `now`, so "inactive 7+ days" flags still make sense on demo day.
import type { ClassRow, MatchedLearningGainRow, StudentRow } from '@paisa/api-client';
import {
  GAME_MONTHS,
  PILLARS,
  WEEKS_PER_MONTH,
  type ClassProgressRow,
  type ClassroomQuizSummaryRow,
  type Lang,
  type Pillar,
} from '@paisa/shared';

/** The signed-in email shown in sample mode's password shortcut. Not a real inbox. */
export const SAMPLE_FACILITATOR_ID = 'sample-facilitator';

const DAY = 86_400_000;
const GAME_WEEKS = GAME_MONTHS * WEEKS_PER_MONTH;

/** Start and end checks ask this many questions per skill area (packages/content/quizzes/baseline.json). */
export const CHECK_QUESTIONS: Record<Pillar, number> = {
  plan_budget: 2,
  save_manage: 1,
  understand_investing: 1,
  stay_safe: 2,
};

/** The classroom practice questions (packages/content/quizzes/classroom.json); a test keeps them in step. */
export const CLASSROOM_QUESTIONS: readonly { id: string; pillar: Pillar; answer: number; options: number }[] = [
  { id: 'quiz.classroom.budget.needs_first', pillar: 'plan_budget', answer: 0, options: 3 },
  { id: 'quiz.classroom.budget.opportunity_cost', pillar: 'plan_budget', answer: 1, options: 3 },
  { id: 'quiz.classroom.save.emergency_fund', pillar: 'save_manage', answer: 1, options: 3 },
  { id: 'quiz.classroom.save.track_spending', pillar: 'save_manage', answer: 0, options: 3 },
  { id: 'quiz.classroom.invest.risk_return', pillar: 'understand_investing', answer: 0, options: 3 },
  { id: 'quiz.classroom.invest.diversify', pillar: 'understand_investing', answer: 0, options: 3 },
  { id: 'quiz.classroom.safe.otp', pillar: 'stay_safe', answer: 1, options: 3 },
  { id: 'quiz.classroom.safe.collect_request', pillar: 'stay_safe', answer: 0, options: 3 },
];

/** How hard each area is in the sample: investing is the one classes find hardest. */
const DIFFICULTY: Record<Pillar, number> = {
  plan_budget: 0.05,
  save_manage: 0.1,
  understand_investing: -0.15,
  stay_safe: -0.05,
};

interface ClassPlan {
  name: string;
  size: number;
  lang: Lang;
  weeksAgo: number;
  join_open: boolean;
  endline_open: boolean;
  /** Chance an active student with a start check has taken the end check (0: never opened). */
  endlineShare: number;
}

const PLANS: readonly ClassPlan[] = [
  { name: 'Class 12 A', size: 55, lang: 'hi', weeksAgo: 11, join_open: false, endline_open: true, endlineShare: 0.9 },
  { name: 'Class 12 B', size: 50, lang: 'hi', weeksAgo: 10, join_open: true, endline_open: true, endlineShare: 0.7 },
  { name: 'Class 11 A', size: 52, lang: 'en', weeksAgo: 6, join_open: true, endline_open: false, endlineShare: 0 },
  { name: 'Class 11 B', size: 48, lang: 'hi', weeksAgo: 5, join_open: true, endline_open: false, endlineShare: 0 },
  { name: 'Saturday batch', size: 34, lang: 'hi', weeksAgo: 3, join_open: true, endline_open: false, endlineShare: 0 },
];

const ADJECTIVES = [
  'Brave',
  'Bright',
  'Calm',
  'Clever',
  'Happy',
  'Lucky',
  'Quick',
  'Smart',
  'Sunny',
  'Swift',
  'Golden',
  'Silver',
  'Green',
  'Blue',
  'Tiny',
  'Mighty',
  'Gentle',
  'Jolly',
  'Kind',
  'Bold',
  'Wise',
  'Cool',
  'Busy',
  'Shiny',
];
const NOUNS = [
  'Tiger',
  'Parrot',
  'Mango',
  'Kite',
  'River',
  'Lotus',
  'Star',
  'Owl',
  'Fox',
  'Coin',
  'Boat',
  'Spark',
  'Peacock',
  'Jar',
  'Moon',
  'Rocket',
  'Chai',
  'Cricket',
  'Pearl',
  'Leaf',
  'Comet',
  'Bee',
  'Cloud',
  'Lion',
];

/** Class codes and rejoin codes use the database's alphabet: no 0/O or 1/I/L. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type Rng = () => number;

/** mulberry32: a tiny seeded generator in [0, 1). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const makeCode = (rng: Rng, length: number) =>
  Array.from({ length }, () => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join('');

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Percent right per area for one check, from a skill level (0–1). */
function takeCheck(rng: Rng, skill: number): Record<Pillar, number> {
  const out = {} as Record<Pillar, number>;
  for (const p of PILLARS) {
    const n = CHECK_QUESTIONS[p];
    let right = 0;
    for (let i = 0; i < n; i++) if (rng() < clamp01(skill + DIFFICULTY[p])) right += 1;
    out[p] = Math.round((right / n) * 100);
  }
  return out;
}

/** Overall score across all check questions, as the backend computes it (right answers / questions). */
function overall(scores: Record<Pillar, number>): number {
  let right = 0;
  let total = 0;
  for (const p of PILLARS) {
    right += (scores[p] / 100) * CHECK_QUESTIONS[p];
    total += CHECK_QUESTIONS[p];
  }
  return Math.round((right / total) * 100);
}

export interface SampleStudent {
  row: ClassProgressRow;
  rejoin_code: string;
  baseline: Record<Pillar, number> | null;
  endline: Record<Pillar, number> | null;
}

export interface SampleClass {
  cls: ClassRow;
  students: SampleStudent[];
  /** Classroom practice results: one row per question the class has answered. */
  classroom: ClassroomQuizSummaryRow[];
}

function buildStudents(rng: Rng, plan: ClassPlan, classIndex: number, now: number): SampleStudent[] {
  // Unique nicknames inside the class: shuffle every adjective + noun pair and take the first `size`.
  const pairs = ADJECTIVES.flatMap((a) => NOUNS.map((n) => `${a} ${n}`));
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!];
  }
  const classDays = plan.weeksAgo * 7;

  return pairs.slice(0, plan.size).map((nickname, i) => {
    const engagement = rng();
    // About one in six has gone quiet for a week or more: the students a teacher should nudge.
    const quiet = rng() < 0.16;
    const daysAgo = quiet ? between(rng, 7, Math.max(8, classDays)) : between(rng, 0, 6);
    // Weeks a class could have played so far: about one game week per real week.
    const maxWeeks = Math.min(GAME_WEEKS, plan.weeksAgo + 1);
    const weeks = Math.max(1, Math.round(maxWeeks * clamp01(engagement * (quiet ? 0.5 : 1) + 0.15)));
    const decisions = weeks * 2 + Math.floor(rng() * (weeks + 1));

    const pillars = { plan_budget: 0, save_manage: 0, understand_investing: 0, stay_safe: 0 } as Record<Pillar, number>;
    for (let d = 0; d < decisions; d++) pillars[PILLARS[Math.floor(rng() * PILLARS.length)]!] += 1;

    const skill = between(rng, 0.3, 0.65);
    const baseline = rng() < 0.94 ? takeCheck(rng, skill) : null;
    const tookEndline = baseline !== null && !quiet && rng() < plan.endlineShare;
    const endline = tookEndline ? takeCheck(rng, Math.min(0.95, skill + 0.1 + engagement * 0.25)) : null;
    const practised = rng() < 0.3 + engagement * 0.6;

    const row: ClassProgressRow = {
      anon_id: `sample-${classIndex}-${String(i).padStart(3, '0')}`,
      nickname,
      modules_done: PILLARS.filter((p) => pillars[p] >= 3).length,
      last_active: new Date(now - daysAgo * DAY).toISOString(),
      lang: rng() < 0.75 ? plan.lang : plan.lang === 'hi' ? 'en' : 'hi',
      decisions,
      pillars,
      baseline_score: baseline && overall(baseline),
      endline_score: endline && overall(endline),
      weeks_played: weeks,
      // One Paisa Times edition ships with the game so far.
      news_editions: rng() < 0.25 + engagement * 0.6 ? 1 : 0,
      persona: rng() < 0.5 ? 'sana' : 'ravi',
      classroom_best: practised ? 20 * Math.round(clamp01(skill + 0.2 + rng() * 0.3) * 5) : null,
    };
    return { row, rejoin_code: makeCode(rng, 6), baseline, endline };
  });
}

function buildClassroom(rng: Rng, students: readonly SampleStudent[]): ClassroomQuizSummaryRow[] {
  const players = students.filter((s) => s.row.classroom_best !== null).length;
  if (players === 0) return [];
  return CLASSROOM_QUESTIONS.map((q) => {
    const answered = Math.max(1, Math.round(players * between(rng, 0.7, 1)));
    const wrongChoices = Array.from({ length: q.options }, (_, k) => k).filter((k) => k !== q.answer);
    return {
      question_id: q.id,
      pillar: q.pillar,
      students: answered,
      attempts: Math.round(answered * between(rng, 1.2, 2.4)),
      correct_pct: round1(100 * clamp01(0.62 + DIFFICULTY[q.pillar] * 1.6 + between(rng, -0.12, 0.12))),
      top_wrong_choice: wrongChoices[Math.floor(rng() * wrongChoices.length)] ?? null,
    };
  });
}

/** The whole sample school, newest class first (like listClasses). */
export function buildSampleSchool(now: Date, seed = 2026): SampleClass[] {
  const rng = seededRng(seed);
  const t = now.getTime();
  return PLANS.map((plan, i) => {
    const students = buildStudents(rng, plan, i, t);
    const cls: ClassRow = {
      id: `sample-class-${i + 1}`,
      class_code: makeCode(rng, 8),
      default_lang: plan.lang,
      facilitator_id: SAMPLE_FACILITATOR_ID,
      name: plan.name,
      created_at: new Date(t - plan.weeksAgo * 7 * DAY).toISOString(),
      join_open: plan.join_open,
      endline_open: plan.endline_open,
    };
    return { cls, students, classroom: buildClassroom(rng, students) };
  }).sort((a, b) => b.cls.created_at.localeCompare(a.cls.created_at));
}

/** learning_gain: students who took both checks, averaged per area (n matched students). */
export function learningGainOf(students: readonly SampleStudent[]): MatchedLearningGainRow[] {
  const matched = students.filter((s) => s.baseline && s.endline);
  const n = matched.length;
  return PILLARS.map((pillar) => {
    const avg = (pick: (s: SampleStudent) => Record<Pillar, number> | null) =>
      n === 0 ? null : round1(matched.reduce((sum, s) => sum + pick(s)![pillar], 0) / n);
    return {
      pillar,
      baseline_avg: avg((s) => s.baseline),
      endline_avg: avg((s) => s.endline),
      baseline_n: n,
      endline_n: n,
      n,
    };
  });
}

export const studentRowsOf = (students: readonly SampleStudent[]): StudentRow[] =>
  students
    .map((s) => ({ anon_id: s.row.anon_id, nickname: s.row.nickname, rejoin_code: s.rejoin_code }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname));
