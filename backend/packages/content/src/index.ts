// Content pipeline: validation, guardrail lint and pack building.
// Signatures are the Track A -> Track B seam; bodies land in the tasks named below.

import type { ContentSource, Language, Scenario } from '@paisa/contracts';

export interface ContentIssue {
  itemId: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationReport {
  ok: boolean;
  issues: ContentIssue[];
}

export interface BuildOptions {
  version: string;
  region: string;
  languages: Language[];
}

/** One built pack: the bytes the API uploads to storage, plus its manifest entry. */
export interface PackArtifact {
  region: string;
  language: Language;
  version: string;
  sha256: string;
  body: string;
}

/** Schema, cross-reference, string-coverage and guardrail checks over a whole source. (A7) */
export function validateSource(_source: ContentSource): ValidationReport {
  throw new Error('validateSource is not implemented yet (task A7)');
}

/** Guardrail rules for one item: no real products, no single-number projections, respectful tone. (A17) */
export function lintGuardrails(_item: Scenario): ContentIssue[] {
  throw new Error('lintGuardrails is not implemented yet (task A17)');
}

/** Versioned packs per language for one region. Pure: the caller stores the result. (A16) */
export function buildPacks(_source: ContentSource, _options: BuildOptions): PackArtifact[] {
  throw new Error('buildPacks is not implemented yet (task A16)');
}
