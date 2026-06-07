import Link from "next/link";
import { ArrowRight, ShieldCheck, ShieldAlert } from "lucide-react";

import { prisma } from "@/lib/db";
import { OppStatus } from "@prisma/client";
import { getGuardrailStatus } from "@/lib/guardrail";
import { getGlobalFunnel, getFunnelBySource } from "@/lib/queries/attribution";
import { formatMoneyCents } from "@/lib/format";
import { RunRadarButton } from "@/components/run-radar-button";
import { StatCard } from "@/components/stat-card";
import { FunnelTable } from "@/components/funnel-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const STATUS_ORDER: OppStatus[] = [
  OppStatus.NEW,
  OppStatus.TRIAGED,
  OppStatus.DRAFTED,
  OppStatus.APPROVED,
  OppStatus.POSTED,
  OppStatus.SKIPPED,
];

export default async function DashboardPage() {
  const [grouped, enabledSources, funnel, bySource, guardrail] =
    await Promise.all([
      prisma.opportunity.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.source.count({ where: { enabled: true } }),
      getGlobalFunnel(),
      getFunnelBySource(),
      getGuardrailStatus(),
    ]);

  const counts = new Map<OppStatus, number>(
    grouped.map((g) => [g.status, g._count._all]),
  );
  const count = (s: OppStatus) => counts.get(s) ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            {enabledSources} active source{enabledSources === 1 ? "" : "s"} ·
            human-in-the-loop, nothing is posted automatically.
          </p>
        </div>
        <RunRadarButton />
      </header>

      {/* Pipeline funnel */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Pipeline
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STATUS_ORDER.map((s) => (
            <StatCard key={s} label={s} value={count(s)} />
          ))}
        </div>
      </section>

      {/* Revenue */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Attributed revenue
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Clicks" value={funnel.clicks} />
          <StatCard label="Signups" value={funnel.signups} />
          <StatCard label="Paying users" value={funnel.paidUsers} />
          <StatCard
            label="MRR"
            value={formatMoneyCents(funnel.mrrCents)}
            hint={`${funnel.trials} trials in flight`}
          />
        </div>
      </section>

      {/* Revenue by source */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by source</CardTitle>
            <CardDescription>
              Which communities actually turn into cash.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FunnelTable rows={bySource} />
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Inbox shortcut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approval inbox</CardTitle>
            <CardDescription>
              {count(OppStatus.DRAFTED)} drafted opportunit
              {count(OppStatus.DRAFTED) === 1 ? "y" : "ies"} waiting for your
              review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/inbox">
                Open inbox <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Guardrail */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {guardrail.withinLimit ? (
                <ShieldCheck className="size-4 text-success" />
              ) : (
                <ShieldAlert className="size-4 text-warning" />
              )}
              Anti-ban guardrail · today
            </CardTitle>
            <CardDescription>
              Target ratio ≥ {guardrail.ratioTarget} helpful : 1 with-link
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">
                {guardrail.postsHelpful} helpful
              </Badge>
              <Badge variant="secondary">
                {guardrail.postsWithLink} with link
              </Badge>
              {guardrail.withinLimit ? (
                <Badge variant="success">within limit</Badge>
              ) : (
                <Badge variant="warning">ratio exceeded</Badge>
              )}
            </div>
            {!guardrail.withinLimit ? (
              <p className="text-warning text-xs">
                Post ~{guardrail.recommendedHelpfulBeforeNextLink} more helpful
                (no-link) replies before your next link.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
