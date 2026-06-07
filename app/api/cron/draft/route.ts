import { NextResponse } from "next/server";

import { assertCronAuth } from "@/lib/cron-auth";
import { runDrafts } from "@/lib/llm/draft";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Draft cron: turns TRIAGED opportunities into DRAFTED with 2 reply variants. */
async function handler(req: Request) {
  const auth = assertCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const summary = await runDrafts();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    log.error("draft", "run failed", {
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
