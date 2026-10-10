import { describe, expect, it } from 'vitest';
import { choose, createGame, nextCard } from '../src';
import { fixture } from './fixtures';
import { first } from './helpers';

describe('golden', () => {
  it('sana / explorer / seed 42, always the first choice', () => {
    let s = createGame('sana', 'explorer', 42, fixture);
    const lines: string[] = [`start jars=${JSON.stringify(s.jars)} debt=${s.debt} stage=${s.stage}`];
    for (let i = 0; i < 100 && s.stage !== 'yearEnd'; i++) {
      const card = nextCard(s, fixture);
      const id = first(card);
      const r = choose(s, fixture, id);
      const name =
        card.kind === 'monthEnd'
          ? `score=${card.report.score} ${card.report.reflection}`
          : card.kind === 'yearEnd'
            ? ''
            : card.scenario.id;
      const extra = [
        r.consequence.payday ? `payday=${r.consequence.payday.income}` : '',
        ...r.consequence.landed.map((l) => `landed=${l.note}`),
      ].filter(Boolean);
      lines.push(
        `m${s.month}w${s.week} ${card.kind} ${name} -> ${id} | jars=${JSON.stringify(r.state.jars)} debt=${r.state.debt} ${extra.join(' ')}`.trim(),
      );
      s = r.state;
    }
    lines.push(`end scores=${JSON.stringify(s.scores)} seen=${s.seen.length} lessons=${s.lessons?.length}`);
    expect(lines.join('\n')).toMatchSnapshot();
  });
});
