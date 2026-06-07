import { describe, it, expect } from "vitest";
import {
  extractResumeContext,
  fallbackDiagnostic,
} from "@/lib/ats/scorer";

describe("extractResumeContext", () => {
  it("detects a shared resume URL", () => {
    const ctx = extractResumeContext({
      title: "Resume review please",
      body: "Here is my resume: https://drive.google.com/file/abc please help",
    });
    expect(ctx.hasResume).toBe(true);
    expect(ctx.resumeUrl).toContain("drive.google.com");
  });

  it("returns hasResume=false for a short question with no link", () => {
    const ctx = extractResumeContext({
      title: "No callbacks, what do I do?",
      body: "I keep getting rejected and I am frustrated.",
    });
    expect(ctx.hasResume).toBe(false);
    expect(ctx.resumeText).toBeUndefined();
  });
});

describe("fallbackDiagnostic", () => {
  it("scores higher for a well-structured resume than a sparse one", () => {
    const good = fallbackDiagnostic(
      `John Doe john@example.com
       Experience: Senior Engineer, improved latency by 40% and saved $20000.
       Education: BSc Computer Science.
       Skills: TypeScript, communication, leadership, results.`,
    );
    const sparse = fallbackDiagnostic("just some text without sections");
    expect(good.score).toBeGreaterThan(sparse.score);
    expect(good.source).toBe("fallback");
  });

  it("flags a missing email and reports missing keywords", () => {
    const d = fallbackDiagnostic("Experience and education but no contact info");
    expect(d.findings.some((f) => /email/i.test(f))).toBe(true);
    expect(Array.isArray(d.missingKeywords)).toBe(true);
  });

  it("keeps score within 0-100", () => {
    const d = fallbackDiagnostic("");
    expect(d.score).toBeGreaterThanOrEqual(0);
    expect(d.score).toBeLessThanOrEqual(100);
  });
});
