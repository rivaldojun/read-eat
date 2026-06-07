import { NextResponse } from "next/server";

import { assertCronAuth } from "@/lib/cron-auth";
import { reconcileStripe } from "@/lib/attribution/stripe";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Attribution cron: reconcile Stripe subscriptions into Attribution rows. */
async function handler(req: Request) {
  const auth = assertCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const summary = await reconcileStripe();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    log.error("attribution", "run failed", {
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
