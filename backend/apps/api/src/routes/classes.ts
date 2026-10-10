import { randomInt } from 'node:crypto';
import { and, count, desc, eq, inArray, isNotNull, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ClassInfo,
  ClassProgress,
  CreateClass,
  LearningGains,
  ModuleCompletePayload,
  PILLARS,
  UpdateClass,
  type Pillar,
  type ProgressRow,
} from '@paisa/contracts';
import { schema, type Db } from '@paisa/db';
import { badRequest, forbidden, notFound } from '../errors';
import { route, UuidParam } from '../http';
import type { StaffClaims } from '../tokens';
import { isUniqueViolation } from './student';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const INACTIVE_MS = 7 * 24 * 3600 * 1000;
/** Vanguard sees aggregates only, and no cell smaller than this. */
export const VANGUARD_MIN_CELL = 10;

export function newClassCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
}

type ClassRow = typeof schema.classes.$inferSelect;

function toClassInfo(row: ClassRow, studentCount?: number): ClassInfo {
  return {
    id: row.id,
    centreId: row.centreId,
    name: row.name,
    classCode: row.classCode,
    defaultLanguage: row.defaultLanguage,
    facilitatorId: row.facilitatorId,
    programmeEndsAt: row.programmeEndsAt?.toISOString() ?? null,
    ...(studentCount !== undefined && { studentCount }),
  };
}

/** Facilitators see their own classes; NGO admins every class in their NGO. Vanguard sees no class rows. */
async function loadClassFor(db: Db, staff: StaffClaims, rawId: string | undefined): Promise<ClassRow> {
  const id = UuidParam.safeParse(rawId);
  if (!id.success) throw notFound('class');
  const [row] = await db
    .select({ cls: schema.classes, orgId: schema.centres.orgId })
    .from(schema.classes)
    .innerJoin(schema.centres, eq(schema.centres.id, schema.classes.centreId))
    .where(eq(schema.classes.id, id.data));
  if (!row) throw notFound('class');
  const ok =
    (staff.role === 'facilitator' && row.cls.facilitatorId === staff.sub) || (staff.role === 'ngo_admin' && row.orgId === staff.org);
  // 404, not 403: do not confirm that someone else's class exists.
  if (!ok) throw notFound('class');
  return row.cls;
}

export async function classRoutes(app: FastifyInstance, { db }: { db: Db }) {
  route(
    app,
    {
      method: 'GET',
      url: '/v1/classes',
      summary: 'Your classes with student counts',
      tag: 'classes',
      auth: 'staff',
      roles: ['facilitator', 'ngo_admin'],
      response: z.array(ClassInfo),
    },
    async ({ staff }) => {
      const where: SQL | undefined =
        staff.role === 'facilitator' ? eq(schema.classes.facilitatorId, staff.sub) : eq(schema.centres.orgId, staff.org ?? '00000000-0000-0000-0000-000000000000');
      const rows = await db
        .select({ cls: schema.classes })
        .from(schema.classes)
        .innerJoin(schema.centres, eq(schema.centres.id, schema.classes.centreId))
        .where(where)
        .orderBy(desc(schema.classes.createdAt));
      if (rows.length === 0) return [];
      const counts = await db
        .select({ classId: schema.studentProfiles.classId, n: count() })
        .from(schema.studentProfiles)
        .where(inArray(schema.studentProfiles.classId, rows.map((r) => r.cls.id)))
        .groupBy(schema.studentProfiles.classId);
      const byClass = new Map(counts.map((c) => [c.classId, c.n]));
      return rows.map((r) => toClassInfo(r.cls, byClass.get(r.cls.id) ?? 0));
    },
  );

  route(
    app,
    {
      method: 'POST',
      url: '/v1/classes',
      summary: 'Create a class and get its join code (show it as text or a QR code)',
      tag: 'classes',
      auth: 'staff',
      roles: ['facilitator', 'ngo_admin'],
      body: CreateClass,
      response: ClassInfo,
    },
    async ({ staff, body }) => {
      const [centre] = await db.select().from(schema.centres).where(eq(schema.centres.id, body.centreId));
      if (!centre || centre.orgId !== staff.org) throw forbidden('that centre is not in your NGO');
      for (let tries = 0; tries < 5; tries++) {
        try {
          const [row] = await db
            .insert(schema.classes)
            .values({
              centreId: body.centreId,
              name: body.name,
              defaultLanguage: body.defaultLanguage,
              programmeEndsAt: body.programmeEndsAt ? new Date(body.programmeEndsAt) : null,
              facilitatorId: staff.sub,
              classCode: newClassCode(),
            })
            .returning();
          return toClassInfo(row!, 0);
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
        }
      }
      throw new Error('could not find a free class code');
    },
  );

  route(
    app,
    { method: 'GET', url: '/v1/classes/:id', summary: 'One class', tag: 'classes', auth: 'staff', roles: ['facilitator', 'ngo_admin'], response: ClassInfo },
    async ({ staff, params }) => toClassInfo(await loadClassFor(db, staff, params['id'])),
  );

  route(
    app,
    {
      method: 'PATCH',
      url: '/v1/classes/:id',
      summary: 'Rename a class, change its language or end date',
      tag: 'classes',
      auth: 'staff',
      roles: ['facilitator', 'ngo_admin'],
      body: UpdateClass,
      response: ClassInfo,
    },
    async ({ staff, params, body }) => {
      const cls = await loadClassFor(db, staff, params['id']);
      const [row] = await db
        .update(schema.classes)
        .set({
          ...(body.name && { name: body.name }),
          ...(body.defaultLanguage && { defaultLanguage: body.defaultLanguage }),
          ...(body.programmeEndsAt && { programmeEndsAt: new Date(body.programmeEndsAt) }),
        })
        .where(eq(schema.classes.id, cls.id))
        .returning();
      return toClassInfo(row!);
    },
  );

  route(
    app,
    {
      method: 'GET',
      url: '/v1/classes/:id/progress',
      summary: 'Heatmap of decisions per pillar per nickname, quiz scores and 7-day inactive flags',
      tag: 'classes',
      auth: 'staff',
      roles: ['facilitator', 'ngo_admin'],
      response: ClassProgress,
    },
    async ({ staff, params }) => {
      const cls = await loadClassFor(db, staff, params['id']);
      return { classId: cls.id, students: await classProgress(db, cls.id, app.now()) };
    },
  );

  route(
    app,
    {
      method: 'GET',
      url: '/v1/reports/learning-gains',
      summary: 'Baseline vs end-line averages by pillar for a class or an NGO',
      tag: 'reports',
      auth: 'staff',
      query: z.object({ classId: z.uuid().optional(), orgId: z.uuid().optional() }),
      response: LearningGains,
    },
    async ({ staff, query }) => {
      let classIds: string[] | null;
      let orgId: string | null = null;
      if (query.classId) {
        if (staff.role === 'vanguard') throw forbidden('Vanguard reports are by NGO only');
        classIds = [(await loadClassFor(db, staff, query.classId)).id];
      } else if (staff.role === 'facilitator') {
        throw badRequest('classId is required');
      } else {
        orgId = staff.role === 'ngo_admin' ? staff.org : (query.orgId ?? null);
        if (staff.role === 'ngo_admin' && query.orgId && query.orgId !== staff.org) throw forbidden('not your NGO');
        classIds = orgId ? await classIdsInOrg(db, orgId) : null;
      }
      const minCell = staff.role === 'vanguard' ? VANGUARD_MIN_CELL : 1;
      return learningGains(db, classIds, { classId: query.classId ?? null, orgId }, minCell);
    },
  );
}

async function classIdsInOrg(db: Db, orgId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.classes.id })
    .from(schema.classes)
    .innerJoin(schema.centres, eq(schema.centres.id, schema.classes.centreId))
    .where(eq(schema.centres.orgId, orgId));
  return rows.map((r) => r.id);
}

export async function classProgress(db: Db, classId: string, now: Date): Promise<ProgressRow[]> {
  const students = await db
    .select()
    .from(schema.studentProfiles)
    .where(eq(schema.studentProfiles.classId, classId))
    .orderBy(schema.studentProfiles.nickname);
  if (students.length === 0) return [];

  const decisions = await db
    .select({ profileId: schema.decisionEvents.profileId, pillar: schema.decisionEvents.pillar, n: count() })
    .from(schema.decisionEvents)
    .where(and(eq(schema.decisionEvents.classId, classId), eq(schema.decisionEvents.rewound, false)))
    .groupBy(schema.decisionEvents.profileId, schema.decisionEvents.pillar);
  const modules = await db
    .select({ profileId: schema.events.profileId, payload: schema.events.payload })
    .from(schema.events)
    .where(and(eq(schema.events.classId, classId), eq(schema.events.type, 'module_complete')));
  const quizzes = await latestQuizzes(db, [classId]);

  return students.map((s) => {
    const pillars = Object.fromEntries(PILLARS.map((p) => [p, 0])) as Record<Pillar, number>;
    for (const d of decisions) if (d.profileId === s.anonId && d.pillar && d.pillar in pillars) pillars[d.pillar as Pillar] = d.n;
    const done = new Set<Pillar>();
    for (const m of modules) {
      const p = ModuleCompletePayload.safeParse(m.payload);
      if (m.profileId === s.anonId && p.success && (PILLARS as readonly string[]).includes(p.data.pillar)) done.add(p.data.pillar as Pillar);
    }
    const q = quizzes.get(s.anonId);
    return {
      anonId: s.anonId,
      nickname: s.nickname,
      pillars,
      modulesComplete: PILLARS.filter((p) => done.has(p)),
      quizzes: { baseline: q?.baseline?.score ?? null, endline: q?.endline?.score ?? null },
      lastActive: s.lastActiveAt?.toISOString() ?? null,
      inactive: !s.lastActiveAt || now.getTime() - s.lastActiveAt.getTime() > INACTIVE_MS,
    };
  });
}

interface Attempt {
  score: number | null;
  byPillar: Record<string, { correct: number; total: number }> | null;
}

/** Latest submitted baseline and end-line per student. `classIds` null means every class. */
async function latestQuizzes(db: Db, classIds: string[] | null) {
  const rows = await db
    .select({
      profileId: schema.quizAttempts.profileId,
      kind: schema.quizAttempts.kind,
      score: schema.quizAttempts.score,
      byPillar: schema.quizAttempts.byPillar,
    })
    .from(schema.quizAttempts)
    .where(
      and(
        isNotNull(schema.quizAttempts.submittedAt),
        inArray(schema.quizAttempts.kind, ['baseline', 'endline']),
        classIds ? inArray(schema.quizAttempts.classId, classIds) : isNotNull(schema.quizAttempts.classId),
      ),
    )
    .orderBy(schema.quizAttempts.submittedAt);
  const out = new Map<string, { baseline?: Attempt; endline?: Attempt }>();
  for (const r of rows) {
    const entry = out.get(r.profileId) ?? {};
    entry[r.kind as 'baseline' | 'endline'] = { score: r.score, byPillar: r.byPillar };
    out.set(r.profileId, entry);
  }
  return out;
}

export async function learningGains(
  db: Db,
  classIds: string[] | null,
  scope: { classId: string | null; orgId: string | null },
  minCell: number,
): Promise<LearningGains> {
  const empty = (): LearningGains['byPillar'] =>
    Object.fromEntries(PILLARS.map((p) => [p, { baseline: null, endline: null }])) as LearningGains['byPillar'];
  if (classIds && classIds.length === 0) {
    return { scope, students: 0, paired: 0, byPillar: empty(), overall: { baseline: null, endline: null }, minCell };
  }
  const quizzes = await latestQuizzes(db, classIds);
  const mean = (xs: number[]) => (xs.length >= minCell && xs.length > 0 ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  const byPillar = empty();
  for (const pillar of PILLARS) {
    for (const kind of ['baseline', 'endline'] as const) {
      const pcts: number[] = [];
      for (const q of quizzes.values()) {
        const cell = q[kind]?.byPillar?.[pillar];
        if (cell && cell.total > 0) pcts.push((100 * cell.correct) / cell.total);
      }
      byPillar[pillar][kind] = mean(pcts);
    }
  }
  const scores = (kind: 'baseline' | 'endline') =>
    [...quizzes.values()].map((q) => q[kind]?.score).filter((s): s is number => typeof s === 'number');
  return {
    scope,
    students: quizzes.size,
    paired: [...quizzes.values()].filter((q) => q.baseline && q.endline).length,
    byPillar,
    overall: { baseline: mean(scores('baseline')), endline: mean(scores('endline')) },
    minCell,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
