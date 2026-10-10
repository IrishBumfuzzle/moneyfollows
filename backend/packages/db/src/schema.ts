// Drizzle table definitions. Track B owns this file and every migration generated from it.
// Field lists follow "Data model" in docs/Paisa Path — Backend Design & Parallel Plan.md.
// No student column may hold a real name, phone number, birth date, address or bank detail.

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { GameState, Language, PersonaId, QuizKind, StaffRole } from '@paisa/contracts';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const id = () => uuid('id').primaryKey().defaultRandom();

export const organisations = pgTable('organisations', {
  id: id(),
  name: text('name').notNull(),
  city: text('city').notNull(),
  createdAt: createdAt(),
});

export const centres = pgTable(
  'centres',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organisations.id),
    name: text('name').notNull(),
    type: text('type').$type<'school' | 'community_centre'>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('centres_org_idx').on(t.orgId)],
);

/** Adults only. Email is the one personal identifier we hold, and only for staff. */
export const staffUsers = pgTable('staff_users', {
  id: id(),
  orgId: uuid('org_id').references(() => organisations.id),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').$type<StaffRole>().notNull(),
  createdAt: createdAt(),
});

/** One live code per email. Only hashes are stored. */
export const otpCodes = pgTable('otp_codes', {
  emailHash: text('email_hash').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: smallint('attempts').notNull().default(0),
  createdAt: createdAt(),
});

export const classes = pgTable(
  'classes',
  {
    id: id(),
    centreId: uuid('centre_id')
      .notNull()
      .references(() => centres.id),
    name: text('name').notNull(),
    classCode: text('class_code').notNull().unique(),
    defaultLanguage: text('default_language').$type<Language>().notNull(),
    facilitatorId: uuid('facilitator_id')
      .notNull()
      .references(() => staffUsers.id),
    programmeEndsAt: timestamp('programme_ends_at', { withTimezone: true }),
    /** Per-class feature flags. */
    flags: jsonb('flags').$type<Record<string, boolean>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('classes_facilitator_idx').on(t.facilitatorId), index('classes_centre_idx').on(t.centreId)],
);

export const studentProfiles = pgTable(
  'student_profiles',
  {
    anonId: uuid('anon_id').primaryKey().defaultRandom(),
    /** Set to null by the retention job at programme end. */
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    nickname: text('nickname').notNull(),
    avatar: text('avatar'),
    gradeBand: text('grade_band'),
    language: text('language').$type<Language>().notNull(),
    maturityLevel: smallint('maturity_level').notNull().default(1),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('student_profiles_class_nickname_uq').on(t.classId, sql`lower(${t.nickname})`)],
);

/** One row per game played. `state` is an engine GameState. */
export const gameSaves = pgTable(
  'game_saves',
  {
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => studentProfiles.anonId, { onDelete: 'cascade' }),
    personaId: text('persona_id').$type<PersonaId>().notNull(),
    packVersion: text('pack_version').notNull(),
    state: jsonb('state').$type<GameState>().notNull(),
    month: smallint('month').notNull(),
    week: smallint('week').notNull(),
    score: smallint('score'),
    /** uint32 from hashSeed, so it needs more than a signed int. */
    seed: bigint('seed', { mode: 'number' }).notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('game_saves_profile_idx').on(t.profileId)],
);

/** Every synced and server-generated event. Inserted with ON CONFLICT DO NOTHING on event_id. */
export const events = pgTable(
  'events',
  {
    eventId: uuid('event_id').primaryKey(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => studentProfiles.anonId, { onDelete: 'cascade' }),
    /** Copied from the profile at insert time, so class reports need no join. */
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    seq: integer('seq').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    source: text('source').$type<'client' | 'server'>().notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('events_profile_seq_idx').on(t.profileId, t.seq),
    index('events_class_type_idx').on(t.classId, t.type),
  ],
);

/** Projection of decision_made events for analytics. */
export const decisionEvents = pgTable(
  'decision_events',
  {
    eventId: uuid('event_id')
      .primaryKey()
      .references(() => events.eventId, { onDelete: 'cascade' }),
    profileId: uuid('profile_id').notNull(),
    classId: uuid('class_id'),
    scenarioId: text('scenario_id').notNull(),
    choiceId: text('choice_id').notNull(),
    pillar: text('pillar'),
    rewound: boolean('rewound').notNull().default(false),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('decision_events_class_idx').on(t.classId), index('decision_events_profile_idx').on(t.profileId)],
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => studentProfiles.anonId, { onDelete: 'cascade' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    kind: text('kind').$type<QuizKind>().notNull(),
    pillar: text('pillar'),
    questionIds: jsonb('question_ids').$type<string[]>().notNull(),
    answers: jsonb('answers').$type<Record<string, number>>(),
    score: smallint('score'),
    /** pillar -> { correct, total } */
    byPillar: jsonb('by_pillar').$type<Record<string, { correct: number; total: number }>>(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
  },
  (t) => [index('quiz_attempts_class_kind_idx').on(t.classId, t.kind), index('quiz_attempts_profile_idx').on(t.profileId)],
);

export const rewards = pgTable(
  'rewards',
  {
    profileId: uuid('profile_id')
      .notNull()
      .references(() => studentProfiles.anonId, { onDelete: 'cascade' }),
    badgeId: text('badge_id').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.badgeId] })],
);
