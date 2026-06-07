import { z } from "zod";

/**
 * Centralised, Zod-validated access to environment variables.
 *
 * Design choice: parsing never throws at import/build time so that
 * `next build` works without every secret present. Required-for-a-feature
 * variables are checked lazily via `requireEnv()` at the point of use, which
 * throws a clear, actionable error. `TRIAGE_SCORE_THRESHOLD` is the only
 * value with a hard default (70), as mandated by the brief.
 */

// Treat empty strings as "unset" so a blank line in .env behaves like absence.
const optionalString = z
  .preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const envSchema = z.object({
  // Core
  DATABASE_URL: optionalString,
  APP_PASSWORD: optionalString,

  // LLM
  GEMINI_API_KEY: optionalString,
  // Fast model for triage, stronger model for drafting (overridable per key access).
  GEMINI_TRIAGE_MODEL: z.preprocess(
    (v) => (v === "" || v === undefined ? "gemini-2.0-flash" : v),
    z.string(),
  ),
  GEMINI_DRAFT_MODEL: z.preprocess(
    (v) => (v === "" || v === undefined ? "gemini-2.5-pro" : v),
    z.string(),
  ),

  // Reddit (snoowrap)
  REDDIT_CLIENT_ID: optionalString,
  REDDIT_CLIENT_SECRET: optionalString,
  REDDIT_USERNAME: optionalString,
  REDDIT_PASSWORD: optionalString,
  REDDIT_USER_AGENT: optionalString,

  // Stripe
  STRIPE_SECRET_KEY: optionalString,

  // Telegram
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_CHAT_ID: optionalString,

  // FutuRole integrations
  FUTUROLE_ATS_API_URL: optionalString,
  FUTUROLE_ATS_API_KEY: optionalString,
  FUTUROLE_WEBHOOK_SECRET: optionalString,

  // Discord (v2 — stubbed)
  DISCORD_BOT_TOKEN: optionalString,

  // Cron protection (extra). If set, /api/cron/* require a Bearer match.
  CRON_SECRET: optionalString,
  // Dev-only: when "true", the radar uses local fixtures instead of live Reddit.
  RADAR_MOCK: optionalString,
  // Dev-only: when "true", LLM triage/draft use deterministic heuristics (no Gemini).
  LLM_MOCK: optionalString,

  // Tunables
  TRIAGE_SCORE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(70),
  // Anti-ban guardrail: minimum ratio of helpful replies per link-bearing reply.
  HELPFUL_TO_LINK_RATIO: z.coerce.number().int().min(1).default(9),
  // intentScore at/above which an instant Telegram alert fires.
  HOT_LEAD_THRESHOLD: z.coerce.number().int().min(0).max(100).default(90),
  // Public base URL of the free FutuRole ATS scanner (link target in drafts).
  FUTUROLE_SCANNER_URL: z
    .preprocess(
      (v) => (v === "" || v === undefined ? "https://futurole.com/ats-scan" : v),
      z.string(),
    ),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Only thrown for genuinely malformed values (e.g. non-numeric threshold),
  // never for missing optional secrets.
  console.error(
    "[env] Invalid environment configuration:",
    parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  );
  throw new Error("Invalid environment configuration. See logs above.");
}

export const env: Env = parsed.data;

/**
 * Returns the value of a required env var or throws a clear, actionable error.
 * Use at the entry point of any feature that needs the secret.
 */
export function requireEnv(key: keyof Env): string {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `Missing required environment variable: ${key}. Add it to your .env file (see .env.example).`,
    );
  }
  return String(value);
}
