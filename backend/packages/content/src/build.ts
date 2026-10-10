import { createHash } from 'node:crypto';
import { ContentPack, type ContentSource, type Language, type StringTable } from '@paisa/contracts';
import { collectKeys } from './keys';

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

const inRegion = (region: string) => (item: { regions?: string[] }) => !item.regions || item.regions.includes(region);

/**
 * Versioned packs per language for one region. Pure: the caller stores the result. (A16)
 * Only strings the pack uses are included. A key missing in a language falls back
 * to English; `validateSource` reports those gaps before anything is published.
 */
export function buildPacks(source: ContentSource, options: BuildOptions): PackArtifact[] {
  if (!source.tuning) throw new Error('buildPacks needs tuning; run validateSource first');
  const keep = inRegion(options.region);
  const content = {
    scenarios: source.scenarios.filter(keep),
    events: source.events.filter(keep),
    personas: source.personas,
    reflections: source.reflections,
    quizQuestions: source.quizQuestions,
    scamMessages: source.scamMessages,
    tuning: source.tuning,
  };
  const used = [...collectKeys(content)].sort();
  const en = source.strings.en ?? {};

  return options.languages.map((language) => {
    const table = source.strings[language] ?? {};
    const strings: StringTable = {};
    for (const key of used) {
      const text = table[key] ?? en[key];
      if (text !== undefined) strings[key] = text;
    }
    const pack = ContentPack.parse({
      manifest: { region: options.region, language, version: options.version },
      ...content,
      strings,
    });
    const body = JSON.stringify(pack);
    return {
      region: options.region,
      language,
      version: options.version,
      sha256: createHash('sha256').update(body).digest('hex'),
      body,
    };
  });
}
