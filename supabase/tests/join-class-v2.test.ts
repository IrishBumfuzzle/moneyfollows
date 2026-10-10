import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { JoinClassResult, SyncEvent } from '@paisa/shared';
import { createTestDb, skipDbTests, type TestDb } from './db';

// 20261011090500_join_class_v2.sql. Skips locally without a test database; always runs in CI.
describe.skipIf(skipDbTests)('join_class v2', () => {
  let db: TestDb;
  let facilitator: string;
  let otherFacilitator: string;
  let cls: { id: string; class_code: string };

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
  });
  afterAll(() => db?.drop());

  const join = (code: string, nickname: string, lang?: string | null) =>
    db.asAnon(
      async (tx) =>
        (lang === undefined
          ? await tx`select join_class(class_code => ${code}, nickname => ${nickname}) as r`
          : await tx`select join_class(class_code => ${code}, nickname => ${nickname}, lang => ${lang}) as r`)[0]!
          .r as JoinClassResult,
    );

  const studentLang = async (anonId: string) =>
    ((await db.sql`select lang from students where anon_id = ${anonId}`)[0] as { lang: string }).lang;

  const push = (s: JoinClassResult) =>
    db.asAnon(async (tx) => {
      const event: SyncEvent = {
        event_id: randomUUID(),
        anon_id: s.anon_id,
        class_id: s.class_id,
        type: 'app_open',
        payload: {},
        client_ts: '2026-10-11T09:00:00+05:30',
        content_version: 'test',
      };
      return (await tx`select push_events(${tx.json([event] as never)}) as r`)[0]!.r as {
        accepted: number;
        rejected: string[];
      };
    });

  /** The JSON array join_class puts in nickname_taken's detail. */
  const suggestionsFor = async (code: string, nickname: string): Promise<string[]> => {
    const err = await join(code, nickname).then(
      () => {
        throw new Error('expected nickname_taken');
      },
      (e: { code: string; message: string; detail?: string }) => e,
    );
    expect(err).toMatchObject({ code: 'PT409', message: 'nickname_taken' });
    return JSON.parse(err.detail!) as string[];
  };

  describe('lang', () => {
    it('saves a valid language as the student’s and still returns the class default', async () => {
      const r = await join(cls.class_code, 'Lang En', 'en');
      expect(r).toEqual({
        anon_id: expect.any(String),
        class_id: cls.id,
        default_lang: 'hi',
        // Additive (20261011120500_class_settings_rejoin.sql).
        endline_open: false,
        rejoin_code: expect.stringMatching(/^[A-HJKMNP-Z2-9]{6}$/),
      });
      expect(await studentLang(r.anon_id)).toBe('en');
      expect(await studentLang((await join(cls.class_code, 'Lang Te', 'te')).anon_id)).toBe('te');
      expect(await studentLang((await join(cls.class_code, 'Lang Upper', ' EN ')).anon_id)).toBe('en');
    });

    it('falls back to the class default without a language', async () => {
      expect(await studentLang((await join(cls.class_code, 'Lang None')).anon_id)).toBe('hi');
      expect(await studentLang((await join(cls.class_code, 'Lang Null', null)).anon_id)).toBe('hi');
      // Positional, as before v2.
      const [{ r }] = (await db.asAnon(
        (tx) => tx`select join_class(${cls.class_code}, 'Lang Positional') as r`,
      )) as unknown as [{ r: JoinClassResult }];
      expect(await studentLang(r.anon_id)).toBe('hi');
    });

    it('falls back to the class default for an invalid language', async () => {
      for (const [nick, lang] of [
        ['Lang Fr', 'fr'],
        ['Lang Empty', ''],
        ['Lang Long', 'english'],
      ] as const) {
        expect(await studentLang((await join(cls.class_code, nick, lang)).anon_id), lang).toBe('hi');
      }
    });
  });

  describe('function signature and grants', () => {
    it('leaves exactly one join_class, with lang defaulting to null', async () => {
      const rows = await db.sql`
        select pg_get_function_identity_arguments(p.oid) as args, pg_get_function_arguments(p.oid) as full_args
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'join_class'`;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.args).toBe('class_code text, nickname text, lang text');
      expect(rows[0]!.full_args).toBe('class_code text, nickname text, lang text DEFAULT NULL::text');
    });

    it('lets anon and authenticated join, and only authenticated rotate a code', async () => {
      const [g] = await db.sql`
        select has_function_privilege('anon', 'public.join_class(text, text, text)', 'execute') as anon_join,
               has_function_privilege('authenticated', 'public.join_class(text, text, text)', 'execute') as auth_join,
               has_function_privilege('anon', 'public.rotate_class_code(uuid)', 'execute') as anon_rotate,
               has_function_privilege('authenticated', 'public.rotate_class_code(uuid)', 'execute') as auth_rotate,
               (select coalesce(bool_or(a.grantee = 0), false)
                  from pg_proc p, aclexplode(p.proacl) a
                 where p.oid in ('public.join_class(text, text, text)'::regprocedure,
                                 'public.rotate_class_code(uuid)'::regprocedure)
                   and a.privilege_type = 'EXECUTE') as public_any`;
      expect(g).toEqual({ anon_join: true, auth_join: true, anon_rotate: false, auth_rotate: true, public_any: false });
    });
  });

  describe('nickname suggestions', () => {
    it('offers up to 3 free nicknames that pass the filter', async () => {
      const c = await newClass('Suggest test');
      await join(c.class_code, 'Asha');
      await join(c.class_code, 'asha2'); // taken, so never suggested
      const suggestions = await suggestionsFor(c.class_code, 'ASHA');
      expect(suggestions).toEqual(['ASHA3', 'ASHA4', 'ASHA5']);
      for (const s of suggestions) {
        const [row] = await db.sql`
          select public.nickname_problem(${s}) as problem,
                 exists (select 1 from students where class_id = ${c.id} and lower(nickname) = lower(${s})) as taken`;
        expect(row, s).toEqual({ problem: null, taken: false });
      }
      // And one of them really can be used.
      await expect(join(c.class_code, suggestions[0]!)).resolves.toMatchObject({ class_id: c.id });
    });

    it('trims long names to 20 characters, and works for Hindi names', async () => {
      const c = await newClass('Suggest long');
      await join(c.class_code, 'Abcdefghij Klmnopqrs'); // 20 characters
      const long = await suggestionsFor(c.class_code, 'Abcdefghij Klmnopqrs');
      expect(long).toEqual(['Abcdefghij Klmnopqr2', 'Abcdefghij Klmnopqr3', 'Abcdefghij Klmnopqr4']);
      // A separator left at the cut is trimmed, so no name ends up with a space before the number.
      await join(c.class_code, 'Abcdefghijklmnopqr s');
      expect(await suggestionsFor(c.class_code, 'Abcdefghijklmnopqr s')).toEqual([
        'Abcdefghijklmnopqr2',
        'Abcdefghijklmnopqr3',
        'Abcdefghijklmnopqr4',
      ]);
      await join(c.class_code, 'सितारा');
      expect(await suggestionsFor(c.class_code, 'सितारा')).toEqual(['सितारा2', 'सितारा3', 'सितारा4']);
    });

    it('skips numbers the filter refuses, and may suggest none', async () => {
      const c = await newClass('Suggest digits');
      // 3 digits + 2 more = 5 digits, which reads as a phone number: only 2..9 are suggested.
      await join(c.class_code, 'Ravi123');
      expect(await suggestionsFor(c.class_code, 'Ravi123')).toEqual(['Ravi1232', 'Ravi1233', 'Ravi1234']);
      // 4 digits: every suffix makes 5 or more.
      await join(c.class_code, 'Ab1234');
      expect(await suggestionsFor(c.class_code, 'Ab1234')).toEqual([]);
    });
  });

  describe('join_open', () => {
    it('refuses new students with class_closed when a facilitator closes the class', async () => {
      const c = await newClass('Closing test');
      const before = await join(c.class_code, 'Early Bird');
      const closed = await db.asUser(
        facilitator,
        (tx) => tx`update classes set join_open = false where id = ${c.id} returning join_open`,
      );
      expect(closed).toEqual([{ join_open: false }]);

      await expect(join(c.class_code, 'Late Comer')).rejects.toMatchObject({ code: 'PT403', message: 'class_closed' });
      // Same order as before: the nickname is checked before the class is looked up.
      await expect(join(c.class_code, 'x')).rejects.toMatchObject({ code: 'PT422', message: 'nickname_invalid' });
      await expect(join('ZZZZZZZZ', 'Late Comer')).rejects.toMatchObject({ message: 'class_not_found' });
      // Students already in the class keep syncing.
      expect(await push(before)).toEqual({ accepted: 1, rejected: [] });

      await db.asUser(facilitator, (tx) => tx`update classes set join_open = true where id = ${c.id}`);
      await expect(join(c.class_code, 'Late Comer')).resolves.toMatchObject({ class_id: c.id });
    });

    it('defaults to open, and only the owning facilitator can change it', async () => {
      const [row] = await db.sql`select join_open from classes where id = ${cls.id}`;
      expect(row).toEqual({ join_open: true });
      const sneaky = await db.asUser(
        otherFacilitator,
        (tx) => tx`update classes set join_open = false where id = ${cls.id} returning id`,
      );
      expect(sneaky).toEqual([]);
      await expect(db.asAnon((tx) => tx`update classes set join_open = false where id = ${cls.id}`)).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  describe('rotate_class_code', () => {
    const rotate = (userId: string, classId: string) =>
      db.asUser(userId, async (tx) => (await tx`select rotate_class_code(${classId}) as code`)[0]!.code as string);

    it('gives the owner a fresh code; the old one stops working and students keep syncing', async () => {
      const c = await newClass('Leaky class');
      const student = await join(c.class_code, 'Before Leak');
      const code = await rotate(facilitator, c.id);
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
      expect(code).not.toBe(c.class_code);
      const [row] = await db.sql`select class_code from classes where id = ${c.id}`;
      expect(row).toEqual({ class_code: code });

      await expect(join(c.class_code, 'After Leak')).rejects.toMatchObject({
        code: 'PT404',
        message: 'class_not_found',
      });
      await expect(join(code, 'After Leak')).resolves.toMatchObject({ class_id: c.id });
      expect(await push(student)).toEqual({ accepted: 1, rejected: [] });
    });

    it('refuses everyone else with class_not_found, so no id is confirmed', async () => {
      const c = await newClass('Not yours');
      const notFound = { code: 'PT404', message: 'class_not_found' };
      await expect(rotate(otherFacilitator, c.id)).rejects.toMatchObject(notFound);
      await expect(rotate(otherFacilitator, randomUUID())).rejects.toMatchObject(notFound);
      // An owner who is no longer on the staff allowlist.
      const former = await db.createFacilitator(undefined, false);
      const [orphan] = await db.sql`insert into classes (name, facilitator_id) values ('Orphan', ${former}) returning id`;
      await expect(rotate(former, orphan!.id as string)).rejects.toMatchObject(notFound);

      await expect(db.asAnon((tx) => tx`select rotate_class_code(${c.id})`)).rejects.toThrow(/permission denied/);
      const [row] = await db.sql`select class_code from classes where id = ${c.id}`;
      expect(row).toEqual({ class_code: c.class_code });
    });
  });
});
