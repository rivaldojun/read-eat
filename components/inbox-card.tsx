"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Check,
  ExternalLink,
  Send,
  X,
  Flame,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface InboxItem {
  id: string;
  title: string | null;
  body: string;
  permalink: string;
  author: string;
  sourceName: string;
  signals: string[];
  intentScore: number | null;
  persona: string | null;
  pain: string | null;
  status: "DRAFTED" | "APPROVED";
  postedAt: string;
  variantA: string;
  variantB: string;
}

function scoreVariant(score: number | null): "default" | "success" | "warning" {
  if (score === null) return "default";
  if (score >= 90) return "warning";
  if (score >= 75) return "success";
  return "default";
}

export function InboxCard({ item }: { item: InboxItem }) {
  const router = useRouter();
  const [tab, setTab] = useState<"A" | "B">("A");
  const [textA, setTextA] = useState(item.variantA);
  const [textB, setTextB] = useState(item.variantB);
  const [busy, setBusy] = useState<null | "copy" | "approve" | "post" | "skip">(
    null,
  );

  const currentText = tab === "A" ? textA : textB;

  async function copyToClipboard(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(currentText);
      return true;
    } catch {
      toast.error("Clipboard blocked — select the text and copy manually.");
      return false;
    }
  }

  async function call(action: string, body?: unknown) {
    const res = await fetch(`/api/opportunities/${item.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  async function onCopy() {
    setBusy("copy");
    const ok = await copyToClipboard();
    if (ok) toast.success("Copied to clipboard");
    setBusy(null);
  }

  async function onApprove() {
    setBusy("approve");
    try {
      const copied = await copyToClipboard();
      await call("approve", { finalText: currentText });
      toast.success(
        copied ? "Approved & copied — now post it manually" : "Approved",
      );
      router.refresh();
    } catch (err) {
      toast.error(`Approve failed: ${msg(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onMarkPosted() {
    setBusy("post");
    try {
      await call("mark-posted", { finalText: currentText });
      toast.success("Marked as posted ✓");
      router.refresh();
    } catch (err) {
      toast.error(`Failed: ${msg(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function onSkip() {
    setBusy("skip");
    try {
      await call("skip");
      toast("Skipped");
      router.refresh();
    } catch (err) {
      toast.error(`Failed: ${msg(err)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{item.sourceName}</Badge>
          {item.intentScore !== null ? (
            <Badge variant={scoreVariant(item.intentScore)}>
              {item.intentScore >= 90 ? <Flame /> : null}
              score {item.intentScore}
            </Badge>
          ) : null}
          {item.persona ? <Badge variant="outline">{item.persona}</Badge> : null}
          {item.status === "APPROVED" ? (
            <Badge variant="success">approved</Badge>
          ) : null}
          <span className="text-muted-foreground ml-auto text-xs">
            u/{item.author}
          </span>
        </div>
        <CardTitle className="text-base leading-snug">
          {item.title || "(untitled)"}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: original post */}
          <div className="space-y-3">
            <div className="text-muted-foreground max-h-56 overflow-y-auto rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {item.body || "(no body)"}
            </div>
            {item.pain ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Pain: </span>
                {item.pain}
              </p>
            ) : null}
            {item.signals.length ? (
              <div className="flex flex-wrap gap-1">
                {item.signals.map((s) => (
                  <Badge key={s} variant="outline" className="text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <a href={item.permalink} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Open original
              </a>
            </Button>
          </div>

          {/* Right: editable drafts */}
          <div className="space-y-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "A" | "B")}>
              <TabsList>
                <TabsTrigger value="A">Variant A</TabsTrigger>
                <TabsTrigger value="B">Variant B</TabsTrigger>
              </TabsList>
              <TabsContent value="A" className="mt-3">
                <Textarea
                  value={textA}
                  onChange={(e) => setTextA(e.target.value)}
                  className="min-h-44"
                />
              </TabsContent>
              <TabsContent value="B" className="mt-3">
                <Textarea
                  value={textB}
                  onChange={(e) => setTextB(e.target.value)}
                  className="min-h-44"
                />
              </TabsContent>
            </Tabs>

            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>{currentText.length} chars</span>
              <span
                className={cn(
                  /https?:\/\//i.test(currentText)
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              >
                {/https?:\/\//i.test(currentText) ? "contains link" : "no link"}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={onCopy} disabled={!!busy}>
                {busy === "copy" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Copy className="size-4" />
                )}
                Copy
              </Button>
              <Button size="sm" onClick={onApprove} disabled={!!busy}>
                {busy === "approve" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Approve &amp; copy
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onMarkPosted}
                disabled={!!busy}
              >
                {busy === "post" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Mark posted
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onSkip}
                disabled={!!busy}
                className="ml-auto"
              >
                {busy === "skip" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
                Skip
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
