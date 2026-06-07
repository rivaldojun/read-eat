import { describe, it, expect } from "vitest";
import { parseTriageResponse, TriageResultSchema } from "@/lib/llm/triage";

describe("parseTriageResponse", () => {
  it("parses a clean JSON object", () => {
    const r = parseTriageResponse(
      JSON.stringify({
        intentScore: 88,
        persona: "junior",
        hasResumeLink: true,
        pain: "No callbacks after 200 applications.",
        recommendedAction: "comment",
      }),
    );
    expect(r.intentScore).toBe(88);
    expect(r.persona).toBe("junior");
    expect(r.hasResumeLink).toBe(true);
    expect(r.recommendedAction).toBe("comment");
  });

  it("handles markdown code fences and surrounding prose", () => {
    const raw =
      'Here is the result:\n```json\n{"intentScore": 72, "persona": "Senior", "hasResumeLink": false, "pain": "Dense resume", "recommendedAction": "comment"}\n```\nThanks!';
    const r = parseTriageResponse(raw);
    expect(r.intentScore).toBe(72);
    expect(r.persona).toBe("senior");
  });

  it("normalises messy persona / action / boolean strings", () => {
    const r = parseTriageResponse(
      JSON.stringify({
        intentScore: "65",
        persona: "career switcher",
        hasResumeLink: "false",
        pain: "Switching fields, unsure about keywords.",
        recommendedAction: "please reply",
      }),
    );
    expect(r.persona).toBe("career-change");
    expect(r.hasResumeLink).toBe(false);
    expect(r.recommendedAction).toBe("comment");
    expect(r.intentScore).toBe(65);
  });

  it("clamps out-of-range scores into 0-100", () => {
    expect(
      parseTriageResponse(
        JSON.stringify({
          intentScore: 140,
          persona: "x",
          hasResumeLink: false,
          pain: "p",
          recommendedAction: "skip",
        }),
      ).intentScore,
    ).toBe(100);

    expect(
      parseTriageResponse(
        JSON.stringify({
          intentScore: -10,
          persona: "x",
          hasResumeLink: false,
          pain: "p",
          recommendedAction: "skip",
        }),
      ).intentScore,
    ).toBe(0);
  });

  it("maps unknown persona to 'unknown'", () => {
    const r = parseTriageResponse(
      JSON.stringify({
        intentScore: 10,
        persona: "hiring manager",
        hasResumeLink: false,
        pain: "n/a",
        recommendedAction: "skip",
      }),
    );
    expect(r.persona).toBe("unknown");
  });

  it("throws on non-JSON garbage", () => {
    expect(() => parseTriageResponse("totally not json")).toThrow();
  });

  it("throws when required fields are missing", () => {
    expect(() =>
      TriageResultSchema.parse({ intentScore: 50 }),
    ).toThrow();
  });
});
