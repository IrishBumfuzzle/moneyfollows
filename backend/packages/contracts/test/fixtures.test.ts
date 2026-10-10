import { describe, expect, it } from 'vitest';
import { Scenario, StringTable } from '../src';
import recharge from '../../../content/fixtures/scenarios/budget.recharge.01.json';
import en from '../../../content/fixtures/strings/en.json';

describe('fixture content', () => {
  it('parses the design-doc scenario', () => {
    expect(() => Scenario.parse(recharge)).not.toThrow();
  });

  it('has an English string for every key the scenario uses', () => {
    const scenario = Scenario.parse(recharge);
    const strings = StringTable.parse(en);
    const keys = [
      scenario.text,
      ...scenario.choices.flatMap((c) => [c.label, c.lesson]),
    ].map((k) => k.slice('t:'.length));
    expect(keys.filter((k) => !(k in strings))).toEqual([]);
  });

  it('rejects duplicate choice ids', () => {
    const dup = { ...recharge, choices: [recharge.choices[0], recharge.choices[0]] };
    expect(Scenario.safeParse(dup).success).toBe(false);
  });
});
