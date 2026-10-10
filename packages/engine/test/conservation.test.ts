import { describe, expect, it } from 'vitest';
import { JARS, LEVELS } from '@paisa/shared';
import type { AppliedEffects, Choice, ContentBundle, Effects, GameState, JarId, PersonaId } from '@paisa/shared';
import { choose, createGame, nextCard } from '../src';
import { hash, unit } from '../src/hash';
import { bundle, choice, event, fixture, scenario } from './fixtures';

// Property-style money conservation: random content (seeded by the engine hash, so the test
// itself is deterministic), many seeds, both personas, random choices.

const between = (lo: number, hi: number, ...key: (string | number)[]): number =>
  lo + Math.floor(unit(9001, ...key) * (hi - lo + 1));

function randomEffects(...key: (string | number)[]): Effects {
  const jars: Partial<Record<JarId, number>> = {};
  for (const jar of JARS) {
    if (unit(9001, ...key, jar) < 0.5) jars[jar] = between(-3000, 2000, ...key, jar, 'amt');
  }
  const out: Effects = { jars };
  const r = unit(9001, ...key, 'debt');
  if (r < 0.25) out.debt = between(-2500, -1, ...key, 'repay');
  else if (r < 0.4) out.debt = between(1, 1500, ...key, 'borrow');
  return out;
}

function randomChoices(id: string): Choice[] {
  const n = between(1, 4, id, 'n');
  return Array.from({ length: n }, (_, i) => {
    const delayed =
      unit(9001, id, i, 'delayed') < 0.5
        ? Array.from({ length: between(1, 2, id, i, 'nd') }, (_, k) => ({
            afterWeeks: between(1, 11, id, i, k, 'after'),
            effects: randomEffects(id, i, k, 'later'),
            note: `t:note.${id.replace('.', '_')}_${i}_${k}` as const,
          }))
        : undefined;
    return choice(`c${i}`, randomEffects(id, i), delayed ? { delayed } : {});
  });
}

const randomContent: ContentBundle = bundle({
  scenarios: Array.from({ length: 12 }, (_, i) =>
    scenario(`rand.s${i}`, { choices: [...randomChoices(`rand.s${i}`), choice('zz')].slice(0, 4) }),
  ),
  events: Array.from({ length: 5 }, (_, i) => event(`rand.e${i}`, { choices: randomChoices(`rand.e${i}`) })),
});

const net = (s: GameState): number => JARS.reduce((sum, j) => sum + s.jars[j], 0) - s.debt;
const appliedNet = (a: AppliedEffects): number =>
  JARS.reduce((sum, j) => sum + (a.jars[j] ?? 0), 0) - a.debt;
const rawNet = (e: Effects): number => JARS.reduce((sum, j) => sum + (e.jars?.[j] ?? 0), 0) - (e.debt ?? 0);

function checkInvariants(s: GameState): void {
  for (const j of JARS) {
    expect(s.jars[j]).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(s.jars[j])).toBe(true);
  }
  expect(s.debt).toBeGreaterThanOrEqual(0);
  expect(Number.isInteger(s.debt)).toBe(true);
}

describe('money conservation', () => {
  it('every step: change in (jars - debt) = applied effects + income - fixed costs; jars and debt stay >= 0', () => {
    const personas: PersonaId[] = ['sana', 'ravi'];
    let steps = 0;
    let repaysCapped = 0;
    let settledAtYearEnd = 0;
    for (const personaId of personas) {
      const persona = randomContent.personas.find((p) => p.id === personaId)!;
      for (let seed = 0; seed < 60; seed++) {
        const level = LEVELS[seed % LEVELS.length]!;
        let s = createGame(personaId, level, seed, randomContent);
        checkInvariants(s);
        for (let i = 0; i < 200 && s.stage !== 'yearEnd'; i++) {
          const card = nextCard(s, randomContent);
          let choiceId = 'continue';
          let picked: Choice | undefined;
          if (card.kind === 'decision' || card.kind === 'event') {
            const cs = card.scenario.choices;
            picked = cs[hash(seed, 'conservation', i) % cs.length]!;
            choiceId = picked.id;
          }
          const { state, consequence } = choose(s, randomContent, choiceId);

          // 1. Reported effects explain the whole change in net worth.
          let expected = appliedNet(consequence.applied);
          for (const l of consequence.landed) expected += appliedNet(l.applied);
          if (consequence.payday) {
            // payday adds the income and takes the fixed costs (borrowing nets to zero)
            expect(appliedNet(consequence.payday.applied)).toBe(consequence.payday.income - persona.fixedCosts);
            expected += consequence.payday.income - persona.fixedCosts;
          }
          expect(net(state) - net(s)).toBe(expected);

          // 2. A choice moves exactly its raw effects, unless it repays more than is owed
          //    (then the excess and its jar charge are dropped, never more).
          if (picked) {
            const repay = -(picked.effects.debt ?? 0);
            const spend = JARS.reduce((sum, j) => sum + Math.max(0, -(picked.effects.jars?.[j] ?? 0)), 0);
            if (repay <= s.debt) expect(appliedNet(consequence.applied)).toBe(rawNet(picked.effects));
            else {
              repaysCapped++;
              expect(consequence.applied.borrowed - consequence.applied.debt).toBe(s.debt); // repaid exactly what was owed
              // "pay X from a jar" with X > debt: only the debt is charged, so no money vanishes
              if (spend >= repay) expect(appliedNet(consequence.applied)).toBe(rawNet(picked.effects));
            }
          }

          // 3. Per-jar and debt deltas match what was reported.
          const all = [consequence.applied, ...consequence.landed.map((l) => l.applied)];
          if (consequence.payday) all.push(consequence.payday.applied);
          for (const j of JARS) {
            expect(state.jars[j] - s.jars[j]).toBe(all.reduce((sum, a) => sum + (a.jars[j] ?? 0), 0));
          }
          expect(state.debt - s.debt).toBe(all.reduce((sum, a) => sum + a.debt, 0));

          checkInvariants(state);
          if (state.stage === 'yearEnd') {
            settledAtYearEnd += consequence.landed.length;
            expect(state.pending).toEqual([]);
          }
          s = state;
          steps++;
        }
        expect(s.stage).toBe('yearEnd');
      }
    }
    // the generator really exercises the interesting paths
    expect(steps).toBeGreaterThan(1500);
    expect(repaysCapped).toBeGreaterThan(0);
    expect(settledAtYearEnd).toBeGreaterThan(0);
  });

  it('the fixture content conserves money too', () => {
    for (const personaId of ['sana', 'ravi'] as const) {
      for (let seed = 0; seed < 30; seed++) {
        let s = createGame(personaId, 'planner', seed, fixture);
        while (s.stage !== 'yearEnd') {
          const card = nextCard(s, fixture);
          const id = card.kind === 'monthEnd' ? 'continue' : card.kind === 'yearEnd' ? '' : card.scenario.choices[0]!.id;
          const { state, consequence } = choose(s, fixture, id);
          let expected = appliedNet(consequence.applied);
          for (const l of consequence.landed) expected += appliedNet(l.applied);
          if (consequence.payday) expected += appliedNet(consequence.payday.applied);
          expect(net(state) - net(s)).toBe(expected);
          checkInvariants(state);
          s = state;
        }
      }
    }
  });
});
