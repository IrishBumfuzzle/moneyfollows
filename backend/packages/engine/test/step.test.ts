import { describe, expect, it } from 'vitest';
import { GameState, StepResult, type Action, type GameContent, type Scenario } from '@paisa/contracts';
import { EngineError, currentView, newGame, step, type EngineErrorCode } from '../src';
import { clone, content, persona, quiet, scenario, variant, ZERO_EVENTS, ALWAYS_EVENTS } from './fixtures';
import { autoplay, deepFreeze, firstChoice, start, withCard } from './helpers';

function code(fn: () => unknown): EngineErrorCode | 'no error' {
  try {
    fn();
  } catch (e) {
    if (e instanceof EngineError) return e.code;
    throw e;
  }
  return 'no error';
}

const choose = (choiceId: string): Action => ({ type: 'choose', choiceId });
const advance: Action = { type: 'advance' };

/** The fixture pack plus a custom scenario, for tests that need exact effects. */
function withScenario(s: Scenario, base: GameContent = quiet): GameContent {
  return variant((c) => {
    Object.assign(c, clone(base));
    c.scenarios.push(s);
  });
}
const custom = (id: string, effects: Scenario['choices'][number]['effects'], rating?: 'best' | 'ok' | 'risky', pillar: Scenario['pillar'] = 'plan_budget'): Scenario => ({
  id,
  pillar,
  concept: 'custom_concept',
  personas: ['ravi', 'sana'],
  difficulty: 1,
  text: 't:custom.story',
  choices: [
    { id: 'a', label: 't:custom.a', effects, lesson: 't:custom.lesson', ...(rating ? { rating } : {}) },
    { id: 'b', label: 't:custom.b', effects: {}, lesson: 't:custom.lesson_b' },
  ],
});

describe('newGame', () => {
  it('starts month 1 week 1 with payday done and a card on screen', () => {
    const r = start(quiet, 'sana', 2, 42);
    expect(StepResult.safeParse(r).success).toBe(true);
    const s = r.state;
    expect([s.month, s.week, s.phase, s.decided, s.debt, s.xp]).toEqual([1, 1, 'card', false, 0, 0]);
    expect(s.rewindTokens).toBe(3);
    expect(s.snapshot).toBeNull();
    expect(s.report).toBeNull();
    expect(s.lastOutcome).toBeNull();
    expect(s.card?.kind).toBe('decision');
    // sana: starts 500/200/1000/300, income 4000 split 50/20/20/10, minus 1200 fixed costs from needs.
    expect(s.jars).toEqual({ needs: 500 + 2000 - 1200, wants: 200 + 800, goals: 1000 + 800, savings: 300 + 400 });
    expect(s.monthStart).toEqual({ jars: s.jars, debt: 0, income: 4000 });
    expect(r.events).toEqual([{ type: 'persona_selected', payload: { personaId: 'sana', level: 2 } }]);
    expect(r.view.kind).toBe('card');
    expect(r.view.notices.map((n) => n.kind)).toEqual(['payday', 'fixed_costs']);
  });

  it('reports payday and fixed cost notices', () => {
    const [payday, fixed] = start(quiet, 'sana').state.notices;
    expect(payday).toEqual({ kind: 'payday', amount: 4000, deltas: { needs: 2000, wants: 800, goals: 800, savings: 400 } });
    expect(fixed).toEqual({ kind: 'fixed_costs', amount: 1200, deltas: { needs: -1200 } });
  });

  it('throws unknown_persona, invalid_action and no_cards', () => {
    expect(code(() => start(content, 'kiran'))).toBe('unknown_persona');
    expect(code(() => newGame({ personaId: 'sana', level: 5, seed: 1 }, content))).toBe('invalid_action');
    expect(code(() => newGame({ personaId: 'sana', level: 1, seed: 1.5 }, content))).toBe('invalid_action');
    const noCards = variant((c) => {
      c.scenarios = [];
    });
    expect(code(() => start(noCards, 'sana'))).toBe('no_cards');
  });

  it('splits income by the persona split, remainder to needs, and keeps to whole rupees', () => {
    const c = variant((x) => {
      x.tuning.eventChance = ZERO_EVENTS;
      const sana = x.personas.find((p) => p.id === 'sana')!;
      sana.income = { pattern: 'steady', amount: 1001 };
      sana.fixedCosts = 0;
      sana.startingJars = { needs: 0, wants: 0, goals: 0, savings: 0 };
      sana.split = { needs: 33, wants: 33, goals: 17, savings: 17 };
    });
    const s = start(c, 'sana').state;
    expect(s.jars).toEqual({ needs: 331, wants: 330, goals: 170, savings: 170 });
    // No fixed costs, so no fixed_costs notice.
    expect(s.notices.map((n) => n.kind)).toEqual(['payday']);
  });

  it('borrows when fixed costs exceed the needs jar', () => {
    const c = variant((x) => {
      x.tuning.eventChance = ZERO_EVENTS;
      const sana = x.personas.find((p) => p.id === 'sana')!;
      sana.fixedCosts = 3000;
      sana.income = { pattern: 'steady', amount: 1000 };
      sana.startingJars = { needs: 0, wants: 0, goals: 0, savings: 0 };
    });
    const s = start(c, 'sana').state;
    // 500 lands in needs, 3000 due: 2500 borrowed.
    expect(s.jars.needs).toBe(0);
    expect(s.debt).toBe(2500);
    expect(s.notices).toContainEqual({ kind: 'fixed_costs', amount: 3000, deltas: { needs: -500 }, debt: 2500 });
    expect(s.notices).toContainEqual({ kind: 'borrowed', amount: 2500 });
    expect(s.monthStart.debt).toBe(2500);
  });

  it('draws irregular income within range from the seed', () => {
    const incomes = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const c = variant((x) => {
        x.tuning.eventChance = ZERO_EVENTS;
        x.personas.find((p) => p.id === 'sana')!.income = { pattern: 'irregular', min: 2000, max: 3000, step: 500 };
      });
      const s = start(c, 'sana', 2, seed).state;
      expect([2000, 2500, 3000]).toContain(s.monthStart.income);
      incomes.add(s.monthStart.income);
      // The same seed gives the same income.
      expect(start(c, 'sana', 2, seed).state.monthStart.income).toBe(s.monthStart.income);
    }
    expect(incomes.size).toBe(3);
  });

  it('uses the seasonal multiplier for ravi in month 1', () => {
    expect(start(quiet, 'ravi', 1).state.monthStart.income).toBe(3000);
  });

  it('falls back to a decision when the event deck is empty, with the same rng use', () => {
    const asKiran = (chance: GameContent['tuning']['eventChance']) =>
      variant((x) => {
        x.tuning.eventChance = chance;
        x.personas.push({ ...persona('ravi'), id: 'kiran' });
      });
    const withChance = start(asKiran(ALWAYS_EVENTS), 'kiran', 1).state;
    const without = start(asKiran(ZERO_EVENTS), 'kiran', 1).state;
    expect(withChance.card?.kind).toBe('decision');
    expect(withChance.card).toEqual(without.card);
    expect(withChance.rng).toBe(without.rng);
  });

  it('deals an event first when the chance says so', () => {
    const s = start(variant((x) => { x.tuning.eventChance = ALWAYS_EVENTS; }), 'sana', 2).state;
    expect(s.card?.kind).toBe('event');
    expect(s.decided).toBe(false);
  });
});

describe('choose', () => {
  const base = start(quiet, 'sana', 2, 1).state;

  it('applies effects, records the decision, and moves to the consequence', () => {
    const s0 = withCard(base, 'decision', 'budget.recharge.01');
    const r = step(s0, choose('b'), quiet);
    const s = r.state;
    expect(s.phase).toBe('consequence');
    expect(s.decided).toBe(true);
    expect(s.jars.needs).toBe(s0.jars.needs - 199);
    expect(s.jars.wants).toBe(s0.jars.wants - 599);
    expect(s.seen).toEqual(['budget.recharge.01']);
    expect(s.decisions).toEqual([
      { month: 1, week: 1, cardId: 'budget.recharge.01', cardKind: 'decision', pillar: 'plan_budget', concept: 'needs_vs_wants', choiceId: 'b', rating: 'risky' },
    ]);
    expect(s.xp).toBe(10);
    expect(s.lessons).toEqual(['t:lesson.wants_cost']);
    expect(s.lastOutcome).toEqual({
      cardId: 'budget.recharge.01',
      cardKind: 'decision',
      choiceId: 'b',
      applied: { deltas: { needs: -199, wants: -599 }, debt: 0, borrowed: 0 },
      lesson: 't:lesson.wants_cost',
      queued: 1,
    });
    expect(s.pending).toEqual([{ due: 3, sourceId: 'budget.recharge.01', deltas: { wants: -150 }, debt: 0, text: 't:budget.recharge.01.b.later' }]);
    expect(r.events).toEqual([
      { type: 'decision_made', payload: { scenarioId: 'budget.recharge.01', choiceId: 'b', pillar: 'plan_budget', cardKind: 'decision', month: 1, week: 1, rating: 'risky' } },
    ]);
    expect(r.view.kind).toBe('consequence');
    expect(r.view.hud.canRewind).toBe(true);
  });

  it('adds the best-choice xp bonus and dedupes lessons', () => {
    const s0 = withCard(base, 'decision', 'budget.recharge.01');
    const r1 = step(s0, choose('a'), quiet);
    expect(r1.state.xp).toBe(15);
    const r2 = step(withCard({ ...r1.state, phase: 'card' }, 'decision', 'budget.recharge.01'), choose('a'), quiet);
    expect(r2.state.lessons).toEqual(['t:lesson.needs_first']);
    expect(r2.state.seen).toEqual(['budget.recharge.01', 'budget.recharge.01']);
  });

  it('snapshots the full state without nesting snapshots', () => {
    const r1 = step(withCard(base, 'decision', 'budget.recharge.01'), choose('a'), quiet);
    const snap = r1.state.snapshot!;
    expect(snap).toEqual((({ snapshot: _s, ...rest }) => rest)(withCard(base, 'decision', 'budget.recharge.01')));
    expect('snapshot' in snap).toBe(false);
    const r2 = step(withCard({ ...r1.state, phase: 'card' }, 'decision', 'safe.otp.01'), choose('a'), quiet);
    expect(JSON.stringify(r2.state.snapshot)).not.toContain('"snapshot"');
  });

  it('sets flags once and drops delayed effects that land after the year ends', () => {
    const s0 = withCard({ ...base, flags: ['shared_otp'] }, 'decision', 'safe.otp.01');
    const r = step(s0, choose('b'), quiet);
    expect(r.state.flags).toEqual(['shared_otp']);
    expect(r.state.jars.savings).toBe(base.jars.savings - 1500 < 0 ? 0 : base.jars.savings - 1500);
    // loan_app in week 47 of 48 queues a 4-week effect that would land after the year, so it is dropped.
    const late = withCard({ ...base, month: 12, week: 3 }, 'decision', 'safe.loan_app.01');
    const lr = step(late, choose('a'), quiet);
    expect(lr.state.pending).toEqual([]);
    expect(lr.state.lastOutcome?.queued).toBe(0);
    // In week 44 (month 11 week 4) it lands in week 48, the last week, so it is kept.
    const ok = step(withCard({ ...base, month: 11, week: 4 }, 'decision', 'safe.loan_app.01'), choose('a'), quiet);
    expect(ok.state.pending.map((p) => p.due)).toEqual([48]);
    expect(ok.state.debt).toBe(2000);
  });

  it('borrows when a choice costs more than a jar holds, and says so', () => {
    const c = withScenario(custom('big.spend.01', { savings: -5000 }));
    const s0 = withCard(base, 'decision', 'big.spend.01');
    const r = step(s0, choose('a'), c);
    expect(r.state.jars.savings).toBe(0);
    expect(r.state.debt).toBe(5000 - s0.jars.savings);
    expect(r.state.lastOutcome?.applied).toEqual({ deltas: { savings: -s0.jars.savings }, debt: 5000 - s0.jars.savings, borrowed: 5000 - s0.jars.savings });
    expect(r.state.notices).toContainEqual({ kind: 'borrowed', amount: 5000 - s0.jars.savings });
    for (const v of Object.values(r.state.jars)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it('never takes debt below zero when a repayment is bigger than the debt', () => {
    const c = withScenario(custom('repay.01', { needs: -100, debt: -5000 }));
    const r = step(withCard(base, 'decision', 'repay.01'), choose('a'), c);
    expect(r.state.debt).toBe(0);
    expect(r.state.jars.needs).toBe(base.jars.needs - 100);
    expect(r.state.lastOutcome?.applied.debt).toBe(0);
  });

  it('emits event_triggered for events and leaves the week undecided', () => {
    const s0 = withCard(base, 'event', 'event.screen_crack.01');
    const r = step(s0, choose('a'), quiet);
    expect(r.state.decided).toBe(false);
    expect(r.state.lastOutcome?.cardKind).toBe('event');
    expect(r.events.map((e) => e.type)).toEqual(['decision_made', 'event_triggered']);
    expect(r.events[1]!.payload).toEqual({ eventId: 'event.screen_crack.01' });
    expect(r.state.decisions[0]).toMatchObject({ cardKind: 'event', pillar: 'save_manage' });
  });

  it('never exposes effects, lessons or ratings in the card view', () => {
    const v = currentView(withCard(base, 'decision', 'budget.recharge.01'), quiet);
    expect(v.kind).toBe('card');
    if (v.kind !== 'card') return;
    expect(v.card.choices).toEqual([
      { id: 'a', label: 't:recharge_basic', icon: 'phone' },
      { id: 'b', label: 't:recharge_plus_earphones', icon: 'headphones' },
    ]);
    const text = JSON.stringify(v);
    for (const word of ['effects', 'rating', 'risky', 'delayed', 'lesson']) expect(text).not.toContain(word);
  });

  it('flags investing cards as assumptions unless the scenario says otherwise', () => {
    const inv = custom('invest.01', {}, 'best', 'understand_investing');
    const quietInv = withScenario(inv);
    const v1 = currentView(withCard(base, 'decision', 'invest.01'), quietInv);
    const v2 = currentView(withCard(base, 'decision', 'budget.recharge.01'), quietInv);
    const v3 = currentView(withCard(base, 'decision', 'invest.02'), withScenario({ ...inv, id: 'invest.02', assumption: false }));
    if (v1.kind !== 'card' || v2.kind !== 'card' || v3.kind !== 'card') throw new Error('expected cards');
    expect(v1.card.assumption).toBe(true);
    expect(v2.card.assumption).toBe(false);
    expect(v3.card.assumption).toBe(false);
    const explicit = withScenario({ ...custom('safe.x.01', {}), assumption: true });
    const v4 = currentView(withCard(base, 'decision', 'safe.x.01'), explicit);
    if (v4.kind === 'card') expect(v4.card.assumption).toBe(true);
  });
});

describe('goal milestones', () => {
  const base = start(quiet, 'sana', 2, 1).state; // goals 1800 of 15000 (12%)

  it('notices each 25/50/75/100% mark once, in one go if several are crossed', () => {
    const c = withScenario(custom('goal.big.01', { goals: 11000 }));
    const r = step(withCard(base, 'decision', 'goal.big.01'), choose('a'), c);
    // 12800 / 15000 = 85%
    expect(r.state.milestones).toEqual([25, 50, 75]);
    expect(r.state.notices.filter((n) => n.kind === 'goal_milestone').map((n) => n.value)).toEqual([25, 50, 75]);
    const again = step(withCard({ ...r.state, phase: 'card' }, 'decision', 'goal.big.01'), choose('a'), c);
    // 100%+
    expect(again.state.milestones).toEqual([25, 50, 75, 100]);
    expect(again.state.notices.filter((n) => n.kind === 'goal_milestone').map((n) => n.value)).toEqual([100]);
    expect(again.state.badges).toContain('goal_getter');
    expect(again.view.hud.goal.progress).toBe(1);
  });

  it('does not repeat a milestone after the jar drops and recovers', () => {
    const c = withScenario(custom('goal.up.01', { goals: 3000 }));
    const r1 = step(withCard(base, 'decision', 'goal.up.01'), choose('a'), c);
    expect(r1.state.milestones).toEqual([25]);
    const dropped = { ...r1.state, phase: 'card' as const, jars: { ...r1.state.jars, goals: 0 } };
    const r2 = step(withCard(dropped, 'decision', 'goal.up.01'), choose('a'), c);
    expect(r2.state.notices.filter((n) => n.kind === 'goal_milestone')).toEqual([]);
  });
});

describe('badges', () => {
  const base = start(quiet, 'sana', 2, 1).state;
  const best = (pillar: GameState['decisions'][number]['pillar']) => ({
    month: 1, week: 1, cardId: 'x.01', cardKind: 'decision' as const, pillar, concept: 'c', choiceId: 'a', rating: 'best' as const,
  });

  it('scam_spotter after 3 best picks in stay_safe, once only', () => {
    const s0 = withCard({ ...base, decisions: [best('stay_safe'), best('stay_safe')] }, 'decision', 'safe.otp.01');
    const r = step(s0, choose('a'), quiet);
    expect(r.state.badges).toEqual(['scam_spotter']);
    expect(r.state.notices).toContainEqual({ kind: 'badge', value: 'scam_spotter' });
    expect(r.events).toContainEqual({ type: 'badge_earned', payload: { badgeId: 'scam_spotter' } });
    const r2 = step(withCard({ ...r.state, phase: 'card' }, 'decision', 'safe.otp.01'), choose('a'), quiet);
    expect(r2.state.badges).toEqual(['scam_spotter']);
    expect(r2.events.map((e) => e.type)).toEqual(['decision_made']);
  });

  it('does not count ok or risky picks', () => {
    const s0 = withCard({ ...base, decisions: [best('stay_safe'), best('stay_safe')] }, 'decision', 'safe.otp.01');
    expect(step(s0, choose('b'), quiet).state.badges).toEqual([]);
  });

  it('patient_investor after 2 best picks in understand_investing', () => {
    const c = withScenario(custom('invest.01', {}, 'best', 'understand_investing'));
    const s0 = withCard({ ...base, decisions: [best('understand_investing')] }, 'decision', 'invest.01');
    expect(step(s0, choose('a'), c).state.badges).toEqual(['patient_investor']);
    expect(step(withCard(base, 'decision', 'invest.01'), choose('a'), c).state.badges).toEqual([]);
  });

  it('the month-end badges: rainy_day_ready, budget_boss and goal_getter', () => {
    const rich: GameState = {
      ...base,
      phase: 'consequence',
      decided: true,
      week: 4,
      lastOutcome: { cardId: 'x.01', cardKind: 'decision', choiceId: 'a', applied: { deltas: {}, debt: 0, borrowed: 0 }, lesson: 't:l', queued: 0 },
      jars: { needs: 0, wants: 0, goals: 15000, savings: 3200 },
      monthStart: { jars: { needs: 0, wants: 0, goals: 0, savings: 0 }, debt: 0, income: 4000 },
    };
    const r = step(rich, advance, quiet);
    expect(r.state.phase).toBe('month_end');
    expect(r.state.report?.score).toBe(100);
    expect([...r.state.badges].sort()).toEqual(['budget_boss', 'goal_getter', 'rainy_day_ready']);
    expect(r.events.map((e) => e.type)).toEqual(['badge_earned', 'badge_earned', 'badge_earned']);
  });

  it('no budget_boss with debt, and rainy_day_ready needs savings >= fixed costs', () => {
    const state: GameState = {
      ...base,
      phase: 'consequence',
      decided: true,
      week: 4,
      lastOutcome: { cardId: 'x.01', cardKind: 'decision', choiceId: 'a', applied: { deltas: {}, debt: 0, borrowed: 0 }, lesson: 't:l', queued: 0 },
      jars: { needs: 0, wants: 0, goals: 15000, savings: 1199 },
      debt: 10,
      monthStart: { jars: { needs: 0, wants: 0, goals: 0, savings: 0 }, debt: 0, income: 4000 },
    };
    const r = step(state, advance, quiet);
    expect(r.state.badges).toEqual(['goal_getter']);
  });
});

describe('rewind', () => {
  const s0 = withCard(start(quiet, 'sana', 2, 5).state, 'decision', 'budget.recharge.01');

  it('restores the exact state, including rng, and spends a token', () => {
    const chosen = step(s0, choose('b'), quiet);
    const r = step(chosen.state, { type: 'rewind' }, quiet);
    expect(r.state).toEqual({ ...s0, rewindTokens: 2, snapshot: null, notices: [] });
    expect(r.state.rng).toBe(s0.rng);
    expect(r.view.kind).toBe('card');
    expect(r.view.notices).toEqual([]);
    expect(r.events).toEqual([{ type: 'rewind_used', payload: { scenarioId: 'budget.recharge.01', choiceId: 'b' } }]);
    expect(r.view.hud.canRewind).toBe(false);
  });

  it('lets the player re-choose from identical state: the same choice gives the same result', () => {
    const first = step(s0, choose('b'), quiet);
    const back = step(first.state, { type: 'rewind' }, quiet).state;
    const again = step(back, choose('b'), quiet);
    expect({ ...again.state, rewindTokens: 0, snapshot: null }).toEqual({ ...first.state, rewindTokens: 0, snapshot: null });
    const other = step(back, choose('a'), quiet);
    expect(other.state.jars.wants).toBe(s0.jars.wants);
  });

  it('restores xp, flags, pending and seen', () => {
    const c = step(withCard(s0, 'decision', 'safe.otp.01'), choose('b'), quiet);
    expect(c.state.flags).toEqual(['shared_otp']);
    const back = step(c.state, { type: 'rewind' }, quiet).state;
    expect(back.flags).toEqual([]);
    expect(back.xp).toBe(0);
    expect(back.seen).toEqual([]);
    expect(back.decisions).toEqual([]);
  });

  it('allows three rewinds a month and then throws no_rewind', () => {
    let s = step(s0, choose('b'), quiet).state;
    for (let i = 0; i < 3; i++) {
      s = step(s, { type: 'rewind' }, quiet).state;
      expect(s.rewindTokens).toBe(2 - i);
      s = step(s, choose('b'), quiet).state;
    }
    expect(s.rewindTokens).toBe(0);
    expect(s.snapshot).not.toBeNull();
    expect(code(() => step(s, { type: 'rewind' }, quiet))).toBe('no_rewind');
    expect(step(s, advance, quiet).view.hud.canRewind).toBe(false);
  });

  it('throws no_rewind with no snapshot, and the snapshot clears when the player moves on', () => {
    expect(code(() => step(s0, { type: 'rewind' }, quiet))).toBe('no_rewind');
    const chosen = step(s0, choose('a'), quiet);
    expect(chosen.state.snapshot).not.toBeNull();
    const moved = step(chosen.state, advance, quiet);
    expect(moved.state.snapshot).toBeNull();
    expect(code(() => step(moved.state, { type: 'rewind' }, quiet))).toBe('no_rewind');
  });

  it('refills the tokens at the next payday', () => {
    const chosen = step(s0, choose('b'), quiet).state;
    const used = step(chosen, { type: 'rewind' }, quiet).state;
    expect(used.rewindTokens).toBe(2);
    const monthEnd = autoplay(quiet, { state: used, view: currentView(used, quiet), events: [] }, firstChoice, (r) => r.state.phase === 'month_end');
    const next = step(monthEnd.state, { type: 'advance' }, quiet);
    expect(next.state.month).toBe(2);
    expect(next.state.rewindTokens).toBe(3);
  });
});

describe('advance', () => {
  it('walks four weeks to month end, with exactly one card a week when events are off', () => {
    let r = start(quiet, 'sana', 2, 3);
    const cards: string[] = [];
    for (let week = 1; week <= 4; week++) {
      expect(r.state.week).toBe(week);
      expect(r.state.phase).toBe('card');
      cards.push(r.state.card!.id);
      r = step(r.state, choose(firstChoice(r.view as never, r.state)), quiet);
      expect(r.state.phase).toBe('consequence');
      r = step(r.state, advance, quiet);
    }
    expect(r.state.phase).toBe('month_end');
    expect(r.state.card).toBeNull();
    expect(cards.length).toBe(4);
    expect(r.state.report).not.toBeNull();
    expect(r.state.scores).toEqual([r.state.report!.score]);
    expect(r.state.xp).toBe(4 * 10 + 5 * (r.state.decisions.filter((d) => d.rating === 'best').length) + 20);
    expect(r.view.kind).toBe('month_end');
    expect(r.view.hud.lastScore).toBe(r.state.report!.score);
  });

  it('after an event, shows the weeks decision in the same week', () => {
    const base = start(quiet, 'sana', 2, 3).state;
    const afterEvent = step(withCard(base, 'event', 'event.screen_crack.01'), choose('b'), quiet).state;
    const next = step(afterEvent, advance, quiet);
    expect(next.state.phase).toBe('card');
    expect(next.state.card?.kind).toBe('decision');
    expect(next.state.week).toBe(1);
    expect(next.state.snapshot).toBeNull();
    const decided = step(next.state, choose('a'), quiet).state;
    expect(decided.decided).toBe(true);
    expect(step(decided, advance, quiet).state.week).toBe(2);
  });

  it('month end: a reflection earns xp, a split changes next payday, tokens refill', () => {
    const played = autoplay(quiet, start(quiet, 'sana', 2, 3), firstChoice, (r) => r.state.phase === 'month_end');
    const s = played.state;
    const split = { needs: 70, wants: 10, goals: 10, savings: 10 };
    const r = step(s, { type: 'advance', reflection: 1, split }, quiet);
    expect(r.state.xp).toBe(s.xp + 5);
    expect(r.state.split).toEqual(split);
    expect(r.state.month).toBe(2);
    expect(r.state.week).toBe(1);
    expect(r.state.report).toBeNull();
    expect(r.state.rewindTokens).toBe(3);
    expect(r.state.notices[0]).toEqual({ kind: 'payday', amount: 4000, deltas: { needs: 2800, wants: 400, goals: 400, savings: 400 } });
    expect(r.state.monthStart.income).toBe(4000);
    // monthStart is taken after payday and fixed costs, so it matches the jars right now.
    expect(r.state.monthStart.jars).toEqual(r.state.jars);
  });

  it('skipping the reflection earns no reflection xp', () => {
    const s = autoplay(quiet, start(quiet, 'sana', 2, 3), firstChoice, (r) => r.state.phase === 'month_end').state;
    expect(step(s, advance, quiet).state.xp).toBe(s.xp);
  });

  it('rejects a reflection answer that is not an option', () => {
    const s = autoplay(quiet, start(quiet, 'sana', 2, 3), firstChoice, (r) => r.state.phase === 'month_end').state;
    const n = s.report!.reflection.options.length;
    expect(code(() => step(s, { type: 'advance', reflection: n }, quiet))).toBe('invalid_action');
    expect(code(() => step(s, { type: 'advance', reflection: n - 1 }, quiet))).toBe('no error');
  });

  it('reaches done after the last month end, with a summary', () => {
    const played = autoplay(quiet, start(quiet, 'sana', 2, 3));
    const s = played.state;
    expect(s.phase).toBe('done');
    expect(s.card).toBeNull();
    expect(s.month).toBe(12);
    expect(s.scores.length).toBe(12);
    const v = currentView(s, quiet);
    expect(v.kind).toBe('done');
    if (v.kind !== 'done') return;
    expect(v.summary.scores).toEqual(s.scores);
    expect(v.summary.averageScore).toBe(Math.round(s.scores.reduce((a, b) => a + b, 0) / 12));
    expect(v.summary.decisions).toBe(48);
    expect(v.summary.goalReached).toBe(s.jars.goals >= s.goal.amount);
  });
});

describe('invalid actions', () => {
  const card = start(quiet, 'sana', 2, 3).state;
  const consequence = step(card, choose('a'), quiet).state;
  const done = autoplay(quiet, start(quiet, 'sana', 2, 3)).state;

  it('rejects malformed actions with invalid_action', () => {
    expect(code(() => step(card, { type: 'dance' } as never, quiet))).toBe('invalid_action');
    expect(code(() => step(card, { type: 'choose' } as never, quiet))).toBe('invalid_action');
    expect(code(() => step(card, { type: 'advance', reflection: -1 }, quiet))).toBe('invalid_action');
    expect(code(() => step(card, { type: 'advance', split: { needs: 50, wants: 50, goals: 10, savings: 0 } }, quiet))).toBe('invalid_action');
  });

  it('rejects choose outside the card phase, and unknown choices', () => {
    expect(code(() => step(consequence, choose('a'), quiet))).toBe('invalid_action');
    expect(code(() => step(card, choose('zzz'), quiet))).toBe('unknown_choice');
  });

  it('rejects advance on a card and when done', () => {
    expect(code(() => step(card, advance, quiet))).toBe('invalid_action');
    expect(code(() => step(done, advance, quiet))).toBe('invalid_action');
  });

  it('game_over for choose when done, and no_rewind for rewind', () => {
    expect(code(() => step(done, choose('a'), quiet))).toBe('game_over');
    expect(code(() => step(done, { type: 'rewind' }, quiet))).toBe('no_rewind');
  });

  it('EngineError carries its code and is an Error', () => {
    const e = new EngineError('no_cards', 'boom');
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe('no_cards');
    expect(e.message).toBe('boom');
  });
});

describe('delayed effects', () => {
  const quietBase = start(quiet, 'sana', 2, 9).state;

  /** Plays on with choice b until `stop`, collecting when the loan app's delayed effect lands. */
  function until(from: GameState, stop: (s: GameState) => boolean): { state: GameState; fired: { month: number; week: number; text?: string }[] } {
    let s = from;
    const fired: { month: number; week: number; text?: string }[] = [];
    for (let i = 0; i < 200 && !stop(s); i++) {
      const action: Action = s.phase === 'card' ? choose('b') : advance;
      const r = step(s, action, quiet);
      for (const n of r.state.notices) if (n.kind === 'delayed_effect' && n.text?.startsWith('t:safe.loan_app')) fired.push({ month: r.state.month, week: r.state.week, text: n.text });
      s = r.state;
    }
    return { state: s, fired };
  }

  it('queues a 4-week loan effect and fires it on exactly the due week', () => {
    const s0 = withCard(quietBase, 'decision', 'safe.loan_app.01');
    const chosen = step(s0, choose('a'), quiet).state;
    expect(chosen.pending).toEqual([
      { due: 5, sourceId: 'safe.loan_app.01', deltas: { needs: -1200 }, debt: -1000, text: 't:safe.loan_app.01.a.later' },
      { due: 9, sourceId: 'safe.loan_app.01', deltas: { needs: -1200 }, debt: -1000, text: 't:safe.loan_app.01.a.later2' },
    ]);
    expect(chosen.debt).toBe(2000);
    const { state, fired } = until(chosen, (s) => s.month === 2 && s.week === 1 && s.phase === 'card');
    // Fired when month 2 week 1 began: abs week 5.
    expect(fired).toEqual([{ month: 2, week: 1, text: 't:safe.loan_app.01.a.later' }]);
    expect(state.pending.map((p) => p.due)).toEqual([9]);
    const notice = state.notices.find((n) => n.kind === 'delayed_effect')!;
    expect(notice.debt).toBe(-1000);
    expect(notice.deltas?.needs).toBeLessThanOrEqual(0);
    expect(notice.deltas?.needs).toBeGreaterThanOrEqual(-1200);
  });

  it('fires across a month boundary: queued in week 3, lands in month 2 week 3', () => {
    const s0 = withCard({ ...quietBase, week: 3 }, 'decision', 'safe.loan_app.01');
    const chosen = step(s0, choose('a'), quiet).state;
    expect(chosen.pending[0]!.due).toBe(7);
    const before = until(chosen, (s) => s.month === 2 && s.week === 3);
    // Not fired in weeks before it was due.
    expect(before.fired).toEqual([{ month: 2, week: 3, text: 't:safe.loan_app.01.a.later' }]);
    expect(before.state.pending.map((p) => p.due)).toEqual([11]);
    expect(before.state.notices.find((n) => n.kind === 'delayed_effect' && n.text?.startsWith('t:safe.loan_app'))?.debt).toBe(-1000);
  });

  it('applies the delayed effect to the jars with the wallet rules (borrowing when short)', () => {
    const s: GameState = {
      ...withCard(quietBase, 'decision', 'budget.recharge.01'),
      jars: { needs: 100, wants: 0, goals: 0, savings: 0 },
      pending: [{ due: 2, sourceId: 'x.01', deltas: { needs: -400 }, debt: 0, text: 't:later' }],
      phase: 'consequence',
      decided: true,
      lastOutcome: { cardId: 'x.01', cardKind: 'decision', choiceId: 'a', applied: { deltas: {}, debt: 0, borrowed: 0 }, lesson: 't:l', queued: 0 },
    };
    const r = step(s, advance, quiet);
    expect(r.state.jars.needs).toBe(0);
    expect(r.state.debt).toBe(300);
    expect(r.state.pending).toEqual([]);
    expect(r.state.notices).toContainEqual({ kind: 'delayed_effect', text: 't:later', deltas: { needs: -100 }, debt: 300 });
    expect(r.state.notices).toContainEqual({ kind: 'borrowed', amount: 300 });
  });

  it('fires overdue effects too and leaves future ones queued', () => {
    const s: GameState = {
      ...quietBase,
      phase: 'consequence',
      decided: true,
      lastOutcome: { cardId: 'x.01', cardKind: 'decision', choiceId: 'a', applied: { deltas: {}, debt: 0, borrowed: 0 }, lesson: 't:l', queued: 0 },
      pending: [
        { due: 1, sourceId: 'x.01', deltas: { wants: -10 }, debt: 0, text: 't:old' },
        { due: 9, sourceId: 'x.02', deltas: { wants: -10 }, debt: 0, text: 't:future' },
      ],
    };
    const r = step(s, advance, quiet);
    expect(r.state.pending.map((p) => p.text)).toEqual(['t:future']);
    expect(r.state.notices.filter((n) => n.kind === 'delayed_effect').map((n) => n.text)).toEqual(['t:old']);
  });
});

describe('determinism, purity and serialisation', () => {
  it('same seed and same actions give identical states at every step', () => {
    const a = autoplay(content, start(content, 'ravi', 2, 7));
    const b = autoplay(content, start(content, 'ravi', 2, 7));
    expect(a.actions).toEqual(b.actions);
    expect(a.state).toEqual(b.state);
    expect(a.transcript).toEqual(b.transcript);
  });

  it('different seeds diverge', () => {
    const a = autoplay(content, start(content, 'ravi', 2, 7));
    const b = autoplay(content, start(content, 'ravi', 2, 8));
    expect(a.state).not.toEqual(b.state);
    expect(a.transcript).not.toEqual(b.transcript);
  });

  it('never mutates its inputs: frozen state, action and content survive a whole game', () => {
    const frozen = deepFreeze(clone(content));
    const first = deepFreeze(start(frozen, 'ravi', 2, 11));
    const played = autoplay(frozen, first, firstChoice, () => false, { freeze: true });
    expect(played.state.phase).toBe('done');
  });

  it('never mutates its inputs when rewinding either', () => {
    const s = deepFreeze(withCard(start(quiet, 'sana', 2, 2).state, 'decision', 'budget.recharge.01'));
    const chosen = deepFreeze(step(s, deepFreeze(choose('b')), quiet).state);
    expect(() => step(chosen, deepFreeze({ type: 'rewind' }), quiet)).not.toThrow();
  });

  it('state is plain JSON: it round-trips and play continues identically', () => {
    const mid = autoplay(content, start(content, 'sana', 2, 21), firstChoice, (r) => r.state.month === 3 && r.state.week === 2).state;
    const copy = JSON.parse(JSON.stringify(mid)) as GameState;
    expect(copy).toEqual(mid);
    expect(GameState.safeParse(copy).success).toBe(true);
    const view = currentView(mid, content);
    expect(currentView(copy, content)).toEqual(view);
    const fromMid = autoplay(content, { state: mid, view, events: [] });
    const fromCopy = autoplay(content, { state: copy, view, events: [] });
    expect(fromCopy.state).toEqual(fromMid.state);
  });

  it('currentView is pure and matches the view step returned', () => {
    const r = start(content, 'sana', 2, 5);
    expect(currentView(r.state, content)).toEqual(r.view);
    const r2 = step(r.state, choose(firstChoice(r.view as never, r.state)), content);
    expect(currentView(r2.state, content)).toEqual(r2.view);
    expect(r2.view.notices).toBe(r2.state.notices);
  });

  it('notices only describe the current step', () => {
    const r = start(quiet, 'sana', 2, 5);
    expect(r.state.notices.length).toBeGreaterThan(0);
    const chosen = step(r.state, choose('a'), quiet);
    expect(chosen.state.notices.map((n) => n.kind)).not.toContain('payday');
  });

  it('jars never go negative and debt never goes below zero across whole games', () => {
    for (const persona of ['ravi', 'sana'] as const) {
      for (const seed of [1, 2, 3, 4]) {
        for (const pickLast of [false, true]) {
          const policy = pickLast ? (v: { card: { choices: { id: string }[] } }) => v.card.choices[v.card.choices.length - 1]!.id : firstChoice;
          const r = start(content, persona, 2, seed);
          const played = autoplay(content, r, policy as never, (x) => {
            for (const v of Object.values(x.state.jars)) expect(v).toBeGreaterThanOrEqual(0);
            expect(x.state.debt).toBeGreaterThanOrEqual(0);
            return false;
          });
          expect(played.state.phase).toBe('done');
        }
      }
    }
  });

  it('keeps the scores in range and the xp monotone', () => {
    const played = autoplay(content, start(content, 'ravi', 1, 4));
    for (const s of played.state.scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
    expect(played.state.xp).toBeGreaterThanOrEqual(48 * 10 + 12 * 20);
  });
});

describe('level 1 investing lock in play', () => {
  it('a level 1 player gets no investing card before two habit decisions', () => {
    const c = variant((x) => {
      x.tuning.eventChance = ZERO_EVENTS;
      const inv = scenario('budget.bus_pass.01');
      x.scenarios.push({ ...inv, id: 'invest.basket.01', pillar: 'understand_investing', concept: 'risk_return' });
    });
    for (let seed = 1; seed <= 30; seed++) {
      const r = start(c, 'ravi', 1, seed);
      expect(r.state.card?.id).not.toBe('invest.basket.01');
    }
  });
});
