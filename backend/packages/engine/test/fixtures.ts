import { resolve } from 'node:path';
import type { EventCard, GameContent, Persona, Scenario, Tuning } from '@paisa/contracts';
import { loadContentDir } from '../play/load';

export const FIXTURES_DIR = resolve(import.meta.dirname, '../../../content/fixtures');

/** The fixture pack as the engine sees it. Tests never hand-write content JSON. */
export const content: GameContent = loadContentDir(FIXTURES_DIR).content;

export const clone = <T>(v: T): T => structuredClone(v);

/** A copy of the fixture pack with some parts replaced. */
export function variant(edit: (c: GameContent) => void): GameContent {
  const c = clone(content);
  edit(c);
  return c;
}

export const ZERO_EVENTS: Tuning['eventChance'] = { '1': 0, '2': 0, '3': 0 };
export const ALWAYS_EVENTS: Tuning['eventChance'] = { '1': 1, '2': 1, '3': 1 };

/** No surprise events: exactly one card a week. */
export const quiet: GameContent = variant((c) => {
  c.tuning.eventChance = ZERO_EVENTS;
});

export function scenario(id: string): Scenario {
  const s = content.scenarios.find((x) => x.id === id);
  if (!s) throw new Error(`fixture scenario ${id} missing`);
  return clone(s);
}

export function eventCard(id: string): EventCard {
  const e = content.events.find((x) => x.id === id);
  if (!e) throw new Error(`fixture event ${id} missing`);
  return clone(e);
}

export function persona(id: string): Persona {
  const p = content.personas.find((x) => x.id === id);
  if (!p) throw new Error(`fixture persona ${id} missing`);
  return clone(p);
}
