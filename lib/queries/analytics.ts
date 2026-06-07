import { prisma } from "@/lib/db";
import { OppStatus } from "@prisma/client";

export interface HealthMetrics {
  skipRate: number; // 0..1
  triagedTotal: number;
  skipped: number;
  /** Mean time between the original post and my reply, in ms (null if none). */
  avgResponseMs: number | null;
  postedCount: number;
}

export async function getHealthMetrics(): Promise<HealthMetrics> {
  const [grouped, posted] = await Promise.all([
    prisma.opportunity.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.postedReply.findMany({
      include: { opportunity: { select: { postedAt: true } } },
    }),
  ]);

  const c = (s: OppStatus) =>
    grouped.find((g) => g.status === s)?._count._all ?? 0;

  const skipped = c(OppStatus.SKIPPED);
  const triagedTotal =
    c(OppStatus.TRIAGED) +
    c(OppStatus.DRAFTED) +
    c(OppStatus.APPROVED) +
    c(OppStatus.POSTED) +
    skipped;

  const diffs = posted
    .map((p) => p.postedAt.getTime() - p.opportunity.postedAt.getTime())
    .filter((d) => d >= 0);
  const avgResponseMs = diffs.length
    ? diffs.reduce((a, b) => a + b, 0) / diffs.length
    : null;

  return {
    skipRate: triagedTotal ? skipped / triagedTotal : 0,
    triagedTotal,
    skipped,
    avgResponseMs,
    postedCount: posted.length,
  };
}
