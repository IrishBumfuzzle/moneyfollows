import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClassStatus, JoinClassResult, SyncEvent } from '@paisa/shared';
import { createTestDb, skipDbTests, type TestDb } from './db';

const MIGRATION = '20261011120500';
const CODE = /^[A-HJKMNP-Z2-9]{6}$/;
const REJOIN_FAILED = { code: 'PT404', message: 'rejoin_failed', details: null, hint: null };

// 20261011120500_class_settings_rejoin.sql. Skips locally without a test database; always runs in CI.
describe.skipIf(skipDbTests)('class settings and rejoin', () => {
  let db: TestDb;
  let facilitator: string;
  let otherFacilitator: string;
  let cls: { id: string; class_code: string };
  let otherCls: { id: string; class_code: string };

  const newClass = async (name: string, lang = 'hi', owner = facilitator) =>
    (
      await db.asUser(
        owner,
        (tx) => tx`insert into classes (name, default_lang) values (${name}, ${lang}) returning id, class_code`,
      )
    )[0] as { id: string; class_code: string };

  beforeAll(async () => {
    db = await createTestDb();
    facilitator = await db.createFacilitator();
    otherFacilitator = await db.createFacilitator();
    cls = await newClass('Class 11 A', 'hi');
    otherCls = await newClass('Class 12 B', 'en', otherFacilitator);
  });
  afterAll(() => db?.drop());

  const join = (code: string, nickname: string, lang?: string) =>
    db.asAnon(
      async (tx) =>
        (await tx`select join_class(${code}, ${nickname}, ${lang ?? null}) as r`)[0]!.r as JoinClassResult,
    );

  /** rejoin_class's result, and the HTTP status it asked PostgREST for (null = 200). */
  const rejoin = (code: string, nickname: string, rejoinCode: string) =>
    db.asAnon(async (tx) => {
      const [{ r }] = (await tx`select rejoin_class(${code}, ${nickname}, ${rejoinCode}) as r`) as unknown as [
        { r: JoinClassResult | typeof REJOIN_FAILED },
      ];
      const [{ status }] = (await tx`select nullif(current_setting('response.status', true), '') as status`) as unknown as [
        { status: string | null },
      ];
      return { r, status };
    });

  const status = (anonId: string, classId: string) =>
    db.asAnon(async (tx) => (await tx`select class_status(${anonId}, ${classId}) as r`)[0]!.r as ClassStatus);

  const setClass = (owner: string, classId: string, column: 'endline_open' | 'join_open', value: boolean) =>
    db.asUser(
      owner,
      (tx) => tx`update classes set ${tx(column)} = ${value} where id = ${classId} returning ${tx(column)}`,
    );

  const failures = async (classId: string) =>
    Number((await db.sql`select count(*) as n from rejoin_failures where class_id = ${classId}`)[0]!.n);

  describe('join_class', () => {
    it('keeps 1B’s behaviour and adds endline_open and rejoin_code to its result', async () => {
      const r = await join(cls.class_code.toLowerCase(), ' Chai Star ', 'en');
      expect(r).toEqual({
        anon_id: expect.any(String),
        class_id: cls.id,
        default_lang: 'hi',
        endline_open: false,
        rejoin_code: expect.stringMatching(CODE),
      });
      const [s] = await db.sql`select nickname, lang, rejoin_code from students where anon_id = ${r.anon_id}`;
      expect(s).toEqual({ nickname: 'Chai Star', lang: 'en', rejoin_code: r.rejoin_code });

      await expect(join('ZZZZZZZZ', 'Asha')).rejects.toMatchObject({ code: 'PT404', message: 'class_not_found' });
      await expect(join('ZZZZZZZZ', 'x')).rejects.toMatchObject({ code: 'PT422', message: 'nickname_invalid' });
      const taken = await join(cls.class_code, 'chai star').catch((e: { code: string; message: string; detail: string }) => e);
      expect(taken).toMatchObject({ code: 'PT409', message: 'nickname_taken' });
      expect(JSON.parse((taken as { detail: string }).detail)).toEqual(['chai star2', 'chai star3', 'chai star4']);

      const closed = await newClass('Closed join');
      await setClass(facilitator, closed.id, 'join_open', false);
      await expect(join(closed.class_code, 'Asha')).rejects.toMatchObject({ code: 'PT403', message: 'class_closed' });
    });

    it('gives each student their own code, and is still the only join_class', async () => {
      const codes = new Set<string>();
      for (let i = 1; i <= 10; i++) codes.add((await join(cls.class_code, `Code Kid ${i}`)).rejoin_code!);
      expect(codes.size).toBe(10);
      const rows = await db.sql`
        select pg_get_function_arguments(p.oid) as args
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'join_class'`;
      expect(rows).toEqual([{ args: 'class_code text, nickname text, lang text DEFAULT NULL::text' }]);
    });
  });

  describe('endline_open', () => {
    it('defaults to false; the owner opens it and join_class reports it', async () => {
      const c = await newClass('End-line test');
      expect((await join(c.class_code, 'Before Open')).endline_open).toBe(false);
      expect(await setClass(facilitator, c.id, 'endline_open', true)).toEqual([{ endline_open: true }]);
      expect((await join(c.class_code, 'After Open')).endline_open).toBe(true);
      expect(await setClass(facilitator, c.id, 'endline_open', false)).toEqual([{ endline_open: false }]);
    });

    it('only the owning facilitator can change it', async () => {
      expect(await setClass(otherFacilitator, cls.id, 'endline_open', true)).toEqual([]);
      const [row] = await db.sql`select endline_open from classes where id = ${cls.id}`;
      expect(row).toEqual({ endline_open: false });
      await expect(db.asAnon((tx) => tx`update classes set endline_open = true where id = ${cls.id}`)).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  describe('class_status', () => {
    it('returns the class settings and the current rejoin code for the right pair', async () => {
      const c = await newClass('Status test', 'en');
      const s = await join(c.class_code, 'Status Kid', 'hi');
      expect(await status(s.anon_id, c.id)).toEqual({ endline_open: false, default_lang: 'en', rejoin_code: s.rejoin_code });
      await setClass(facilitator, c.id, 'endline_open', true);
      expect(await status(s.anon_id, c.id)).toMatchObject({ endline_open: true });
    });

    it('gives class_not_found for a wrong pair, a foreign class or unknown ids', async () => {
      const mine = await join(cls.class_code, 'Status Mine');
      const theirs = await join(otherCls.class_code, 'Status Theirs');
      const notFound = { code: 'PT404', message: 'class_not_found' };
      await expect(status(mine.anon_id, otherCls.id)).rejects.toMatchObject(notFound);
      await expect(status(theirs.anon_id, cls.id)).rejects.toMatchObject(notFound);
      await expect(status(randomUUID(), cls.id)).rejects.toMatchObject(notFound);
      await expect(status(mine.anon_id, randomUUID())).rejects.toMatchObject(notFound);
    });
  });

  describe('rejoin_class', () => {
    it('returns the same student for the right code, case-insensitively', async () => {
      const c = await newClass('Rejoin test');
      const s = await join(c.class_code, 'Lost Phone', 'en');
      const { r, status: st } = await rejoin(` ${c.class_code.toLowerCase()} `, ' lost PHONE ', s.rejoin_code!.toLowerCase());
      expect(r).toEqual(s);
      expect(st).toBeNull();
      expect(await failures(c.id)).toBe(0);
    });

    it('works in a class closed to new joins (an existing student)', async () => {
      const c = await newClass('Rejoin closed');
      const s = await join(c.class_code, 'Old Timer');
      await setClass(facilitator, c.id, 'join_open', false);
      expect((await rejoin(c.class_code, 'Old Timer', s.rejoin_code!)).r).toEqual(s);
    });

    it('fails the same way for every wrong part, and records each failure', async () => {
      const c = await newClass('Rejoin wrong');
      const s = await join(c.class_code, 'Right Name');
      const other = await join(otherCls.class_code, 'Right Name');
      const wrongCode = s.rejoin_code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
      const attempts: [string, string, string][] = [
        [c.class_code, 'Right Name', wrongCode], // wrong code
        [c.class_code, 'Wrong Name', s.rejoin_code!], // wrong nickname
        [otherCls.class_code, 'Right Name', s.rejoin_code!], // right student, wrong class
        [c.class_code, 'Right Name', other.rejoin_code!], // a code from the other class
        [c.class_code, 'Right Name', ''],
        [c.class_code, 'Right Name', `${s.rejoin_code}X`],
      ];
      for (const a of attempts) {
        expect(await rejoin(...a), a.join(' / ')).toEqual({ r: REJOIN_FAILED, status: '404' });
      }
      // Unknown class: the same answer, nothing to record.
      expect(await rejoin('ZZZZZZZZ', 'Right Name', s.rejoin_code!)).toEqual({ r: REJOIN_FAILED, status: '404' });
      expect(await failures(c.id)).toBe(5);
    });

    it('throttles a class after 20 failures in 10 minutes, even for the right code', async () => {
      const c = await newClass('Rejoin throttle');
      const s = await join(c.class_code, 'Patient Kid');
      const bystander = await join(otherCls.class_code, 'Bystander');
      for (let i = 0; i < 20; i++) {
        expect((await rejoin(c.class_code, `Guess ${i}`, 'AAAAAA')).status).toBe('404');
      }
      await expect(rejoin(c.class_code, 'Patient Kid', s.rejoin_code!)).rejects.toMatchObject({
        code: 'PT429',
        message: 'join_rate_limited',
      });
      // Other classes are not affected.
      expect((await rejoin(otherCls.class_code, 'Bystander', bystander.rejoin_code!)).r).toEqual(bystander);
      // Failures older than 10 minutes no longer count (and are cleaned up on the next failure).
      await db.sql`update rejoin_failures set at = now() - interval '11 minutes' where class_id = ${c.id}`;
      expect((await rejoin(c.class_code, 'Patient Kid', s.rejoin_code!)).r).toEqual(s);
      await rejoin(c.class_code, 'Guess again', 'AAAAAA');
      expect(await failures(c.id)).toBe(1);
    });
  });

  describe('reset_rejoin_code', () => {
    const reset = (userId: string, anonId: string) =>
      db.asUser(userId, async (tx) => (await tx`select reset_rejoin_code(${anonId}) as code`)[0]!.code as string);

    it('gives the owner a new code; the old one stops working', async () => {
      const c = await newClass('Reset test');
      const s = await join(c.class_code, 'Shared Code');
      const code = await reset(facilitator, s.anon_id);
      expect(code).toMatch(CODE);
      expect(code).not.toBe(s.rejoin_code);
      expect((await rejoin(c.class_code, 'Shared Code', s.rejoin_code!)).r).toEqual(REJOIN_FAILED);
      expect((await rejoin(c.class_code, 'Shared Code', code)).r).toMatchObject({ anon_id: s.anon_id, rejoin_code: code });
      expect((await status(s.anon_id, c.id)).rejoin_code).toBe(code);
    });

    it('refuses everyone else with class_not_found', async () => {
      const s = await join(cls.class_code, 'Not Theirs');
      const notFound = { code: 'PT404', message: 'class_not_found' };
      await expect(reset(otherFacilitator, s.anon_id)).rejects.toMatchObject(notFound);
      await expect(reset(facilitator, randomUUID())).rejects.toMatchObject(notFound);
      const former = await db.createFacilitator(undefined, false);
      const [orphan] = await db.sql`insert into classes (name, facilitator_id) values ('Orphan', ${former}) returning id`;
      const [kid] = await db.sql`
        insert into students (class_id, nickname, lang) values (${orphan!.id as string}, 'Orphan Kid', 'hi') returning anon_id`;
      await expect(reset(former, kid!.anon_id as string)).rejects.toMatchObject(notFound);
      await expect(db.asAnon((tx) => tx`select reset_rejoin_code(${s.anon_id})`)).rejects.toThrow(/permission denied/);
      const [row] = await db.sql`select rejoin_code from students where anon_id = ${s.anon_id}`;
      expect(row).toEqual({ rejoin_code: s.rejoin_code });
    });
  });

  describe('privileges', () => {
    it('lets facilitators read rejoin codes but change them only through reset_rejoin_code', async () => {
      const s = await join(cls.class_code, 'Readable');
      const rows = await db.asUser(
        facilitator,
        (tx) => tx`select nickname, rejoin_code from students where anon_id = ${s.anon_id}`,
      );
      expect(rows).toEqual([{ nickname: 'Readable', rejoin_code: s.rejoin_code }]);
      expect(await db.asUser(otherFacilitator, (tx) => tx`select 1 from students where anon_id = ${s.anon_id}`)).toEqual(
        [],
      );
      await expect(
        db.asUser(facilitator, (tx) => tx`update students set rejoin_code = 'AAAAAA' where anon_id = ${s.anon_id}`),
      ).rejects.toThrow(/permission denied/);
    });

    it('keeps rejoin_failures and gen_rejoin_code away from apps; grants only what each function needs', async () => {
      const [g] = await db.sql`
        select
          has_table_privilege('anon', 'public.rejoin_failures', 'select, insert, update, delete') as anon_table,
          has_table_privilege('authenticated', 'public.rejoin_failures', 'select, insert, update, delete') as auth_table,
          has_function_privilege('anon', 'public.gen_rejoin_code()', 'execute') as anon_gen,
          has_function_privilege('authenticated', 'public.gen_rejoin_code()', 'execute') as auth_gen,
          has_function_privilege('anon', 'public.class_status(uuid, uuid)', 'execute') as anon_status,
          has_function_privilege('anon', 'public.rejoin_class(text, text, text)', 'execute') as anon_rejoin,
          has_function_privilege('authenticated', 'public.rejoin_class(text, text, text)', 'execute') as auth_rejoin,
          has_function_privilege('anon', 'public.reset_rejoin_code(uuid)', 'execute') as anon_reset,
          has_function_privilege('authenticated', 'public.reset_rejoin_code(uuid)', 'execute') as auth_reset,
          (select coalesce(bool_or(a.grantee = 0), false)
             from pg_proc p, aclexplode(p.proacl) a
            where p.oid in ('public.gen_rejoin_code()'::regprocedure, 'public.class_status(uuid, uuid)'::regprocedure,
                            'public.rejoin_class(text, text, text)'::regprocedure,
                            'public.reset_rejoin_code(uuid)'::regprocedure)
              and a.privilege_type = 'EXECUTE') as public_any`;
      expect(g).toEqual({
        anon_table: false,
        auth_table: false,
        anon_gen: false,
        auth_gen: false,
        anon_status: true,
        anon_rejoin: true,
        auth_rejoin: true,
        anon_reset: false,
        auth_reset: true,
        public_any: false,
      });
    });

    it('lets the service role add staff (supabase/scripts/invite-staff.ts)', async () => {
      const exists = await db.sql`select 1 from pg_roles where rolname = 'service_role'`;
      if (!exists.length) return; // plain Postgres with the auth stub has no service_role
      const [g] = await db.sql`select has_table_privilege('service_role', 'public.staff', 'insert, select') as ok`;
      expect(g).toEqual({ ok: true });
    });
  });
});

describe.skipIf(skipDbTests)('class settings and rejoin: backfill', () => {
  let db: TestDb;
  afterAll(() => db?.drop());

  it('gives every existing student a valid code of their own', async () => {
    db = await createTestDb({ migrationsBefore: MIGRATION });
    const facilitator = await db.createFacilitator();
    const [c] = await db.asUser(
      facilitator,
      (tx) => tx`insert into classes (name, default_lang) values ('Before codes', 'hi') returning id, class_code`,
    );
    const before: JoinClassResult[] = [];
    for (let i = 1; i <= 25; i++) {
      before.push(
        await db.asAnon(
          async (tx) => (await tx`select join_class(${c!.class_code as string}, ${`Early ${i}`}) as r`)[0]!.r,
        ),
      );
    }
    expect(before[0]).not.toHaveProperty('rejoin_code');
    const event: SyncEvent = {
      event_id: randomUUID(),
      anon_id: before[0]!.anon_id,
      class_id: c!.id as string,
      type: 'app_open',
      payload: {},
      client_ts: '2026-10-11T09:00:00+05:30',
      content_version: 'test',
    };
    await db.asAnon((tx) => tx`select push_events(${tx.json([event] as never)})`);

    await db.applyRemainingMigrations();

    const rows = await db.sql`select anon_id, rejoin_code from students order by nickname`;
    expect(rows).toHaveLength(25);
    for (const row of rows) expect(row.rejoin_code).toMatch(CODE);
    expect(new Set(rows.map((r) => r.rejoin_code)).size).toBe(25);
    // Their history is untouched, and the backfilled code works.
    const [{ n }] = (await db.sql`select count(*)::int as n from events`) as unknown as [{ n: number }];
    expect(n).toBe(1);
    const first = rows.find((r) => r.anon_id === before[0]!.anon_id)!;
    const back = await db.asAnon(
      async (tx) =>
        (await tx`select rejoin_class(${c!.class_code as string}, 'Early 1', ${first.rejoin_code as string}) as r`)[0]!.r,
    );
    expect(back).toMatchObject({ anon_id: before[0]!.anon_id, rejoin_code: first.rejoin_code });
  });
});
