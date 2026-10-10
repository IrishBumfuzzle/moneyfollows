import type { ClassRow } from '@paisa/api-client';

/**
 * The seeded demo class (scripts/seed-data.ts) carries "(demo data)" in its name. Every screen
 * showing its numbers must say so (CLAUDE.md 9: "labelled demo data").
 */
export const isDemoClass = (c: Pick<ClassRow, 'name' | 'class_code'>) =>
  /\(demo data\)/i.test(c.name) || c.class_code === 'HYD234';
