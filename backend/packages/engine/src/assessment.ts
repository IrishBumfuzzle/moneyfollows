import { PILLARS, type GameContent, type Pillar, type QuizKind, type QuizQuestion, type QuizResult } from '@paisa/contracts';

const pillarIndex = (p: Pillar): number => PILLARS.indexOf(p);

function order(qs: QuizQuestion[]): QuizQuestion[] {
  return [...qs].sort((a, b) => pillarIndex(a.pillar) - pillarIndex(b.pillar) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** First `n` questions taken round-robin across pillars, so a short quiz still covers each one. */
function balanced(qs: QuizQuestion[], n: number): QuizQuestion[] {
  const lanes = PILLARS.map((p) => order(qs.filter((q) => q.pillar === p))).filter((l) => l.length > 0);
  const picked: QuizQuestion[] = [];
  for (let round = 0; picked.length < n; round++) {
    let any = false;
    for (const lane of lanes) {
      const q = lane[round];
      if (q && picked.length < n) {
        picked.push(q);
        any = true;
      }
    }
    if (!any) break;
  }
  return picked;
}

export const RETENTION_SIZE = 5;

/**
 * Baseline is form A, end-line form B, retention is a short form B, and a
 * module quiz draws on both forms. Order is fixed: pillar order, then id.
 */
export function assembleQuiz(content: GameContent, opts: { kind: QuizKind; pillar?: Pillar }): QuizQuestion[] {
  const inPillar = content.quizQuestions.filter((q) => !opts.pillar || q.pillar === opts.pillar);
  switch (opts.kind) {
    case 'baseline':
      return order(inPillar.filter((q) => q.form === 'A'));
    case 'endline':
      return order(inPillar.filter((q) => q.form === 'B'));
    case 'retention':
      return order(balanced(inPillar.filter((q) => q.form === 'B'), RETENTION_SIZE));
    case 'module':
      return order(inPillar);
  }
}

/** `answers` maps a question id to the chosen option index. A missing answer counts as wrong. */
export function scoreQuiz(questions: QuizQuestion[], answers: Record<string, number>): QuizResult {
  const byPillar: QuizResult['byPillar'] = {};
  const feedback: QuizResult['feedback'] = [];
  let correct = 0;
  for (const q of questions) {
    const ok = answers[q.id] === q.answer;
    if (ok) correct++;
    const lane = byPillar[q.pillar] ?? { correct: 0, total: 0 };
    byPillar[q.pillar] = { correct: lane.correct + (ok ? 1 : 0), total: lane.total + 1 };
    feedback.push({ questionId: q.id, correct: ok, explanation: q.explanation });
  }
  const total = questions.length;
  return { correct, total, score: total === 0 ? 0 : Math.round((100 * correct) / total), byPillar, feedback };
}
