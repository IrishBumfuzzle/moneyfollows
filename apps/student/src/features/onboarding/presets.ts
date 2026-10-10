import type { PersonaId } from './types';

// Emoji placeholders until avatar art exists. Labels: onboarding.avatar.<id>.
export const AVATARS = [
  { id: 'tiger', emoji: '🐯' },
  { id: 'peacock', emoji: '🦚' },
  { id: 'elephant', emoji: '🐘' },
  { id: 'parrot', emoji: '🦜' },
  { id: 'lion', emoji: '🦁' },
  { id: 'rabbit', emoji: '🐰' },
] as const;

export interface PersonaPreset {
  id: PersonaId;
  portrait: string;            // emoji placeholder
  age: number;
  monthlyIncome: number;       // whole rupees
  goalAmount: number | null;   // null: the design doc gives no amount
}

// TEMPORARY: from the personas table in "docs/Paisa Path — Product & Component Design.md".
// Replace with packages/content/personas.json once BE-1 lands it; strings are persona.<id>.*.
export const PERSONAS: PersonaPreset[] = [
  { id: 'sana', portrait: '👧', age: 18, monthlyIncome: 4000, goalAmount: null },
  { id: 'ravi', portrait: '👦', age: 17, monthlyIncome: 3000, goalAmount: 25000 },
];
