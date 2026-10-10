import type { ClassRow } from '@paisa/api-client';
import { SAMPLE_MODE } from './mode';

/**
 * The seeded demo class (scripts/seed-data.ts) carries "(demo data)" in its name, and every class
 * in sample mode is made up. Every screen showing their numbers must say so (CLAUDE.md 9: "labelled demo data").
 */
export const isDemoClass = (c: Pick<ClassRow, 'name' | 'class_code'>) =>
  SAMPLE_MODE || /\(demo data\)/i.test(c.name) || c.class_code === 'HYD234';
