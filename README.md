# FutuRole Growth Copilot

Internal, single-user growth tool for **FutuRole** (futurole.com). It finds job
seekers asking for help in communities (Reddit now, Discord in v2), triages and
scores them with an LLM, drafts value-first replies that point to the free ATS
scanner, and tracks every interaction through to revenue (signup → trial → paid →
MRR).

## ⛔ The one non-negotiable rule: human-in-the-loop

**This app never posts anything to Reddit or Discord.** It detects, triages,
drafts, and tracks. *You* read, edit, copy, post manually, and then click
"Mark posted". There is no auto-publishing code anywhere — by design, to stay
clear of anti-spam bans. The Reddit and Discord integrations are **read-only**.

## Pipeline

```
radar (collect) → triage (LLM score) → draft (2 variants) → INBOX (you review,
edit, copy, post by hand, mark posted) → attribution (webhook + Stripe) → revenue
```

| Status flow | NEW → TRIAGED → DRAFTED → APPROVED → POSTED  (or → SKIPPED) |

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS v4** + shadcn-style UI components
- **PostgreSQL** + **Prisma**
- **Google Gemini** (`@google/generative-ai`) — fast model for triage, strong model for drafting
- **snoowrap** (Reddit, read-only), **discord.js** (v2), **Stripe**, Telegram Bot API
- **Zod** for all input / LLM-output / env validation
- **Vitest** for unit tests
- Scheduled work = Next.js Route Handlers under `/api/cron/*` triggered by **Vercel Cron**. All business logic lives in `/lib` so it can move to a dedicated worker (BullMQ/Trigger.dev) later without rewrites.

> Note: the brief specified Next.js as the latest stable — that resolved to
> **Next.js 16**, where the `middleware` file convention is renamed to `proxy`
> (`proxy.ts`); it's the same feature (the single-user password gate).
> `@google/generative-ai` is used as mandated; it can later be migrated to the
> newer `@google/genai` SDK without touching call sites (`lib/llm/gemini.ts`).

## Project layout

```
app/
  (dashboard)/            password-gated pages: dashboard, inbox, analytics, settings
  api/
    cron/{radar,triage,draft,attribution,summary}/   cron entrypoints
    opportunities/[id]/{approve,skip,mark-posted}/    inbox actions
    webhooks/futurole/    receives signup events (utm_campaign)
    logout/
  login/
lib/
  sources/{reddit,discord,ingest,match,types}.ts   collection + dedup
  llm/{gemini,triage,draft,json,mock}.ts           Gemini + Zod-validated I/O
  ats/scorer.ts                                    FutuRole API + fallback scorer
  attribution/{utm,record,stripe}.ts               UTM + signup + Stripe reconcile
  queries/{attribution,analytics}.ts               funnel + health queries
  notify/telegram.ts                               hot-lead alert + daily summary
  actions/opportunities.ts                         approve/skip/mark-posted logic
  {db,env,auth,guardrail,rate-limit,log,format}.ts
prisma/{schema.prisma, seed.ts, migrations/}
proxy.ts                  single-user password gate (Next 16 "middleware")
tests/                    Vitest unit tests
```

## Local setup

### 1. Install

```bash
npm install
```

Requires Node 20.18+ (some dev-tool engine warnings appear below 20.19 but
everything builds and runs; the Vitest config is `.mts` for that reason).

### 2. Database

**With Docker (recommended):**

```bash
docker compose up -d
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/futurole_growth?schema=public"
```

**Without Docker (native Postgres):** if you have a local PostgreSQL, just point
`DATABASE_URL` at a fresh database. To spin up a throwaway cluster on a custom
port (what was used to build this):

```bash
initdb -D /tmp/futurole-pg --auth=trust -U postgres
pg_ctl -D /tmp/futurole-pg -o "-p 5433" -l /tmp/futurole-pg/server.log start
createdb -h localhost -p 5433 -U postgres futurole_growth
# DATABASE_URL="postgresql://postgres@localhost:5433/futurole_growth?schema=public"
```

### 3. Env

```bash
cp .env.example .env
# fill in DATABASE_URL and APP_PASSWORD at minimum
```

Every secret is optional except `DATABASE_URL`: features degrade gracefully when
a key is missing (e.g. no Stripe key ⇒ attribution cron skips cleanly; no
Telegram ⇒ alerts are no-ops). Two dev-only flags let you run the whole pipeline
without external keys:

- `RADAR_MOCK=true` — radar uses local fixtures instead of live Reddit.
- `LLM_MOCK=true` — triage & drafting use deterministic heuristics instead of Gemini.

### 4. Migrate + seed

```bash
npm run db:migrate     # applies migrations
npm run db:seed        # sources + demo data across every status
```

### 5. Run

```bash
npm run dev            # http://localhost:3000  (login with APP_PASSWORD)
```

Try the pipeline end-to-end offline:

```bash
RADAR_MOCK=true LLM_MOCK=true npm run dev
# then, in another shell:
curl -X POST localhost:3000/api/cron/radar
curl -X POST localhost:3000/api/cron/triage
curl -X POST localhost:3000/api/cron/draft
# open http://localhost:3000/inbox to review + "mark posted"
```

## Getting each API key

- **Gemini** (`GEMINI_API_KEY`): https://aistudio.google.com/app/apikey . Models
  are tunable via `GEMINI_TRIAGE_MODEL` / `GEMINI_DRAFT_MODEL`.
- **Reddit** (`REDDIT_*`): create a *script* app at
  https://www.reddit.com/prefs/apps . Use a descriptive
  `REDDIT_USER_AGENT` like `web:futurole-growth-copilot:v1 (by /u/yourname)`.
- **Stripe** (`STRIPE_SECRET_KEY`): https://dashboard.stripe.com/apikeys .
- **Telegram** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`): create a bot with
  @BotFather; message it, then read your chat id from
  `https://api.telegram.org/bot<token>/getUpdates`.
- **FutuRole** (`FUTUROLE_*`): your own app — see contracts below.

## Integration contracts (FutuRole side)

### Signup webhook → attribution

When a user signs up after arriving with a `utm_campaign`, POST to the app:

```
POST /api/webhooks/futurole
Header: X-FutuRole-Signature: <shared secret | HMAC-SHA256(rawBody, secret) hex>
Body:   { "event": "signup", "utm_campaign": "<opportunityId>" }
```

`utm_campaign` is always the **Opportunity id** — it's the join key. The signed
link in every draft is built as
`<FUTUROLE_SCANNER_URL>?utm_source=<source>&utm_medium=community_comment&utm_campaign=<opportunityId>`.

### Stripe metadata → MRR

So the attribution cron can tie revenue back to a reply, set the campaign on the
subscription (or customer) at checkout:

```js
stripe.checkout.sessions.create({
  // …
  subscription_data: { metadata: { utm_campaign: "<opportunityId>" } },
});
```

Reconciliation counts `trialing` as a trial, `active`/`past_due` as paid (with
normalised monthly MRR), and ignores canceled/incomplete subscriptions.

### ATS scoring API (optional)

If `FUTUROLE_ATS_API_URL` is set and a post shares resume text/a link, drafts use
your real diagnostic:

```
POST {FUTUROLE_ATS_API_URL}
Header: Authorization: Bearer {FUTUROLE_ATS_API_KEY}
Body:   { "resumeText"?: string, "resumeUrl"?: string }
200 ->  { "score": number, "missingKeywords"?: string[], "findings"?: string[] }
```

Otherwise a local keyword/heuristic fallback is used.

## Crons

Defined in `vercel.json` (UTC):

| Path | Schedule | Does |
|------|----------|------|
| `/api/cron/radar` | every 2h | collect opportunities |
| `/api/cron/triage` | every 2h (+15m) | LLM score NEW → TRIAGED/SKIPPED |
| `/api/cron/draft` | every 2h (+30m) | TRIAGED → DRAFTED (2 variants) |
| `/api/cron/attribution` | every 6h | reconcile Stripe |
| `/api/cron/summary` | daily 08:00 | Telegram daily digest |

Protect them in production by setting `CRON_SECRET`: routes then require
`Authorization: Bearer <CRON_SECRET>`, which Vercel Cron sends automatically.
You can also POST any of them manually (e.g. the "Run radar now" dashboard button).

## Guardrails (implemented, not just documented)

- **Strict dedup** on `externalId` (Postgres `skipDuplicates`).
- **Rate limiting** on external calls (`lib/rate-limit.ts`).
- **Anti-ban ratio**: `AccountActivity` tracks helpful vs with-link replies per
  day; the inbox warns if you'd drop below `HELPFUL_TO_LINK_RATIO` (default 9:1)
  or pass `DAILY_POST_LIMIT` (default 12).
- **One tracked link max** per reply, injected by the app (stray model URLs are
  stripped).
- **All LLM output is Zod-validated** before it touches the DB (with one retry).
- **No auto-publishing** anywhere.

## Tests

```bash
npm test
```

Covers (per the brief) the triage JSON parsing/validation, UTM construction, and
Stripe attribution reconciliation, plus the draft link-injection and ATS fallback.

## Build / production

```bash
npm run build && npm run start
```

### Deploy (Vercel + managed Postgres + Vercel Cron)

1. Create a managed Postgres (Vercel Postgres / Neon / Supabase) and set
   `DATABASE_URL`.
2. `npm run db:deploy` (runs `prisma migrate deploy`) against it.
3. Import the repo into Vercel; set all env vars (incl. `CRON_SECRET`,
   `APP_PASSWORD`).
4. `vercel.json` registers the crons automatically.
5. Point FutuRole's signup webhook + Stripe checkout metadata at the deployment
   (see contracts above).

## v2 / next steps

- **Discord** (`lib/sources/discord.ts`): read-only discord.js collector reusing
  the same `ingestOpportunities` pipeline (stub today).
- **Dedicated worker**: move `runRadar/runTriage/runDrafts` to BullMQ/Trigger.dev
  (logic is already isolated in `/lib`).
- **Settings UI** for managing sources/keywords in-app.
- Click tracking for `PostedReply.clicks` (e.g. a redirect endpoint) and
  multi-currency MRR.
- Migrate `@google/generative-ai` → `@google/genai`.
