import { Inbox as InboxIcon, ShieldCheck, ShieldAlert } from "lucide-react";

import { prisma } from "@/lib/db";
import { OppStatus } from "@prisma/client";
import { getGuardrailStatus } from "@/lib/guardrail";
import { InboxCard, type InboxItem } from "@/components/inbox-card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const [opps, guardrail] = await Promise.all([
    prisma.opportunity.findMany({
      where: { status: { in: [OppStatus.DRAFTED, OppStatus.APPROVED] } },
      include: { draft: true, source: true },
      orderBy: { intentScore: { sort: "desc", nulls: "last" } },
    }),
    getGuardrailStatus(),
  ]);

  const items: InboxItem[] = opps
    .filter((o) => o.draft)
    .map((o) => ({
      id: o.id,
      title: o.title,
      body: o.body,
      permalink: o.permalink,
      author: o.author,
      sourceName: o.source.name,
      signals: o.signals,
      intentScore: o.intentScore,
      persona: o.persona,
      pain: o.pain,
      status: o.status as "DRAFTED" | "APPROVED",
      postedAt: o.postedAt.toISOString(),
      variantA: o.draft!.variantA,
      variantB: o.draft!.variantB,
    }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Inbox</h1>
            <p className="text-muted-foreground text-sm">
              {items.length} opportunit{items.length === 1 ? "y" : "ies"} to
              review · you post manually, the app never publishes.
            </p>
          </div>
        </div>

        {/* Anti-ban guardrail strip */}
        <div className="bg-card flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          {guardrail.withinLimit && !guardrail.paceWarning ? (
            <ShieldCheck className="size-4 text-success" />
          ) : (
            <ShieldAlert className="size-4 text-warning" />
          )}
          <span className="text-muted-foreground">Today:</span>
          <Badge variant="secondary">{guardrail.postsHelpful} helpful</Badge>
          <Badge variant="secondary">{guardrail.postsWithLink} with link</Badge>
          <Badge variant="secondary">
            {guardrail.totalPosts}/{guardrail.dailyLimit} posts
          </Badge>
          {guardrail.withinLimit ? (
            <Badge variant="success">
              ratio ≥ {guardrail.ratioTarget}:1 ok
            </Badge>
          ) : (
            <Badge variant="warning">
              ratio exceeded — post ~{guardrail.recommendedHelpfulBeforeNextLink}{" "}
              more helpful first
            </Badge>
          )}
          {guardrail.paceWarning ? (
            <Badge variant="warning">daily pace limit reached</Badge>
          ) : null}
        </div>
      </header>

      {items.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center text-sm">
          <InboxIcon className="size-8" />
          <p>Nothing to review. Run the radar, then triage + draft.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <InboxCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
