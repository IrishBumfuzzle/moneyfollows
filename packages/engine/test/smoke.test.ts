import { describe, expect, it } from 'vitest';
import { LEVELS } from '@paisa/shared';
import { content } from '@paisa/content';
import { choose, createGame, nextCard } from '../src';
import { first } from './helpers';

describe('real bundled content', () => {
  it.skipIf(content.scenarios.length === 0)(
    '50 seeds x every persona x every level reach yearEnd without breaking invariants',
    () => {
      for (const persona of content.personas) {
        for (const level of LEVELS) {
          for (let seed = 1; seed <= 50; seed++) {
            let s = createGame(persona.id, level, seed);
            let steps = 0;
            while (s.stage !== 'yearEnd') {
              s = choose(s, content, first(nextCard(s, content))).state;
              for (const v of Object.values(s.jars)) expect(v).toBeGreaterThanOrEqual(0);
              expect(s.debt).toBeGreaterThanOrEqual(0);
              expect(JSON.parse(JSON.stringify(s))).toEqual(s);
              if (++steps > 200) throw new Error('game did not finish');
            }
            expect(s.scores).toHaveLength(3);
          }
        }
      }
    },
    // 300 full games with 2-3 pins a week: allow more than the default 5 s.
    30_000,
  );
});
