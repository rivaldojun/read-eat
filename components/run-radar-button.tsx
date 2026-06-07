"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Radar, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * Triggers the radar cron endpoint manually. NEVER posts anything — it only
 * collects opportunities. Refreshes the page on success so new NEW rows appear.
 */
export function RunRadarButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/cron/radar", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      toast.success(
        `Radar done — ${data.totalInserted} new, ${data.totalSkipped} dupes skipped`,
      );
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(
        `Radar failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setLoading(false);
    }
  }

  const busy = loading || pending;

  return (
    <Button onClick={run} disabled={busy} size="sm">
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Radar className="size-4" />
      )}
      Run radar now
    </Button>
  );
}
