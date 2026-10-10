import { createDb, migrateDb } from '@paisa/db';
import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required. Copy backend/.env.example to backend/.env.');

await migrateDb(config.DATABASE_URL);
const { db, close } = createDb(config.DATABASE_URL);
const app = buildApp(config, { db });
app.addHook('onClose', close);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
