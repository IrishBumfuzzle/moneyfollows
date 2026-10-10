import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameResponse, GameState, View, type Action } from '@paisa/contracts';
import { hashSeed, newGame, step } from '@paisa/engine';
import { schema } from '@paisa/db';
import { loadContentStore } from '../src/content-store';
import { bearer, FIXTURES, join, seedOrg, setup, type Harness } from './helpers';

type Game = ReturnType<typeof GameResponse.parse>;

describe('game API', () => {
  let h: Harness;
  let token: string;
  let anonId: string;
  beforeAll(async () => {
    h = await setup();
    const { cls } = await seedOrg(h.db);
    ({ token, profile: { anonId } } = await join(h, cls.classCode, 'Player'));
  });
  afterAll(() => h.close());

  const act = async (gameId: string, action: Action) => {
    const res = await h.app.inject({ method: 'POST', url: `/v1/games/${gameId}/actions`, headers: bearer(token), payload: action });
    return { status: res.statusCode, body: res.json() };
  };

  it('starts a game and returns the first card', async () => {
    const res = await h.app.inject({ method: 'POST', url: '/v1/games', headers: bearer(token), payload: { personaId: 'sana', level: 2 } });
    expect(res.statusCode).toBe(200);
    const game: Game = GameResponse.parse(res.json());
    expect(game.view.kind).toBe('card');
    expect(game.view.hud).toMatchObject({ month: 1, week: 1, rewindTokens: 3 });
    // Effects never reach the client before a choice.
    expect(JSON.stringify(game.view)).not.toContain('effects');
  });

  it('checkpoint 1: four weeks with one rewind match an engine-only run with the same seed', async () => {
    const start = GameResponse.parse(
      (await h.app.inject({ method: 'POST', url: '/v1/games', headers: bearer(token), payload: { personaId: 'sana', level: 2 } })).json(),
    );
    const [save] = await h.db.select().from(schema.gameSaves).where(eq(schema.gameSaves.id, start.gameId));
    // Second game for this profile, so the seed counter is 1.
    expect(save!.seed).toBe(hashSeed(anonId, 'sana', '1'));

    const content = loadContentStore(FIXTURES, 'hyderabad', 'dev').game;
    let local = newGame({ personaId: 'sana', level: 2, seed: save!.seed }, content);
    expect(start.view).toEqual(local.view);

    let view: View = start.view;
    let rewound = false;
    let decisions = 0;
    let localEvents = local.events.length;
    while (!(view.kind === 'month_end')) {
      let action: Action;
      if (view.kind === 'card') action = { type: 'choose', choiceId: view.card.choices[0]!.id };
      else if (view.kind === 'consequence' && !rewound) {
        action = { type: 'rewind' };
        rewound = true;
      } else action = { type: 'advance' };
      const r = await act(start.gameId, action);
      expect(r.status).toBe(200);
      local = step(local.state, action, content);
      localEvents += local.events.length;
      expect(r.body.view).toEqual(local.view);
      view = View.parse(r.body.view);
      if (action.type === 'choose') decisions += 1;
    }

    const [after] = await h.db.select().from(schema.gameSaves).where(eq(schema.gameSaves.id, start.gameId));
    expect(GameState.parse(after!.state)).toEqual(local.state);
    expect(after!.score).toBe(local.state.scores.at(-1));

    const events = await h.db.select().from(schema.events).where(eq(schema.events.profileId, anonId));
    const types = events.map((e) => e.type);
    expect(types).toContain('rewind_used');
    expect(types.filter((t) => t === 'decision_made').length).toBe(decisions);

    const live = await h.db
      .select()
      .from(schema.decisionEvents)
      .where(and(eq(schema.decisionEvents.profileId, anonId), eq(schema.decisionEvents.rewound, false)));
    const rewoundRows = await h.db
      .select()
      .from(schema.decisionEvents)
      .where(and(eq(schema.decisionEvents.profileId, anonId), eq(schema.decisionEvents.rewound, true)));
    expect(rewoundRows.length).toBe(1);
    expect(live.length).toBe(decisions - 1);
    expect(localEvents).toBeGreaterThan(0);
  });

  it('maps engine errors to 4xx and hides other profiles’ games', async () => {
    const game = GameResponse.parse(
      (await h.app.inject({ method: 'POST', url: '/v1/games', headers: bearer(token), payload: { personaId: 'ravi' } })).json(),
    );
    expect((await act(game.gameId, { type: 'advance' })).body.error).toBe('invalid_action');
    expect((await act(game.gameId, { type: 'rewind' })).body.error).toBe('no_rewind');
    expect((await act(game.gameId, { type: 'choose', choiceId: 'zz' })).status).toBe(400);

    const { cls } = await seedOrg(h.db);
    const other = await join(h, cls.classCode, 'Someone');
    const res = await h.app.inject({ method: 'GET', url: `/v1/games/${game.gameId}`, headers: bearer(other.token) });
    expect(res.statusCode).toBe(404);
  });

  it('lists games and reloads the current view', async () => {
    const list = await h.app.inject({ method: 'GET', url: '/v1/games', headers: bearer(token) });
    expect(list.json().length).toBe(3);
    const first = list.json()[0];
    const res = await h.app.inject({ method: 'GET', url: `/v1/games/${first.gameId}`, headers: bearer(token) });
    expect(GameResponse.parse(res.json()).view.kind).toBeDefined();
  });
});
