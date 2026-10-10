import { z } from 'zod';
import { Difficulty, Language, PersonaId, Pillar, QuizKind, Rupees, TKey } from './content';
import { GameEvent, View } from './game';

// Request and response bodies for the HTTP API (v0.2). JSON is camelCase.

export const STAFF_ROLES = ['facilitator', 'ngo_admin', 'vanguard'] as const;
export const StaffRole = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof StaffRole>;

/** Six characters from an alphabet without look-alikes (no 0/O, 1/I/L). */
export const ClassCode = z.string().trim().toUpperCase().regex(/^[A-HJKMNP-Z2-9]{6}$/);

export const Nickname = z.string().trim().min(2).max(20).regex(/^[\p{L}\p{M}\p{N} _.-]+$/u);

export const ErrorBody = z.strictObject({ error: z.string(), message: z.string() });
export type ErrorBody = z.infer<typeof ErrorBody>;

export const JoinRequest = z.strictObject({
  classCode: ClassCode,
  nickname: Nickname,
  avatar: z.string().max(64).regex(/^[a-z0-9_:-]*$/).optional(),
  language: Language.optional(),
});
export type JoinRequest = z.infer<typeof JoinRequest>;

export const StudentProfile = z.strictObject({
  anonId: z.uuid(),
  classId: z.uuid().nullable(),
  nickname: z.string(),
  avatar: z.string().nullable(),
  language: Language,
  level: Difficulty,
});
export type StudentProfile = z.infer<typeof StudentProfile>;

export const JoinResponse = z.strictObject({
  profile: StudentProfile,
  /** Device token for this profile. Several profiles on one phone each keep their own. */
  token: z.string(),
  defaultLanguage: Language,
});
export type JoinResponse = z.infer<typeof JoinResponse>;

export const UpdateProfileRequest = z.strictObject({
  language: Language.optional(),
  level: Difficulty.optional(),
  avatar: z.string().max(64).regex(/^[a-z0-9_:-]*$/).optional(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;

export const NewGameRequest = z.strictObject({ personaId: PersonaId, level: Difficulty.optional() });
export type NewGameRequest = z.infer<typeof NewGameRequest>;

export const GameResponse = z.strictObject({
  gameId: z.uuid(),
  personaId: PersonaId,
  packVersion: z.string(),
  view: View,
  events: z.array(GameEvent),
});
export type GameResponse = z.infer<typeof GameResponse>;

export const GameSummary = z.strictObject({
  gameId: z.uuid(),
  personaId: PersonaId,
  month: z.int(),
  week: z.int(),
  score: z.int().nullable(),
  updatedAt: z.iso.datetime(),
});
export type GameSummary = z.infer<typeof GameSummary>;

export const QuizStartResponse = z.strictObject({
  attemptId: z.uuid(),
  kind: QuizKind,
  questions: z.array(
    z.strictObject({ id: z.string(), pillar: Pillar, text: TKey, options: z.array(TKey) }),
  ),
});
export type QuizStartResponse = z.infer<typeof QuizStartResponse>;

export const QuizSubmitRequest = z.strictObject({
  /** questionId -> chosen option index. */
  answers: z.record(z.string(), z.int().min(0)),
});
export type QuizSubmitRequest = z.infer<typeof QuizSubmitRequest>;

export const ProjectionRequest = z.strictObject({
  monthlyAmount: Rupees.min(1).max(100_000),
  years: z.array(z.int().min(0).max(40)).min(1).max(10).optional(),
});
export type ProjectionRequest = z.infer<typeof ProjectionRequest>;

export const OtpRequest = z.strictObject({ email: z.email() });
export const OtpRequestResponse = z.strictObject({
  sent: z.literal(true),
  /** Only when OTP_DEV_ECHO=true, for local development and demos. */
  devCode: z.string().optional(),
});
export const OtpVerify = z.strictObject({ email: z.email(), code: z.string().regex(/^\d{6}$/) });

export const StaffUser = z.strictObject({
  id: z.uuid(),
  orgId: z.uuid().nullable(),
  name: z.string(),
  email: z.string(),
  role: StaffRole,
});
export type StaffUser = z.infer<typeof StaffUser>;

export const OtpVerifyResponse = z.strictObject({ token: z.string(), user: StaffUser });

export const Organisation = z.strictObject({ id: z.uuid(), name: z.string(), city: z.string() });
export type Organisation = z.infer<typeof Organisation>;
export const CreateOrganisation = z.strictObject({ name: z.string().trim().min(2).max(120), city: z.string().trim().min(2).max(60) });

export const Centre = z.strictObject({
  id: z.uuid(),
  orgId: z.uuid(),
  name: z.string(),
  type: z.enum(['school', 'community_centre']),
});
export type Centre = z.infer<typeof Centre>;
export const CreateCentre = z.strictObject({
  orgId: z.uuid().optional(),
  name: z.string().trim().min(2).max(120),
  type: z.enum(['school', 'community_centre']),
});

export const ClassInfo = z.strictObject({
  id: z.uuid(),
  centreId: z.uuid(),
  name: z.string(),
  classCode: z.string(),
  defaultLanguage: Language,
  facilitatorId: z.uuid(),
  programmeEndsAt: z.iso.datetime().nullable(),
  studentCount: z.int().optional(),
});
export type ClassInfo = z.infer<typeof ClassInfo>;
export const CreateClass = z.strictObject({
  centreId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  defaultLanguage: Language,
  programmeEndsAt: z.iso.datetime().optional(),
});
export const UpdateClass = CreateClass.omit({ centreId: true }).partial();

export const ProgressRow = z.strictObject({
  anonId: z.uuid(),
  nickname: z.string(),
  /** Decisions played per pillar: the heatmap cells. */
  pillars: z.record(Pillar, z.int()),
  modulesComplete: z.array(Pillar),
  quizzes: z.strictObject({ baseline: z.int().nullable(), endline: z.int().nullable() }),
  lastActive: z.iso.datetime().nullable(),
  /** No activity in the last 7 days. */
  inactive: z.boolean(),
});
export type ProgressRow = z.infer<typeof ProgressRow>;
export const ClassProgress = z.strictObject({ classId: z.uuid(), students: z.array(ProgressRow) });

export const LearningGains = z.strictObject({
  scope: z.strictObject({ classId: z.uuid().nullable(), orgId: z.uuid().nullable() }),
  students: z.int(),
  /** Students with both a baseline and an end-line. */
  paired: z.int(),
  /** Average percent correct per pillar. Null when a cell has too few students to report. */
  byPillar: z.record(Pillar, z.strictObject({ baseline: z.number().nullable(), endline: z.number().nullable() })),
  overall: z.strictObject({ baseline: z.number().nullable(), endline: z.number().nullable() }),
  /** Cells below this size are hidden for the vanguard role. */
  minCell: z.int(),
});
export type LearningGains = z.infer<typeof LearningGains>;
