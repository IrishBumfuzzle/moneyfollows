import type { ContentIssue } from '@paisa/content';
import type { Language, PersonaId, Pillar, Scenario, StringTable } from '@paisa/contracts';
import type { LlmClient } from './llm';

/** What an author asks for. Everything else comes from the persona and region bibles. */
export interface ScenarioBrief {
  pillar: Pillar;
  concept: string;
  personas: PersonaId[];
  difficulty: number;
  region: string;
  /** Free-text direction from the author, e.g. "set it during Bonalu". */
  notes?: string;
}

export interface ScenarioDraft {
  scenario: Scenario;
  /** English source strings for every key the scenario uses. */
  strings: StringTable;
  /** Output of validation and guardrail lint. Errors block the draft from review. */
  issues: ContentIssue[];
  provenance: { model: string; promptVersion: string };
}

export interface TranslationDraft {
  language: Language;
  strings: StringTable;
  /** Glossary terms that did not appear as agreed, for the native-speaker check. */
  glossaryMisses: string[];
  provenance: { model: string; promptVersion: string };
}

export interface StorygenDeps {
  llm: LlmClient;
}

/** Brief -> scenario JSON + English strings, validated and linted. (A18) */
export async function generateScenarioDraft(_brief: ScenarioBrief, _deps: StorygenDeps): Promise<ScenarioDraft> {
  throw new Error('generateScenarioDraft is not implemented yet (task A18)');
}

/** English strings -> draft translation against the language glossary. (A20) */
export async function translateStrings(
  _strings: StringTable,
  _language: Language,
  _glossary: StringTable,
  _deps: StorygenDeps,
): Promise<TranslationDraft> {
  throw new Error('translateStrings is not implemented yet (task A20)');
}
