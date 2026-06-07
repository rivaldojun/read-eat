import { collectRedditOpportunities } from "@/lib/sources/reddit";
import type { IngestResult } from "@/lib/sources/types";
import { log } from "@/lib/log";

export interface RadarSummary {
  startedAt: string;
  finishedAt: string;
  totalFetched: number;
  totalInserted: number;
  totalSkipped: number;
  perSource: IngestResult[];
}

/**
 * One radar pass: collect from all enabled sources and dedup-insert NEW
 * opportunities. Reddit only for now; Discord is v2 (see sources/discord.ts).
 * Business logic lives here (not in the route) so it can move to a dedicated
 * worker later without rewrites (brief §3).
 */
export async function runRadar(): Promise<RadarSummary> {
  const startedAt = new Date().toISOString();
  log.info("radar", "run started");

  const perSource: IngestResult[] = await collectRedditOpportunities();

  const summary: RadarSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalFetched: perSource.reduce((n, r) => n + r.fetched, 0),
    totalInserted: perSource.reduce((n, r) => n + r.inserted, 0),
    totalSkipped: perSource.reduce((n, r) => n + r.skipped, 0),
    perSource,
  };

  log.info("radar", "run finished", {
    inserted: summary.totalInserted,
    skipped: summary.totalSkipped,
  });
  return summary;
}
