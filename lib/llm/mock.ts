import type { Opportunity } from "@prisma/client";

/**
 * Deterministic offline heuristics used when LLM_MOCK=true, so the triage and
 * draft pipelines can be exercised end-to-end without a Gemini key (dev/CI).
 * NOT used in production.
 */
export function mockTriageRaw(
  opp: Pick<Opportunity, "title" | "body" | "signals">,
): Record<string, unknown> {
  const text = `${opp.title ?? ""}\n${opp.body}`.toLowerCase();
  const isRant = /(rant|venting|not looking for advice|toxic)/.test(text);

  let score = 25;
  if (opp.signals.length > 0) score += 15;
  if (/(resume|cv|ats)/.test(text)) score += 25;
  if (/(no callbacks|no interviews|auto[- ]?reject|rejected|ghosted|filtered)/.test(text))
    score += 25;
  if (/(feedback|review|help|how do i)/.test(text)) score += 10;
  if (isRant) score = 15;
  score = Math.max(0, Math.min(100, score));

  let persona = "unknown";
  if (/(new ?grad|junior|entry|student|graduat)/.test(text)) persona = "junior";
  else if (/(senior|staff|principal|years of experience|\d+\s*yoe)/.test(text))
    persona = "senior";
  else if (/(career|switch|transition|pivot)/.test(text)) persona = "career-change";

  const hasResumeLink =
    /(http|\.pdf|share (my|the) resume|here'?s my resume|happy to share)/.test(text);

  return {
    intentScore: score,
    persona,
    hasResumeLink,
    pain: isRant ? "Off-topic venting." : (opp.title ?? "Job-search struggle"),
    recommendedAction: !isRant && score >= 50 ? "comment" : "skip",
  };
}

export interface MockDraftInput {
  title: string | null;
  pain: string | null;
  persona: string | null;
  trackedUrl: string;
}

/** Two value-first reply variants for offline drafting. */
export function mockDraftVariants(input: MockDraftInput): {
  variantA: string;
  variantB: string;
} {
  const focus = input.pain || input.title || "your job search";
  return {
    variantA: `Reading your post — "${(input.title ?? focus).slice(0, 80)}" — the pattern usually comes down to two things: keyword alignment with the job description and whether the layout parses cleanly. Two quick checks: mirror the posting's hard skills in your most recent bullets, and drop multi-column/table layouts that ATS often mangle. If useful, this free scanner flags those line by line, no signup: ${input.trackedUrl}`,
    variantB: `This is common and fixable. Highest-leverage moves: (1) echo the exact hard skills from the job description in your bullets, (2) single-column layout with standard headings so the parser reads it. Want a fast diagnostic of your ATS score + missing keywords? Free, instant: ${input.trackedUrl}`,
  };
}
