// Terminal harness (task A25): plays the engine directly, no API and no frontend.
//   npm run play -- [contentDir] [--persona sana] [--level 2] [--seed 42]
// This folder is outside src/, so it may use Node built-ins; the engine itself stays pure.
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { Action, GameState, JarBalances as Jars, Notice, View } from '@paisa/contracts';
import { EngineError, newGame, step } from '@paisa/engine';
import { loadContentDir } from './load';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : fallback;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'));
const dir = resolve(positional[0] ?? resolve(import.meta.dirname, '../../../content/fixtures'));

const { content, strings } = loadContentDir(dir);

const inr = (n: number): string => `₹${n.toLocaleString('en-IN')}`;
const text = (key: string): string => strings[key.replace(/^t:/, '')] ?? key;
const jarLine = (j: Jars): string => `needs ${inr(j.needs)} | wants ${inr(j.wants)} | goals ${inr(j.goals)} | savings ${inr(j.savings)}`;

function showNotice(n: Notice): void {
  const bits: string[] = [n.kind];
  if (n.text) bits.push(text(n.text));
  if (n.amount !== undefined) bits.push(inr(n.amount));
  if (n.deltas && Object.keys(n.deltas).length) bits.push(JSON.stringify(n.deltas));
  if (n.debt) bits.push(`debt ${n.debt > 0 ? '+' : ''}${n.debt}`);
  if (n.value !== undefined) bits.push(String(n.value));
  console.log(`  * ${bits.join(' - ')}`);
}

function show(view: View): void {
  const h = view.hud;
  console.log(`\n=== Month ${h.month}/${h.months}, week ${h.week} | XP ${h.xp} | rewinds ${h.rewindTokens} ===`);
  console.log(jarLine(h.jars) + (h.debt ? ` | DEBT ${inr(h.debt)}` : ''));
  console.log(`Goal: ${text(h.goal.label)} ${Math.round(h.goal.progress * 100)}%`);
  view.notices.forEach(showNotice);
  if (view.kind === 'card') {
    console.log(`\n${text(view.card.text)}${view.card.assumption ? '\n  (the numbers here are assumptions)' : ''}`);
    view.card.choices.forEach((c) => console.log(`  [${c.id}] ${text(c.label)}`));
  } else if (view.kind === 'consequence') {
    const o = view.outcome;
    console.log(`\nResult: ${JSON.stringify(o.applied.deltas)}${o.applied.debt ? ` debt ${o.applied.debt}` : ''}`);
    console.log(`Lesson: ${text(o.lesson)}${o.queued ? `  (${o.queued} later effect(s) queued)` : ''}`);
    console.log(h.canRewind ? "  type 'r' to rewind, anything else to continue" : '  press enter to continue');
  } else if (view.kind === 'month_end') {
    const r = view.report;
    console.log(`\nMonth report: score ${r.score}/100, income ${inr(r.income)}, saved ${inr(r.saved)}`);
    console.log(`Parts: ${JSON.stringify(r.parts)}`);
    console.log(`\n${text(r.reflection.question)}`);
    r.reflection.options.forEach((o, i) => console.log(`  [${i}] ${text(o)}`));
  } else {
    const s = view.summary;
    console.log(`\nYear over. Scores ${s.scores.join(', ')} (average ${s.averageScore}). Goal reached: ${s.goalReached}. Badges: ${s.badges.join(', ') || 'none'}.`);
  }
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const first = newGame(
  { personaId: flag('persona', 'sana') as GameState['personaId'], level: Number(flag('level', '2')), seed: Number(flag('seed', '42')) },
  content,
);
let state = first.state;
let view = first.view;
// Ctrl-D or a closed pipe ends the session instead of leaving a dangling prompt.
rl.on('close', () => process.exit(0));

try {
  while (view.kind !== 'done') {
    show(view);
    let action: Action;
    if (view.kind === 'card') {
      const ids = view.card.choices.map((c) => c.id);
      const pick = (await rl.question('> ')).trim();
      if (!ids.includes(pick)) {
        console.log(`Pick one of: ${ids.join(', ')}`);
        continue;
      }
      action = { type: 'choose', choiceId: pick };
    } else if (view.kind === 'consequence') {
      const pick = (await rl.question('> ')).trim().toLowerCase();
      action = pick === 'r' && view.hud.canRewind ? { type: 'rewind' } : { type: 'advance' };
    } else {
      const pick = (await rl.question('reflection (number, or enter to skip)> ')).trim();
      action = pick === '' ? { type: 'advance' } : { type: 'advance', reflection: Number(pick) };
    }
    try {
      const r = step(state, action, content);
      state = r.state;
      view = r.view;
    } catch (e) {
      if (e instanceof EngineError) console.log(`Not allowed: ${e.code}`);
      else throw e;
    }
  }
  show(view);
} finally {
  rl.close();
}
