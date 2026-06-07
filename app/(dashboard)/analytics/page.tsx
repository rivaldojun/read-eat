import {
  getGlobalFunnel,
  getFunnelBySource,
  getTopOpportunities,
} from "@/lib/queries/attribution";
import { getHealthMetrics } from "@/lib/queries/analytics";
import { formatMoneyCents, humanizeDuration } from "@/lib/format";
import { StatCard } from "@/components/stat-card";
import { FunnelTable } from "@/components/funnel-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const [funnel, bySource, top, health] = await Promise.all([
    getGlobalFunnel(),
    getFunnelBySource(),
    getTopOpportunities(10),
    getHealthMetrics(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Where the cash comes from, and pipeline health.
        </p>
      </header>

      {/* Global funnel */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Global funnel
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Posted" value={funnel.posted} />
          <StatCard label="Clicks" value={funnel.clicks} />
          <StatCard label="Signups" value={funnel.signups} />
          <StatCard label="Trials" value={funnel.trials} />
          <StatCard label="Paid" value={funnel.paidUsers} />
          <StatCard label="MRR" value={formatMoneyCents(funnel.mrrCents)} />
        </div>
      </section>

      {/* Health */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Pipeline health
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Skip rate"
            value={`${Math.round(health.skipRate * 100)}%`}
            hint={`${health.skipped} skipped of ${health.triagedTotal} triaged`}
          />
          <StatCard
            label="Avg. post → reply"
            value={humanizeDuration(health.avgResponseMs)}
            hint="time from original post to my reply"
          />
          <StatCard label="Replies posted" value={health.postedCount} />
        </div>
      </section>

      {/* Revenue by source */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by source</CardTitle>
            <CardDescription>Sorted by attributed MRR.</CardDescription>
          </CardHeader>
          <CardContent>
            <FunnelTable rows={bySource} />
          </CardContent>
        </Card>
      </section>

      {/* Top opportunities */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top opportunities</CardTitle>
            <CardDescription>Best posted replies by MRR / signups.</CardDescription>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No posted replies yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Opportunity</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Signups</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {top.map((o) => (
                    <TableRow key={o.opportunityId}>
                      <TableCell className="max-w-[260px] truncate font-medium">
                        {o.title ?? "(untitled)"}
                      </TableCell>
                      <TableCell>{o.sourceName}</TableCell>
                      <TableCell className="text-right">
                        {o.intentScore ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">{o.clicks}</TableCell>
                      <TableCell className="text-right">{o.signups}</TableCell>
                      <TableCell className="text-right">{o.paidUsers}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoneyCents(o.mrrCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
