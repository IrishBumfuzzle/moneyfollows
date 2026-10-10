import { schema, createTestDb, type Db, type TestDb } from '@paisa/db';
import type { StaffRole } from '@paisa/contracts';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { signToken, STAFF_TTL_S } from '../src/tokens';

import { fileURLToPath } from 'node:url';

/** Tests use the fixture pack only, never the real content. */
export const FIXTURES = fileURLToPath(new URL('../../../content/fixtures', import.meta.url));

export const ADMIN_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgres://paisa:paisa@localhost:5432/paisa_path';

export interface Harness {
  app: ReturnType<typeof buildApp>;
  db: Db;
  t: TestDb;
  clock: { now: Date };
  sent: { email: string; code: string }[];
  close(): Promise<void>;
}

export async function setup(env: Record<string, string> = {}): Promise<Harness> {
  const t = await createTestDb(ADMIN_URL);
  const clock = { now: new Date('2026-10-10T10:00:00.000Z') };
  const sent: { email: string; code: string }[] = [];
  const config = loadConfig({ NODE_ENV: 'test', CONTENT_DIR: FIXTURES, ...env });
  const app = buildApp(config, {
    db: t.db,
    now: () => clock.now,
    mailer: { sendOtp: async (email, code) => void sent.push({ email, code }) },
  });
  await app.ready();
  return {
    app,
    db: t.db,
    t,
    clock,
    sent,
    async close() {
      await app.close();
      await t.drop();
    },
  };
}

export function staffToken(h: Harness, user: { id: string; role: StaffRole; orgId: string | null }) {
  return signToken({ kind: 'staff', sub: user.id, role: user.role, org: user.orgId }, h.app.jwtSecret, STAFF_TTL_S, h.clock.now);
}

let counter = 0;

/** An NGO with one centre, one facilitator and one class. */
export async function seedOrg(db: Db, opts: { classCode?: string; email?: string } = {}) {
  counter += 1;
  const [org] = await db.insert(schema.organisations).values({ name: `NGO ${counter}`, city: 'Hyderabad' }).returning();
  const [centre] = await db.insert(schema.centres).values({ orgId: org!.id, name: `School ${counter}`, type: 'school' }).returning();
  const [facilitator] = await db
    .insert(schema.staffUsers)
    .values({ orgId: org!.id, name: 'Facilitator', email: opts.email ?? `f${counter}@example.org`, role: 'facilitator' })
    .returning();
  const [admin] = await db
    .insert(schema.staffUsers)
    .values({ orgId: org!.id, name: 'Admin', email: `a${counter}@example.org`, role: 'ngo_admin' })
    .returning();
  const [cls] = await db
    .insert(schema.classes)
    .values({
      centreId: centre!.id,
      name: 'Class 11 A',
      classCode: opts.classCode ?? `ABC${['2', '3', '4', '5', '6', '7', '8', '9'][counter % 8]}${['D', 'E', 'F', 'G'][counter % 4]}${['H', 'J', 'K'][counter % 3]}`,
      defaultLanguage: 'hi',
      facilitatorId: facilitator!.id,
    })
    .returning();
  return { org: org!, centre: centre!, facilitator: facilitator!, admin: admin!, cls: cls! };
}

export async function join(h: Harness, classCode: string, nickname: string) {
  const res = await h.app.inject({ method: 'POST', url: '/v1/join', payload: { classCode, nickname } });
  if (res.statusCode !== 200) throw new Error(`join failed: ${res.statusCode} ${res.body}`);
  return res.json() as { token: string; profile: { anonId: string; classId: string } };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
