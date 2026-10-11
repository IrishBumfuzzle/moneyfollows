// Builds supabase/seed.sql: a demo facilitator, class HYD234 and 24 students whose
// events come from real engine play, plus baseline and end-line quiz results.
// Deterministic: the same content always gives the same file. Times are relative
// to now() when the SQL runs, so "inactive for 7 days" flags stay meaningful.
import { content as bundled, CONTENT_VERSION } from '@paisa/content';
import { choose, createGame, nextCard, quizFor, scoreQuiz } from '@paisa/engine';
import { CONTINUE, type ContentBundle, type Level, type PersonaId, type QuizType } from '@paisa/shared';

export const DEMO = {
  userId: '00000000-0000-4000-8000-00000000d001',
  email: 'demo.facilitator@example.org',
  password: 'paisa-demo-2026',
  classId: '00000000-0000-4000-8000-00000000c001',
  classCode: 'HYD234',
  className: 'Class 11 A (demo data)',
};

/** Hosts `pnpm seed` may load the demo data into without `--allow-remote-demo`. */
export const LOCAL_DB_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', 'postgres', 'db'];

/**
 * The demo data has a known password and class code, so it is only loaded into a
 * local or CI database unless the caller passes --allow-remote-demo.
 * Returns null if loading is allowed, else the reason it is refused.
 */
export function seedTargetProblem(url: string, argv: readonly string[]): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'SUPABASE_DB_URL is not a valid URL.';
  }
  if (LOCAL_DB_HOSTS.includes(host) || argv.includes('--allow-remote-demo')) return null;
  return (
    `Refusing to load demo data (known password and class code) into ${host}. ` +
    'Use a local database, or pass --allow-remote-demo if you really mean it.'
  );
}

const NICKNAMES = [
  'Chai Champ',
  'Star Saver',
  'Biryani Boss',
  'Metro Rider',
  'Kite Flyer',
  'Book Worm',
  'Cricket Fan',
  'Lucky Seven',
  'Moon Light',
  'Sunny Side',
  'Quick Fox',
  'Silver Coin',
  'Golden Jar',
  'Smart Owl',
  'Brave Tiger',
  'Calm River',
  'Happy Mango',
  'Bright Spark',
  'Rain Drop',
  'Lotus Leaf',
  'Pearl City',
  'Paper Boat',
  'Green Parrot',
  'Tiny Kite',
];

/** mulberry32: a tiny seeded generator so the file is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const ago = (hours: number) => `now() - interval '${Math.round(hours * 60)} minutes'`;
/** Stable demo ids: kind 'a' for students, 'e' for events (both valid hex). */
const uuid = (n: number, kind: 'a' | 'e') => `00000000-0000-4000-8${kind}00-${n.toString(16).padStart(12, '0')}`;

/** Same shape the staff table accepts (lowercase, one @). */
export const STAFF_EMAIL_RE = /^[^@\s]+@[^@\s]+$/;

export interface SeedOptions {
  /**
   * Hosted mode: give the demo class to this existing staff account instead of
   * creating the demo facilitator with its publicly known password. Creates and
   * deletes no auth user; fails if that email has not created its account yet.
   */
  facilitatorEmail?: string;
}

export function buildSeedSql(content: ContentBundle = bundled, options: SeedOptions = {}): string {
  const rand = rng(2026);
  const students: string[] = [];
  const events: string[] = [];
  const attempts: string[] = [];
  let eventN = 0;

  const event = (anon: string, type: string, payload: object, hoursAgo: number) => {
    const id = uuid(++eventN, 'e');
    events.push(
      `(${q(id)}, ${q(anon)}, ${q(DEMO.classId)}, ${q(type)}, ${q(JSON.stringify(payload))}::jsonb, ${ago(hoursAgo)}, ${q(CONTENT_VERSION)})`,
    );
    return id;
  };

  const quiz = (anon: string, type: QuizType, skill: number, hoursAgo: number) => {
    const questions = quizFor(content, type);
    const picks = Object.fromEntries(
      questions.map((qq) => [qq.id, rand() < skill ? qq.answer : (qq.answer + 1) % qq.options.length]),
    );
    const result = scoreQuiz(questions, picks);
    const id = event(
      anon,
      'quiz_submitted',
      { quiz_type: type, answers: result.answers, score: result.score },
      hoursAgo,
    );
    attempts.push(
      `(${q(anon)}, ${q(type)}, ${q(JSON.stringify(result.answers))}::jsonb, ${result.score}, ${ago(hoursAgo)}, ${q(id)})`,
    );
  };

  NICKNAMES.forEach((nickname, i) => {
    const anon = uuid(i + 1, 'a');
    const personaId: PersonaId = i % 2 === 0 ? 'sana' : 'ravi';
    const level: Level = i % 4 === 0 ? 'explorer' : 'starter';
    const lang = i % 3 === 0 ? 'en' : 'hi';
    // Every sixth student has gone quiet for over a week, to show the inactive flag.
    const lastActive = i % 6 === 5 ? 24 * (8 + (i % 4)) : 2 + rand() * 96;
    const start = lastActive + 24 * (5 + rand() * 10);
    students.push(
      `(${q(anon)}, ${q(DEMO.classId)}, ${q(nickname)}, ${q(lang)}, ${q(level)}, ${ago(start + 24)}, ${ago(lastActive)})`,
    );

    const skill = 0.3 + rand() * 0.3;
    quiz(anon, 'baseline', skill, start + 1);
    event(anon, 'onboarding_complete', { level }, start);
    event(anon, 'persona_selected', { personaId, level }, start);

    // Play part of the game with a mix of careful and risky picks.
    const care = 0.35 + rand() * 0.55;
    const weeks = 3 + Math.floor(rand() * 10);
    let state = createGame(personaId, level, 1000 + i, content);
    const perPillar = new Map<string, number>();
    let played = 0;
    while (played < weeks) {
      const card = nextCard(state, content);
      if (card.kind === 'yearEnd') break;
      if (card.kind === 'monthEnd') {
        state = choose(state, content, CONTINUE).state;
        continue;
      }
      const best = card.scenario.choices.find((c) => c.rating === 'best');
      const pick =
        rand() < care && best ? best : card.scenario.choices[Math.floor(rand() * card.scenario.choices.length)]!;
      state = choose(state, content, pick.id).state;
      const at = Math.max(lastActive, start - (start - lastActive) * ((played + 1) / weeks));
      if (card.kind === 'event') {
        event(anon, 'event_triggered', { eventId: card.scenario.id, choiceId: pick.id }, at);
        continue;
      }
      event(
        anon,
        'decision_made',
        {
          scenarioId: card.scenario.id,
          choiceId: pick.id,
          pillar: card.scenario.pillar,
          month: card.month,
          week: card.week,
        },
        at,
      );
      perPillar.set(card.scenario.pillar, (perPillar.get(card.scenario.pillar) ?? 0) + 1);
      played += 1;
    }
    for (const [pillar, n] of perPillar) if (n >= 3) event(anon, 'module_complete', { pillar }, lastActive);
    if (rand() < 0.7)
      event(
        anon,
        'minigame_complete',
        { game: 'scam_or_safe', correct: 6 + Math.floor(rand() * 7), total: 12 },
        lastActive + 1,
      );

    // Two thirds have taken the end-line quiz; skill grows with careful play.
    if (i % 3 !== 2) quiz(anon, 'endline', Math.min(0.95, skill + 0.15 + care * 0.3), lastActive);
  });

  const localHead = `-- Generated by \`pnpm seed\` (scripts/seed-data.ts). Do not edit by hand.
-- DEMO DATA: a demo facilitator, class ${DEMO.classCode} and ${NICKNAMES.length} demo students.
begin;

-- classes.facilitator_id is on delete restrict, so remove the demo user's classes first.
delete from public.classes where id = ${q(DEMO.classId)} or facilitator_id = ${q(DEMO.userId)};
delete from auth.users where id = ${q(DEMO.userId)};
delete from public.staff where email = ${q(DEMO.email)};

-- Demo facilitator. With Supabase Auth's schema (supabase start, a hosted project) it can sign
-- in with the password below (local only); with the bare auth.users of a test database (the
-- auth stub, or the supabase/postgres image before Auth migrates it) only the id and email exist.
do $$
begin
  if to_regclass('auth.identities') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at') then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', ${q(DEMO.userId)}, 'authenticated', 'authenticated', ${q(DEMO.email)},
            extensions.crypt(${q(DEMO.password)}, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', '{"name":"Demo Facilitator"}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), ${q(DEMO.userId)}, ${q(DEMO.userId)},
            jsonb_build_object('sub', ${q(DEMO.userId)}, 'email', ${q(DEMO.email)}, 'email_verified', true),
            'email', now(), now(), now());
  else
    insert into auth.users (id, email) values (${q(DEMO.userId)}, ${q(DEMO.email)});
  end if;
end
$$;

-- The demo facilitator is on the staff allowlist, so RLS lets them see the class.
insert into public.staff (email) values (${q(DEMO.email)});

insert into public.classes (id, class_code, default_lang, facilitator_id, name)
values (${q(DEMO.classId)}, ${q(DEMO.classCode)}, 'hi', ${q(DEMO.userId)}, ${q(DEMO.className)});`;

  const email = options.facilitatorEmail?.toLowerCase();
  if (email !== undefined && !STAFF_EMAIL_RE.test(email)) throw new Error(`Not an email address: ${email}`);
  const facilitator = email && `(select u.id from auth.users u where lower(u.email) = ${q(email)})`;
  const hostedHead =
    email &&
    `-- Generated by \`pnpm seed -- --hosted-demo\` (scripts/seed-data.ts).
-- DEMO DATA: class ${DEMO.classCode} and ${NICKNAMES.length} demo students, owned by the
-- staff account ${email}. No auth user is created, and no password.
begin;

do $$
begin
  if not exists (select 1 from auth.users u where lower(u.email) = ${q(email)}) then
    raise exception '${email.replace(/'/g, "''")} has no account yet: add it with pnpm staff:invite, create the account on the dashboard, then re-run.';
  end if;
end
$$;

-- Re-running replaces the demo class and everything in it (students cascade).
delete from public.classes where id = ${q(DEMO.classId)};
insert into public.staff (email) values (${q(email)}) on conflict (email) do nothing;

insert into public.classes (id, class_code, default_lang, facilitator_id, name)
values (${q(DEMO.classId)}, ${q(DEMO.classCode)}, 'hi', ${facilitator}, ${q(DEMO.className)});`;

  return `${hostedHead || localHead}

insert into public.students (anon_id, class_id, nickname, lang, level, created_at, last_active) values
${students.join(',\n')};

insert into public.events (event_id, anon_id, class_id, type, payload, client_ts, content_version) values
${events.join(',\n')};

insert into public.quiz_attempts (anon_id, quiz_type, answers, score, created_at, event_id) values
${attempts.join(',\n')};

commit;
`;
}
