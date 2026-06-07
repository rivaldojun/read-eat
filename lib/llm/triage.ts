import { z } from "zod";
import { OppStatus, type Opportunity } from "@prisma/client";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { geminiLimiter } from "@/lib/rate-limit";
import { generateJson } from "@/lib/llm/gemini";
import { extractJsonObject } from "@/lib/llm/json";
import { mockTriageRaw } from "@/lib/llm/mock";

export const PERSONAS = ["junior", "senior", "career-change", "unknown"] as const;

/** Normalise free-form persona strings into our enum. */
const PersonaSchema = z.preprocess((v) => {
  if (typeof v !== "string") return "unknown";
  const s = v.toLowerCase().trim();
  if (/(junior|new ?grad|entry|student|graduate)/.test(s)) return "junior";
  if (/(senior|staff|principal|lead|experienced|\d{2}\s*yo)/.test(s)) return "senior";
  if (/(career|switch|transition|pivot|chang)/.test(s)) return "career-change";
  return (PERSONAS as readonly string[]).includes(s) ? s : "unknown";
}, z.enum(PERSONAS));

const Booleanish = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() === "true" : v),
  z.boolean(),
);

const ActionSchema = z.preprocess((v) => {
  if (typeof v !== "string") return "skip";
  return /(comment|reply|engage|respond|yes)/i.test(v) ? "comment" : "skip";
}, z.enum(["comment", "skip"]));

/**
 * Validated triage output (brief §2). Lenient on the wire (clamps the score,
 * normalises persona/action/booleans) but strict on the resulting shape.
 */
export const TriageResultSchema = z.object({
  intentScore: z.coerce
    .number()
    .transform((n) => Math.max(0, Math.min(100, Math.round(n)))),
  persona: PersonaSchema,
  hasResumeLink: Booleanish,
  pain: z.coerce.string().transform((s) => s.trim().slice(0, 600)),
  recommendedAction: ActionSchema,
});

export type TriageResult = z.infer<typeof TriageResultSchema>;

/** Pure: extract + JSON.parse + Zod-validate. Throws on invalid input. */
export function parseTriageResponse(raw: string): TriageResult {
  const json = extractJsonObject(raw);
  const obj = JSON.parse(json) as unknown;
  return TriageResultSchema.parse(obj);
}

const TRIAGE_SYSTEM = `You are a precise triage classifier for FutuRole, a tool that helps job seekers beat resume/ATS filters.
You read a single community post (e.g. from Reddit) and judge whether the author is a job seeker who would genuinely benefit from a free ATS resume scan.

Output ONLY a JSON object (no markdown, no prose, no code fences) with EXACTLY these keys:
{
  "intentScore": <integer 0-100, how strongly this person wants/needs resume or ATS help right now>,
  "persona": <one of "junior" | "senior" | "career-change" | "unknown">,
  "hasResumeLink": <boolean, true if they shared or offered to share a resume/CV link or text>,
  "pain": <short string: the concrete pain in <= 1 sentence>,
  "recommendedAction": <"comment" if it's a genuine, on-topic chance to help, else "skip">
}

Scoring guidance:
- High (80-100): explicitly asking for resume/ATS/CV feedback, or describing "no callbacks / auto-rejected / no interviews".
- Medium (50-79): job-search frustration where a resume scan plausibly helps.
- Low (0-49): off-topic, ranting only, hiring-side, already solved, or not job seeking.
Set recommendedAction to "skip" for anything off-topic, hostile, or where a link would be spammy.`;

function buildTriagePrompt(opp: Pick<Opportunity, "title" | "body" | "signals">): string {
  return [
    `SOURCE SIGNALS (matched keywords): ${opp.signals.join(", ") || "none"}`,
    `TITLE: ${opp.title ?? "(none)"}`,
    `BODY:`,
    opp.body.slice(0, 4000) || "(empty)",
  ].join("\n");
}

/** Triage one opportunity, retrying once if the JSON is invalid (brief §2). */
export async function triageOpportunity(
  opp: Pick<Opportunity, "title" | "body" | "signals">,
): Promise<TriageResult> {
  if (env.LLM_MOCK === "true") {
    return TriageResultSchema.parse(mockTriageRaw(opp));
  }

  const prompt = buildTriagePrompt(opp);
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    await geminiLimiter.acquire();
    try {
      const raw = await generateJson({
        model: env.GEMINI_TRIAGE_MODEL,
        systemInstruction: TRIAGE_SYSTEM,
        prompt,
        temperature: 0.1,
      });
      return parseTriageResponse(raw);
    } catch (err) {
      lastError = err;
      log.warn("triage", "invalid/failed response, retrying", {
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Triage failed after retry");
}

export interface TriageSummary {
  processed: number;
  triaged: number;
  skipped: number;
  failed: number;
}

/**
 * Triage NEW opportunities. Passing => TRIAGED, below threshold or
 * recommendedAction=skip => SKIPPED. Failures are left NEW to retry next run.
 */
export async function runTriage(limit = 25): Promise<TriageSummary> {
  const news = await prisma.opportunity.findMany({
    where: { status: OppStatus.NEW },
    orderBy: { postedAt: "desc" },
    take: limit,
  });

  const summary: TriageSummary = {
    processed: 0,
    triaged: 0,
    skipped: 0,
    failed: 0,
  };

  for (const opp of news) {
    summary.processed++;
    try {
      const result = await triageOpportunity(opp);
      const passes =
        result.recommendedAction === "comment" &&
        result.intentScore >= env.TRIAGE_SCORE_THRESHOLD;

      await prisma.opportunity.update({
        where: { id: opp.id },
        data: {
          intentScore: result.intentScore,
          persona: result.persona === "unknown" ? null : result.persona,
          pain: result.pain,
          status: passes ? OppStatus.TRIAGED : OppStatus.SKIPPED,
        },
      });

      if (passes) summary.triaged++;
      else summary.skipped++;

      log.info("triage", "scored", {
        id: opp.id,
        score: result.intentScore,
        status: passes ? "TRIAGED" : "SKIPPED",
      });
    } catch (err) {
      summary.failed++;
      log.error("triage", "opportunity failed", {
        id: opp.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
