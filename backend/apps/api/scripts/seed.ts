// npm run seed [-- --reset]
// Loads a demo NGO, class and 24 students with real engine play and quiz attempts,
// so the staff APIs have something to show. Every name says "Demo": this is demo data.
// Deterministic: the same content always produces the same database.
import { eq, inArray } from 'drizzle-orm';
import { PERSONAS, type Action, type GameState, type Language } from '@paisa/contracts';
import { assembleQuiz, hashSeed, newGame, nextFloat, scoreQuiz, seedRng, step, type RngState } from '@paisa/engine';
import { createDb, migrateDb, schema } from '@paisa/db';
import { loadConfig } from '../src/config';
import { loadContentStore } from '../src/content-store';
import { insertEvents, serverEvents } from '../src/event-store';

export const DEMO = {
  orgName: 'Demo NGO (demo data)',
  classCode: 'HYD234',
  facilitator: 'demo.facilitator@example.org',
  admin: 'demo.admin@example.org',
  vanguard: 'demo.vanguard@example.org',
};

const NICKNAMES = [
  'Chai Champ', 'Star Saver', 'Biryani Boss', 'Metro Rider', 'Kite Flyer', 'Book Worm', 'Cricket Fan', 'Lucky Seven',
  'Moon Light', 'Sunny Side', 'Quick Fox', 'Silver Coin', 'Golden Jar', 'Smart Owl', 'Brave Tiger', 'Calm River',
  'Happy Mango', 'Bright Spark', 'Rain Drop', 'Lotus Leaf', 'Pearl City', 'Tiny Elephant', 'Paper Boat', 'Green Parrot',
];

const config = loadConfig();
if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required. Start Postgres with `npm run db:up`.');
const reset = process.argv.includes('--reset');

await migrateDb(config.DATABASE_URL);
const { db, close } = createDb(config.DATABASE_URL);
const content = loadContentStore(config.CONTENT_DIR, config.PACK_REGION, config.PACK_VERSION);
const game = content.game;
let rng: RngState = seedRng(2026);
const rand = () => {
  const [f, next] = nextFloat(rng);
  rng = next;
  return f;
};

try {
  const [existingOrg] = await db.select().from(schema.organisations).where(eq(schema.organisations.name, DEMO.orgName));
  if (existingOrg && !reset) {
    console.log('Demo data already loaded. Run `npm run seed -- --reset` to load it again.');
    process.exit(0);
  }
  if (existingOrg) await wipeDemo(existingOrg.id);

  const now = new Date();
  const days = (n: number) => new Date(now.getTime() - n * 24 * 3600 * 1000);

  const [org] = await db.insert(schema.organisations).values({ name: DEMO.orgName, city: 'Hyderabad' }).returning();
  const [centre] = await db.insert(schema.centres).values({ orgId: org!.id, name: 'Demo Junior College', type: 'school' }).returning();
  const [facilitator] = await db
    .insert(schema.staffUsers)
    .values({ orgId: org!.id, name: 'Demo Facilitator', email: DEMO.facilitator, role: 'facilitator' })
    .returning();
  await db.insert(schema.staffUsers).values([
    { orgId: org!.id, name: 'Demo NGO Admin', email: DEMO.admin, role: 'ngo_admin' },
    { orgId: null, name: 'Demo Vanguard Reviewer', email: DEMO.vanguard, role: 'vanguard' },
  ]).onConflictDoNothing();
  const [cls] = await db
    .insert(schema.classes)
    .values({
      centreId: centre!.id,
      name: 'Class 11 A (demo)',
      classCode: DEMO.classCode,
      defaultLanguage: 'hi',
      facilitatorId: facilitator!.id,
      programmeEndsAt: new Date(now.getTime() + 120 * 24 * 3600 * 1000),
    })
    .returning();

  const baseline = assembleQuiz(game, { kind: 'baseline' });
  const endline = assembleQuiz(game, { kind: 'endline' });
  const languages: Language[] = ['hi', 'en'];

  for (const [i, nickname] of NICKNAMES.entries()) {
    const lastActive = i % 6 === 5 ? days(9 + i) : days(rand() * 5);
    const [profile] = await db
      .insert(schema.studentProfiles)
      .values({
        classId: cls!.id,
        nickname,
        language: languages[i % 2]!,
        maturityLevel: i % 3 === 0 ? 2 : 1,
        lastActiveAt: lastActive,
        createdAt: days(30),
      })
      .returning();
    const p = { anonId: profile!.anonId, classId: cls!.id };

    // A pre-test for everyone; skill grows with how much they played.
    const skill = 0.35 + rand() * 0.25;
    await submitQuiz(p, 'baseline', baseline, skill, days(28));

    // Play some weeks with a mix of careful and risky picks.
    const personaId = PERSONAS[i % PERSONAS.length]!;
    const seed = hashSeed(p.anonId, personaId, '0');
    let r = newGame({ personaId, level: profile!.maturityLevel, seed }, game);
    let state: GameState = r.state;
    let seq = 0;
    const events = [...serverEvents(r.events, p, days(27), seq)];
    seq += r.events.length;
    const targetWeeks = 3 + Math.floor(rand() * 10);
    const care = 0.4 + rand() * 0.5;
    let weeks = 0;
    while (state.phase !== 'done' && weeks < targetWeeks) {
      let action: Action;
      if (state.phase === 'card') {
        const card = [...game.scenarios, ...game.events].find((c) => c.id === state.card!.id)!;
        const best = card.choices.find((c) => c.rating === 'best');
        const pick = rand() < care && best ? best : card.choices[Math.floor(rand() * card.choices.length)]!;
        action = { type: 'choose', choiceId: pick.id };
      } else if (state.phase === 'consequence' && state.lastOutcome && rand() < 0.1 && state.rewindTokens > 0) {
        action = { type: 'rewind' };
      } else {
        if (state.phase === 'consequence' && state.decided) weeks += 1;
        action = { type: 'advance', reflection: 0 };
      }
      r = step(state, action, game);
      state = r.state;
      const at = new Date(days(27).getTime() + (weeks * 2 + seq) * 3600 * 1000);
      events.push(...serverEvents(r.events, p, at, seq));
      seq += r.events.length;
    }
    // Pillars touched at least four times count as a finished module for the heatmap demo.
    const counts = new Map<string, number>();
    for (const d of state.decisions) counts.set(d.pillar, (counts.get(d.pillar) ?? 0) + 1);
    for (const [pillar, n] of counts) {
      if (n >= 4) events.push(...serverEvents([{ type: 'module_complete', payload: { pillar, level: 1 } }], p, days(2), seq++));
    }
    await db.insert(schema.gameSaves).values({
      profileId: p.anonId,
      personaId,
      packVersion: content.version,
      state,
      month: state.month,
      week: state.week,
      score: state.scores.at(-1) ?? null,
      seed,
    });
    await insertEvents(db, events);

    // Two thirds have finished the end-line quiz.
    if (i % 3 !== 2) await submitQuiz(p, 'endline', endline, Math.min(0.95, skill + 0.1 + care * 0.3), days(1));
  }

  console.log(`Demo data loaded (labelled "demo").
  Class code:   ${DEMO.classCode}
  Facilitator:  ${DEMO.facilitator}
  NGO admin:    ${DEMO.admin}
  Vanguard:     ${DEMO.vanguard}
Sign in with POST /v1/auth/otp/request (set OTP_DEV_ECHO=true locally to get the code back).`);
} finally {
  await close();
}

async function submitQuiz(
  p: { anonId: string; classId: string },
  kind: 'baseline' | 'endline',
  questions: ReturnType<typeof assembleQuiz>,
  skill: number,
  at: Date,
) {
  const answers = Object.fromEntries(
    questions.map((q) => [q.id, rand() < skill ? q.answer : (q.answer + 1) % q.options.length]),
  );
  const result = scoreQuiz(questions, answers);
  await db.insert(schema.quizAttempts).values({
    profileId: p.anonId,
    classId: p.classId,
    kind,
    questionIds: questions.map((q) => q.id),
    answers,
    score: result.score,
    byPillar: result.byPillar,
    startedAt: at,
    submittedAt: at,
  });
}

async function wipeDemo(orgId: string) {
  const centres = await db.select({ id: schema.centres.id }).from(schema.centres).where(eq(schema.centres.orgId, orgId));
  const centreIds = centres.map((c) => c.id);
  const classes = centreIds.length
    ? await db.select({ id: schema.classes.id }).from(schema.classes).where(inArray(schema.classes.centreId, centreIds))
    : [];
  const classIds = classes.map((c) => c.id);
  if (classIds.length) {
    // Deleting profiles cascades to their saves, events, quizzes and rewards.
    await db.delete(schema.studentProfiles).where(inArray(schema.studentProfiles.classId, classIds));
    await db.delete(schema.classes).where(inArray(schema.classes.id, classIds));
  }
  if (centreIds.length) await db.delete(schema.centres).where(inArray(schema.centres.id, centreIds));
  await db.delete(schema.staffUsers).where(inArray(schema.staffUsers.email, [DEMO.facilitator, DEMO.admin, DEMO.vanguard]));
  await db.delete(schema.organisations).where(eq(schema.organisations.id, orgId));
}
