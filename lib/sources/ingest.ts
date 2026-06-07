import { prisma } from "@/lib/db";
import { OppStatus } from "@prisma/client";
import type { RawPost } from "@/lib/sources/types";

/**
 * Insert posts as NEW opportunities, deduplicating on `externalId`.
 * Uses Postgres `skipDuplicates`, so calling the radar repeatedly never
 * creates duplicate rows (brief §6 acceptance criterion).
 */
export async function ingestOpportunities(
  sourceId: string,
  posts: RawPost[],
): Promise<{ inserted: number; skipped: number }> {
  if (posts.length === 0) return { inserted: 0, skipped: 0 };

  const result = await prisma.opportunity.createMany({
    skipDuplicates: true,
    data: posts.map((p) => ({
      sourceId,
      externalId: p.externalId,
      permalink: p.permalink,
      author: p.author,
      title: p.title,
      body: p.body,
      postedAt: p.postedAt,
      signals: p.signals,
      status: OppStatus.NEW,
    })),
  });

  return { inserted: result.count, skipped: posts.length - result.count };
}
