import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ALLOW_SIGNUP: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),
  /** cloud: multi-tenant SaaS. onprem: single restaurant group on its own hardware. */
  DEPLOYMENT_MODE: z.enum(['cloud', 'onprem']).default('cloud'),
  /** Secure cookies need HTTPS. On-prem LAN installs usually serve plain HTTP. */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  /** If set, the API also serves the built web app from this directory (single-port deployments). */
  WEB_DIR: z.string().optional(),
  APP_VERSION: z.string().default('1.0.0'),
  /** Override the embedded license verification key (tests / development only). */
  LICENSE_PUBLIC_KEY: z.string().optional(),
});

type RawConfig = z.infer<typeof envSchema>;
export type Config = Omit<RawConfig, 'COOKIE_SECURE'> & { COOKIE_SECURE: boolean };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const data = parsed.data;
  if (data.NODE_ENV === 'production' && data.JWT_SECRET.startsWith('change-me')) {
    throw new Error('Refusing to start in production with the example JWT_SECRET');
  }
  const cookieSecure = data.COOKIE_SECURE !== undefined
    ? data.COOKIE_SECURE === 'true'
    : data.NODE_ENV === 'production' && data.DEPLOYMENT_MODE === 'cloud';
  return {
    ...data,
    COOKIE_SECURE: cookieSecure,
    // A single on-prem install hosts exactly one organisation, created by the setup wizard.
    ALLOW_SIGNUP: data.DEPLOYMENT_MODE === 'onprem' ? false : data.ALLOW_SIGNUP,
  };
}
