<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# FutuRole Growth Copilot — project notes

Internal, single-user, human-in-the-loop growth tool. See `README.md` for full docs.

**Hard invariant: the app NEVER posts to Reddit/Discord.** It detects, triages,
drafts, and tracks; the human posts manually and clicks "Mark posted". Do not add
any auto-publishing. Reddit/Discord integrations are read-only.

Conventions:
- All cron/business logic lives in `/lib` (routes are thin wrappers) so it can
  move to a worker later. Routes: `/api/cron/{radar,triage,draft,attribution,summary}`.
- Status flow: `NEW → TRIAGED → DRAFTED → APPROVED → POSTED` (or `SKIPPED`).
- All LLM output and API inputs are Zod-validated; LLM calls retry once.
- `utm_campaign` is ALWAYS the Opportunity id — the attribution join key.
- Drafts carry exactly one tracked link, injected via the `{{SCANNER_LINK}}`
  placeholder (`lib/llm/draft.ts`); stray model URLs are stripped.
- Dev without external keys: `RADAR_MOCK=true` and `LLM_MOCK=true`.
- Next 16 renamed `middleware` → `proxy` (`proxy.ts`) — that's the password gate.
- Env is centralised + Zod-validated in `lib/env.ts`; use `requireEnv()` for secrets.
- DB: Prisma + Postgres. `npm run db:migrate`, `npm run db:seed`. Tests: `npm test`.
