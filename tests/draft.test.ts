import { describe, it, expect } from "vitest";
import {
  injectTrackedLink,
  parseDraftResponse,
  SCANNER_PLACEHOLDER,
} from "@/lib/llm/draft";

const URL = "https://futurole.com/ats-scan?utm_source=r_resumes&utm_campaign=opp1";

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("injectTrackedLink", () => {
  it("replaces the placeholder with the tracked URL exactly once", () => {
    const out = injectTrackedLink(`Helpful tip. ${SCANNER_PLACEHOLDER}`, URL);
    expect(out).toContain(URL);
    expect(count(out, URL)).toBe(1);
    expect(out).not.toContain(SCANNER_PLACEHOLDER);
  });

  it("appends the link when the placeholder is missing", () => {
    const out = injectTrackedLink("Just some helpful advice with no link.", URL);
    expect(count(out, URL)).toBe(1);
    expect(out.endsWith(URL)).toBe(true);
  });

  it("collapses multiple placeholders to a single link", () => {
    const out = injectTrackedLink(
      `${SCANNER_PLACEHOLDER} middle ${SCANNER_PLACEHOLDER}`,
      URL,
    );
    expect(count(out, URL)).toBe(1);
  });

  it("strips stray URLs the model may have invented", () => {
    const out = injectTrackedLink(
      `Check https://spam.example.com now. ${SCANNER_PLACEHOLDER}`,
      URL,
    );
    expect(out).not.toContain("spam.example.com");
    expect(count(out, URL)).toBe(1);
  });
});

describe("parseDraftResponse", () => {
  it("parses fenced JSON with two variants", () => {
    const raw = `\`\`\`json
{"variantA": "Here is a genuinely helpful, specific reply ${SCANNER_PLACEHOLDER}", "variantB": "A different angle that is also helpful ${SCANNER_PLACEHOLDER}"}
\`\`\``;
    const r = parseDraftResponse(raw);
    expect(r.variantA).toContain(SCANNER_PLACEHOLDER);
    expect(r.variantB.length).toBeGreaterThan(20);
  });

  it("throws when a variant is missing", () => {
    expect(() => parseDraftResponse('{"variantA": "only one here, long enough"}')).toThrow();
  });
});
