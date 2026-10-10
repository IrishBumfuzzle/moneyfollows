import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const DEFAULT_CONTENT_DIR = fileURLToPath(new URL('../../../content/hyderabad', import.meta.url));
const DEV_SECRET = 'dev-only-secret-change-me-dev-only-secret';

const flag = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().min(1).optional(),
    /** Signs student device tokens and staff session tokens. At least 32 characters. */
    JWT_SECRET: z.string().min(32).default(DEV_SECRET),
    /** Comma-separated browser origins allowed to call the API (the PWA and dashboard). */
    CORS_ORIGINS: z.string().default(''),
    /** Content folder the API validates, builds and serves at startup. */
    CONTENT_DIR: z.string().default(DEFAULT_CONTENT_DIR),
    PACK_REGION: z.string().default('hyderabad'),
    PACK_VERSION: z.string().default('dev'),
    /** Return the staff one-time code in the response. Development and demos only. */
    OTP_DEV_ECHO: flag,
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_MODEL: z.string().optional(),
    OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.JWT_SECRET === DEV_SECRET) ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'set a real secret in production' });
      if (env.OTP_DEV_ECHO) ctx.addIssue({ code: 'custom', path: ['OTP_DEV_ECHO'], message: 'must be off in production' });
    }
  });

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // A blank line in .env (`JWT_SECRET=`) means "use the default", not "empty string".
  const set = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== ''));
  return EnvSchema.parse(set);
}
