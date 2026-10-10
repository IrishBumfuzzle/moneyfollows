import type { EventCard, GameContent, Persona, Scenario } from '@paisa/contracts';
import { EngineError } from './errors';

export function getPersona(content: GameContent, id: string): Persona {
  const persona = content.personas.find((p) => p.id === id);
  if (!persona) throw new EngineError('unknown_persona', `no persona "${id}" in the content pack`);
  return persona;
}

export function getCard(content: GameContent, ref: { kind: 'decision' | 'event'; id: string }): Scenario | EventCard {
  const card = (ref.kind === 'decision' ? content.scenarios : content.events).find((c) => c.id === ref.id);
  if (!card) throw new EngineError('no_cards', `card "${ref.id}" is not in the content pack`);
  return card;
}
