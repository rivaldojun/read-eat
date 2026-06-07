import { env } from "@/lib/env";
import { log } from "@/lib/log";
import type { Opportunity } from "@prisma/client";

/**
 * Lightweight ATS diagnostic used to make drafts concrete.
 * Priority (brief §6):
 *   1) call the existing FutuRole ATS API if FUTUROLE_ATS_API_URL is set;
 *   2) otherwise a local keyword/heuristic fallback;
 *   3) if the post has no resume text/link at all, return null and let the
 *      draft give general-but-specific advice.
 */
export interface AtsDiagnostic {
  source: "futurole-api" | "fallback";
  score: number; // 0-100
  findings: string[];
  missingKeywords: string[];
}

export interface ResumeContext {
  hasResume: boolean;
  resumeText?: string;
  resumeUrl?: string;
}

const RESUME_SECTION_WORDS = ["experience", "education", "skills", "summary", "projects"];

/** Heuristically detect whether a post contains a resume link or pasted text. */
export function extractResumeContext(
  opp: Pick<Opportunity, "title" | "body">,
): ResumeContext {
  const text = `${opp.title ?? ""}\n${opp.body}`;
  const lower = text.toLowerCase();
  const mentionsResume = /(resume|cv)/i.test(lower);

  const urlMatch = text.match(/https?:\/\/\S+/);
  const resumeUrl =
    urlMatch && (mentionsResume || /(\.pdf|docs\.google|drive\.google|imgur)/i.test(urlMatch[0]))
      ? urlMatch[0]
      : undefined;

  const sectionHits = RESUME_SECTION_WORDS.filter((w) => lower.includes(w)).length;
  const looksPasted = mentionsResume && opp.body.length > 800 && sectionHits >= 2;

  return {
    hasResume: Boolean(resumeUrl) || looksPasted,
    resumeText: looksPasted ? opp.body : undefined,
    resumeUrl,
  };
}

const COMMON_ATS_KEYWORDS = [
  "experience",
  "education",
  "skills",
  "achievements",
  "results",
  "leadership",
  "communication",
];

/** Deterministic fallback ATS scorer over pasted resume text. */
export function fallbackDiagnostic(
  resumeText: string,
  jobKeywords: string[] = [],
): AtsDiagnostic {
  const text = resumeText.toLowerCase();
  const findings: string[] = [];
  let score = 70;

  if (!/[\w.+-]+@[\w-]+\.[\w.-]+/.test(resumeText)) {
    score -= 12;
    findings.push("No email address detected — ATS may fail to capture contact info.");
  }
  if (!/(experience|work history|employment)/.test(text)) {
    score -= 10;
    findings.push('Add a clearly labelled "Experience" section.');
  }
  if (!/(education)/.test(text)) {
    score -= 5;
    findings.push('Add an "Education" section.');
  }
  if (!/(skills)/.test(text)) {
    score -= 6;
    findings.push('Add a "Skills" section with hard skills the ATS can match.');
  }
  if (!/\d+%|\$\d|\d{2,}/.test(resumeText)) {
    score -= 8;
    findings.push("Quantify achievements (numbers, %, $) — bullets read as generic.");
  }
  if (/\t| {3,}\|/.test(resumeText)) {
    score -= 8;
    findings.push("Possible tables/columns — many ATS mangle multi-column layouts.");
  }

  // Keyword coverage vs the (best-effort) target keywords.
  const targets = Array.from(
    new Set([...jobKeywords, ...COMMON_ATS_KEYWORDS].map((k) => k.toLowerCase().trim())),
  ).filter(Boolean);
  const missingKeywords = targets.filter((k) => !text.includes(k));
  const coverage = targets.length
    ? (targets.length - missingKeywords.length) / targets.length
    : 1;
  score = Math.round(score * (0.7 + 0.3 * coverage));

  return {
    source: "fallback",
    score: Math.max(0, Math.min(100, score)),
    findings,
    missingKeywords: missingKeywords.slice(0, 8),
  };
}

/**
 * Call the FutuRole ATS API. Assumed contract (documented in the README):
 *   POST {FUTUROLE_ATS_API_URL}
 *   Authorization: Bearer {FUTUROLE_ATS_API_KEY}
 *   body: { resumeText?: string, resumeUrl?: string }
 *   200 -> { score: number, missingKeywords?: string[], findings?: string[] }
 */
async function callFuturoleApi(ctx: ResumeContext): Promise<AtsDiagnostic> {
  const res = await fetch(env.FUTUROLE_ATS_API_URL as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.FUTUROLE_ATS_API_KEY
        ? { Authorization: `Bearer ${env.FUTUROLE_ATS_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      resumeText: ctx.resumeText,
      resumeUrl: ctx.resumeUrl,
    }),
  });
  if (!res.ok) throw new Error(`FutuRole ATS API ${res.status}`);
  const data = (await res.json()) as {
    score?: number;
    missingKeywords?: string[];
    findings?: string[];
  };
  return {
    source: "futurole-api",
    score: Math.max(0, Math.min(100, Math.round(data.score ?? 0))),
    findings: data.findings ?? [],
    missingKeywords: data.missingKeywords ?? [],
  };
}

/** Best-effort ATS diagnostic for an opportunity, or null if no resume present. */
export async function getAtsDiagnostic(
  opp: Pick<Opportunity, "title" | "body" | "signals">,
): Promise<AtsDiagnostic | null> {
  const ctx = extractResumeContext(opp);
  if (!ctx.hasResume) return null;

  if (env.FUTUROLE_ATS_API_URL) {
    try {
      return await callFuturoleApi(ctx);
    } catch (err) {
      log.warn("ats", "FutuRole API failed, using fallback", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (ctx.resumeText) return fallbackDiagnostic(ctx.resumeText, opp.signals);
  return null;
}
