import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContentPack, PackManifest, Projection, QuizResult, QuizStartResponse } from '@paisa/contracts';
import { bearer, join, seedOrg, setup, type Harness } from './helpers';

describe('quizzes, content packs and tools', () => {
  let h: Harness;
  let token: string;
  beforeAll(async () => {
    h = await setup();
    const { cls } = await seedOrg(h.db);
    token = (await join(h, cls.classCode, 'Quizzer')).token;
  });
  afterAll(() => h.close());

  it('runs a baseline quiz without sending answers to the phone, and scores it once', async () => {
    const start = await h.app.inject({ method: 'POST', url: '/v1/quizzes/baseline/start', headers: bearer(token), payload: {} });
    const quiz = QuizStartResponse.parse(start.json());
    expect(quiz.questions.length).toBe(5);
    expect(start.body).not.toContain('"answer"');
    expect(start.body).not.toContain('explanation');

    const answers = Object.fromEntries(quiz.questions.map((q) => [q.id, 0]));
    const submit = await h.app.inject({ method: 'POST', url: `/v1/quizzes/${quiz.attemptId}/submit`, headers: bearer(token), payload: { answers } });
    const result = QuizResult.parse(submit.json());
    expect(result.total).toBe(5);
    expect(result.feedback.length).toBe(5);

    const again = await h.app.inject({ method: 'POST', url: `/v1/quizzes/${quiz.attemptId}/submit`, headers: bearer(token), payload: { answers } });
    expect(again.json().error).toBe('already_submitted');
  });

  it('needs a pillar for module quizzes and rejects unknown kinds', async () => {
    expect((await h.app.inject({ method: 'POST', url: '/v1/quizzes/module/start', headers: bearer(token), payload: {} })).statusCode).toBe(400);
    const ok = await h.app.inject({ method: 'POST', url: '/v1/quizzes/module/start', headers: bearer(token), payload: { pillar: 'stay_safe' } });
    expect(QuizStartResponse.parse(ok.json()).questions.every((q) => q.pillar === 'stay_safe')).toBe(true);
    expect((await h.app.inject({ method: 'POST', url: '/v1/quizzes/final/start', headers: bearer(token), payload: {} })).statusCode).toBe(404);
  });

  it('serves a manifest and immutable packs with ETags', async () => {
    const manifest = PackManifest.parse((await h.app.inject({ method: 'GET', url: '/v1/content/manifest?lang=en' })).json());
    expect(manifest.packs.map((p) => p.language)).toEqual(['en']);
    const entry = manifest.packs[0]!;
    const res = await h.app.inject({ method: 'GET', url: entry.url });
    expect(res.statusCode).toBe(200);
    expect(res.headers['etag']).toBe(`"${entry.sha256}"`);
    expect(ContentPack.parse(res.json()).manifest.language).toBe('en');
    const cached = await h.app.inject({ method: 'GET', url: entry.url, headers: { 'if-none-match': `"${entry.sha256}"` } });
    expect(cached.statusCode).toBe(304);
    expect((await h.app.inject({ method: 'GET', url: '/v1/content/manifest?region=mars' })).statusCode).toBe(404);
  });

  it('projects growth as a range with its assumptions, never one number', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/v1/tools/projection', payload: { monthlyAmount: 500, years: [10] } });
    const p = Projection.parse(res.json());
    const point = p.points[0]!;
    expect(point.invested).toBe(60_000);
    expect(point.bad).toBeLessThan(point.average);
    expect(point.average).toBeLessThan(point.good);
    expect(p.assumptions.note).toMatch(/^t:/);
  });

  it('publishes an OpenAPI document covering every route', async () => {
    const doc = (await h.app.inject({ method: 'GET', url: '/v1/openapi.json' })).json();
    expect(doc.openapi).toBe('3.1.0');
    for (const path of ['/v1/join', '/v1/games/{id}/actions', '/v1/sync', '/v1/classes/{id}/progress', '/v1/reports/learning-gains']) {
      expect(doc.paths[path], path).toBeDefined();
    }
  });
});
