import { z } from "zod";
import { OppStatus, type Opportunity, type Source } from "@prisma/client";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { geminiLimiter } from "@/lib/rate-limit";
import { generateJson } from "@/lib/llm/gemini";
import { extractJsonObject } from "@/lib/llm/json";
import { mockDraftVariants } from "@/lib/llm/mock";
import { getAtsDiagnostic, type AtsDiagnostic } from "@/lib/ats/scorer";
import { buildTrackedUrl } from "@/lib/attribution/utm";

export const SCANNER_PLACEHOLDER = "{{SCANNER_LINK}}";

export const DraftResultSchema = z.object({
  variantA: z.string().min(20),
  variantB: z.string().min(20),
});
export type DraftResult = z.infer<typeof DraftResultSchema>;

export function parseDraftResponse(raw: string): DraftResult {
  const json = extractJsonObject(raw);
  const obj = JSON.parse(json) as unknown;
  return DraftResultSchema.parse(obj);
}

/**
 * Enforce the "exactly one tracked link" rule (brief §6/§8): strip any raw URLs
 * the model added, then put the tracked URL where the single placeholder is
 * (or append it if the model omitted the placeholder).
 */
export function injectTrackedLink(text: string, trackedUrl: string): string {
  // Remove any stray URLs the model may have invented.
  let t = text.replace(/https?:\/\/\S+/g, "").replace(/[ \t]{2,}/g, " ");

  let used = false;
  t = t.replace(/\{\{\s*SCANNER_LINK\s*\}\}/g, () => {
    if (used) return "";
    used = true;
    return trackedUrl;
  });

  if (!used) t = `${t.trim()}\n\n${trackedUrl}`;
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Remove long dashes (em "—", en "–", horizontal bar "―") — a common "written
 * by AI" tell — replacing them with a comma, then tidying punctuation/spacing.
 * Regular hyphens ("-", e.g. "career-change") are left untouched. Newlines are
 * preserved.
 */
export function stripLongDashes(text: string): string {
  return text
    .replace(/[ \t]*[—–―][ \t]*/g, ", ")
    .replace(/[ \t]+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

const DRAFT_SYSTEM = `You are the founder of FutuRole replying as a genuinely helpful peer in an online community (e.g. Reddit). Your goal is to actually help a job seeker, building goodwill — NOT to sell.

Hard rules:
- Value first: lead with a concrete, specific diagnosis/tip tailored to THIS person's situation.
- Authentic, warm, peer-to-peer tone. Never salesy. Never say "as the founder" or pitch a product.
- No generic copy-paste: reference their specific situation/persona/pain.
- At most ONE link, and only via the EXACT placeholder ${SCANNER_PLACEHOLDER} used once, as a soft optional offer near the end (e.g. "if it helps, this free scanner..."). Do NOT write any real URL yourself.
- Keep each variant concise (about 60-110 words).
- Do NOT use em dashes or en dashes ("—", "–"). Use commas, periods, or parentheses instead. Plain hyphens in compound words are fine.

Return ONLY a JSON object (no markdown, no code fences) with exactly:
{"variantA": "<reply text with ${SCANNER_PLACEHOLDER} once>", "variantB": "<a meaningfully different angle, also with ${SCANNER_PLACEHOLDER} once>"}`;

function buildDraftPrompt(
  opp: Pick<Opportunity, "title" | "body" | "persona" | "pain" | "signals">,
  diagnostic: AtsDiagnostic | null,
): string {
  const lines = [
    `PERSONA: ${opp.persona ?? "unknown"}`,
    `DETECTED PAIN: ${opp.pain ?? "(unknown)"}`,
    `MATCHED SIGNALS: ${opp.signals.join(", ") || "none"}`,
    `POST TITLE: ${opp.title ?? "(none)"}`,
    `POST BODY: ${opp.body.slice(0, 2500)}`,
  ];
  if (diagnostic) {
    lines.push(
      "",
      `ATS DIAGNOSTIC (use these concrete findings in your reply):`,
      `- score: ${diagnostic.score}/100`,
      diagnostic.findings.length
        ? `- findings: ${diagnostic.findings.join(" | ")}`
        : "- findings: none",
      diagnostic.missingKeywords.length
        ? `- missing keywords: ${diagnostic.missingKeywords.join(", ")}`
        : "- missing keywords: none",
    );
  } else {
    lines.push(
      "",
      "No resume text/link was shared, so give specific, actionable ATS advice based on their situation (do not invent diagnostic numbers).",
    );
  }
  return lines.join("\n");
}

/** Produce two raw variants (with the {{SCANNER_LINK}} placeholder). */
async function generateRawVariants(
  opp: Pick<Opportunity, "title" | "body" | "persona" | "pain" | "signals">,
  diagnostic: AtsDiagnostic | null,
): Promise<DraftResult> {
  if (env.LLM_MOCK === "true") {
    return DraftResultSchema.parse(
      mockDraftVariants({ title: opp.title, pain: opp.pain, persona: opp.persona }),
    );
  }

  const prompt = buildDraftPrompt(opp, diagnostic);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    await geminiLimiter.acquire();
    try {
      const raw = await generateJson({
        model: env.GEMINI_DRAFT_MODEL,
        systemInstruction: DRAFT_SYSTEM,
        prompt,
        temperature: 0.8,
      });
      return parseDraftResponse(raw);
    } catch (err) {
      lastError = err;
      log.warn("draft", "invalid/failed response, retrying", {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Draft failed after retry");
}

export interface DraftSummary {
  processed: number;
  drafted: number;
  failed: number;
}

/**
 * Generate drafts for TRIAGED opportunities that don't have one yet.
 * Always injects exactly one tracked link (utm_campaign = opportunityId).
 */
export async function runDrafts(limit = 15): Promise<DraftSummary> {
  const triaged = await prisma.opportunity.findMany({
    where: { status: OppStatus.TRIAGED, draft: null },
    include: { source: true },
    orderBy: { intentScore: "desc" },
    take: limit,
  });

  const summary: DraftSummary = { processed: 0, drafted: 0, failed: 0 };

  for (const opp of triaged) {
    summary.processed++;
    try {
      const diagnostic = await getAtsDiagnostic(opp);
      const trackedUrl = buildTrackedUrl(env.FUTUROLE_SCANNER_URL, {
        source: (opp.source as Source).name,
        campaign: opp.id,
      });

      const raw = await generateRawVariants(opp, diagnostic);
      const variantA = stripLongDashes(injectTrackedLink(raw.variantA, trackedUrl));
      const variantB = stripLongDashes(injectTrackedLink(raw.variantB, trackedUrl));

      await prisma.$transaction([
        prisma.draft.create({
          data: {
            opportunityId: opp.id,
            utmCampaign: opp.id,
            includesLink: true,
            variantA,
            variantB,
          },
        }),
        prisma.opportunity.update({
          where: { id: opp.id },
          data: { status: OppStatus.DRAFTED },
        }),
      ]);

      summary.drafted++;
      log.info("draft", "drafted", { id: opp.id, diagnostic: diagnostic?.source ?? "none" });
    } catch (err) {
      summary.failed++;
      log.error("draft", "opportunity failed", {
        id: opp.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
