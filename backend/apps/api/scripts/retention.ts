// npm run retention: unlink students from classes whose programme has ended.
// Run daily from a scheduler (cron, or the worker once B12 lands).
import { createDb } from '@paisa/db';
import { loadConfig } from '../src/config';
import { unlinkEndedClasses } from '../src/retention';

const config = loadConfig();
if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required');
const { db, close } = createDb(config.DATABASE_URL);
try {
  const n = await unlinkEndedClasses(db, new Date());
  console.log(`retention: unlinked ${n} student profiles from ended classes`);
} finally {
  await close();
}
