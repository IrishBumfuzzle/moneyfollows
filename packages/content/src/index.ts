// The content bundle: static JSON imported and parsed with the shared zod schemas at module
// load, so a bad file fails loudly the moment anything imports this package.
import {
  EventCardSchema,
  I18nFileSchema,
  PersonaSchema,
  QuizQuestionSchema,
  ScamMessageSchema,
  ScenarioSchema,
  type ContentBundle,
} from '@paisa/shared';
import events from '../events/events.json';
import personas from '../personas.json';
import scamMessages from '../minigames/scam-or-safe.json';
import planBudget from '../scenarios/plan_budget.json';
import saveManage from '../scenarios/save_manage.json';
import understandInvesting from '../scenarios/understand_investing.json';
import staySafe from '../scenarios/stay_safe.json';
import baseline from '../quizzes/baseline.json';
import endline from '../quizzes/endline.json';
import en from '../i18n/en.json';
import hi from '../i18n/hi.json';

/** Bump when any content file changes. Sent with every synced event. */
export const CONTENT_VERSION = '2026.10.10';

export const content: ContentBundle = {
  version: CONTENT_VERSION,
  personas: PersonaSchema.array().parse(personas),
  scenarios: ScenarioSchema.array().parse([...planBudget, ...saveManage, ...understandInvesting, ...staySafe]),
  events: EventCardSchema.array().parse(events),
  quizzes: QuizQuestionSchema.array().parse([...baseline, ...endline]),
  scamMessages: ScamMessageSchema.array().parse(scamMessages),
};

/** Raw flat maps: key (without "t:") to text. Use react-i18next with `keySeparator: false`. */
export const i18n: { en: Record<string, string>; hi: Record<string, string> } = {
  en: toStrings(en),
  hi: toStrings(hi),
};

function toStrings(file: unknown): Record<string, string> {
  const parsed = I18nFileSchema.parse(file);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) if (typeof value === 'string') out[key] = value;
  return out;
}

export * from './validate';
