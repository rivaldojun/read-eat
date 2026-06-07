/**
 * Discord source — v2 (stub, intentionally inert).
 *
 * Planned: a read-only discord.js v14 client that watches configured channels
 * in opted-in servers, applies the same keyword matching + `ingestOpportunities`
 * pipeline as Reddit. Kept as a no-op so the radar orchestrator can wire it in
 * later without code changes elsewhere. Requires DISCORD_BOT_TOKEN.
 */
import { log } from "@/lib/log";
import type { IngestResult } from "@/lib/sources/types";

export async function collectDiscordOpportunities(): Promise<IngestResult[]> {
  log.info("radar:discord", "Discord collection is v2 — skipped");
  return [];
}
