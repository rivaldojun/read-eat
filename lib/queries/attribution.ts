import { prisma } from "@/lib/db";

export interface FunnelTotals {
  posted: number;
  clicks: number;
  signups: number;
  trials: number;
  paidUsers: number;
  mrrCents: number;
}

export interface SourceFunnel extends FunnelTotals {
  sourceId: string;
  sourceName: string;
}

export interface OppFunnel extends FunnelTotals {
  opportunityId: string;
  title: string | null;
  sourceName: string;
  intentScore: number | null;
}

const POSTED_INCLUDE = {
  attribution: true,
  opportunity: { include: { source: true } },
} as const;

/** Funnel aggregated per source, sorted by attributed MRR desc. */
export async function getFunnelBySource(): Promise<SourceFunnel[]> {
  const posted = await prisma.postedReply.findMany({ include: POSTED_INCLUDE });
  const map = new Map<string, SourceFunnel>();

  for (const p of posted) {
    const src = p.opportunity.source;
    const cur =
      map.get(src.id) ??
      {
        sourceId: src.id,
        sourceName: src.name,
        posted: 0,
        clicks: 0,
        signups: 0,
        trials: 0,
        paidUsers: 0,
        mrrCents: 0,
      };
    cur.posted += 1;
    cur.clicks += p.clicks;
    if (p.attribution) {
      cur.signups += p.attribution.signups;
      cur.trials += p.attribution.trials;
      cur.paidUsers += p.attribution.paidUsers;
      cur.mrrCents += p.attribution.mrrCents;
    }
    map.set(src.id, cur);
  }

  return [...map.values()].sort((a, b) => b.mrrCents - a.mrrCents);
}

/** Top posted opportunities by attributed MRR then signups. */
export async function getTopOpportunities(limit = 10): Promise<OppFunnel[]> {
  const posted = await prisma.postedReply.findMany({ include: POSTED_INCLUDE });
  return posted
    .map((p) => ({
      opportunityId: p.opportunityId,
      title: p.opportunity.title,
      sourceName: p.opportunity.source.name,
      intentScore: p.opportunity.intentScore,
      posted: 1,
      clicks: p.clicks,
      signups: p.attribution?.signups ?? 0,
      trials: p.attribution?.trials ?? 0,
      paidUsers: p.attribution?.paidUsers ?? 0,
      mrrCents: p.attribution?.mrrCents ?? 0,
    }))
    .sort((a, b) => b.mrrCents - a.mrrCents || b.signups - a.signups)
    .slice(0, limit);
}

/** Global funnel totals across all posted replies. */
export async function getGlobalFunnel(): Promise<FunnelTotals> {
  const [agg, clicks, postedCount] = await Promise.all([
    prisma.attribution.aggregate({
      _sum: { signups: true, trials: true, paidUsers: true, mrrCents: true },
    }),
    prisma.postedReply.aggregate({ _sum: { clicks: true } }),
    prisma.postedReply.count(),
  ]);
  return {
    posted: postedCount,
    clicks: clicks._sum.clicks ?? 0,
    signups: agg._sum.signups ?? 0,
    trials: agg._sum.trials ?? 0,
    paidUsers: agg._sum.paidUsers ?? 0,
    mrrCents: agg._sum.mrrCents ?? 0,
  };
}
