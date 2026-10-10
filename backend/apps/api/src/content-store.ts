import {
  GameContent,
  ContentPack,
  type Language,
  type PackManifest,
  type PackManifestEntry,
} from '@paisa/contracts';
import { buildPacks, loadContentDir, validateSource, type ContentIssue } from '@paisa/content';

export interface StoredPack {
  entry: PackManifestEntry;
  body: string;
  pack: ContentPack;
}

/**
 * Validated content and built packs, held in memory. Packs are immutable per
 * version, so the API serves them with long cache headers. Swapping this for
 * object storage + CDN (B15/B20) changes only this module.
 */
export interface ContentStore {
  region: string;
  version: string;
  game: GameContent;
  packs: Map<string, StoredPack>;
  manifest(language?: Language): PackManifest;
  pack(language: Language): StoredPack | undefined;
}

export class ContentError extends Error {
  constructor(readonly issues: ContentIssue[]) {
    super(
      `content failed validation:\n${issues
        .filter((i) => i.severity === 'error')
        .slice(0, 20)
        .map((i) => `  ${i.itemId} [${i.rule}] ${i.message}`)
        .join('\n')}`,
    );
  }
}

export function loadContentStore(dir: string, region: string, version: string): ContentStore {
  const { source, issues: loadIssues } = loadContentDir(dir);
  const report = validateSource(source);
  const errors = [...loadIssues, ...report.issues].filter((i) => i.severity === 'error');
  if (errors.length > 0) throw new ContentError(errors);

  const languages = Object.keys(source.strings) as Language[];
  const packs = new Map<string, StoredPack>();
  for (const artifact of buildPacks(source, { region, version, languages })) {
    const id = `${artifact.region}-${artifact.language}-${artifact.version}`;
    packs.set(id, {
      entry: {
        id,
        region: artifact.region,
        language: artifact.language,
        version: artifact.version,
        sha256: artifact.sha256,
        url: `/v1/content/packs/${id}`,
      },
      body: artifact.body,
      pack: ContentPack.parse(JSON.parse(artifact.body)),
    });
  }
  const game = GameContent.parse(source);

  return {
    region,
    version,
    game,
    packs,
    manifest(language) {
      return {
        region,
        packs: [...packs.values()].map((p) => p.entry).filter((e) => !language || e.language === language),
      };
    },
    pack(language) {
      return [...packs.values()].find((p) => p.entry.language === language);
    },
  };
}
