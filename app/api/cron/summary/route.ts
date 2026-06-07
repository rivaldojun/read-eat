import { NextResponse } from "next/server";

import { assertCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { todayUtc } from "@/lib/guardrail";
import { getGlobalFunnel } from "@/lib/queries/attribution";
import { sendDailySummary } from "@/lib/notify/telegram";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Daily summary cron: sends a Telegram digest of today's activity + totals. */
async function handler(req: Request) {
  const auth = assertCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const dayStart = todayUtc();
    const [foundToday, postedToday, funnel] = await Promise.all([
      prisma.opportunity.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.postedReply.count({ where: { postedAt: { gte: dayStart } } }),
      getGlobalFunnel(),
    ]);

    const summary = {
      foundToday,
      postedToday,
      clicks: funnel.clicks,
      signups: funnel.signups,
      paidUsers: funnel.paidUsers,
      mrrCents: funnel.mrrCents,
    };

    const sent = await sendDailySummary(summary);
    return NextResponse.json({ ok: true, sent, ...summary });
  } catch (err) {
    log.error("summary", "run failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = handler;
export const POST = handler;
