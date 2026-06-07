import { describe, it, expect } from "vitest";
import {
  buildTrackedUrl,
  extractUtmCampaign,
  slugifySource,
} from "@/lib/attribution/utm";

describe("slugifySource", () => {
  it("lowercases and collapses non-alphanumerics", () => {
    expect(slugifySource("r/resumes")).toBe("r_resumes");
    expect(slugifySource("  r/CScareerQuestions ")).toBe("r_cscareerquestions");
    expect(slugifySource("Tech Job Seekers!!")).toBe("tech_job_seekers");
  });
});

describe("buildTrackedUrl", () => {
  it("injects utm params, slugifying the source but not the campaign", () => {
    const url = buildTrackedUrl("https://futurole.com/ats-scan", {
      source: "r/resumes",
      campaign: "clx123ABC",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("utm_source")).toBe("r_resumes");
    expect(parsed.searchParams.get("utm_medium")).toBe("community_comment");
    expect(parsed.searchParams.get("utm_campaign")).toBe("clx123ABC");
  });

  it("preserves pre-existing query params on the base URL", () => {
    const url = buildTrackedUrl("https://futurole.com/ats-scan?ref=growth", {
      source: "reddit",
      campaign: "opp1",
      medium: "dm",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("ref")).toBe("growth");
    expect(parsed.searchParams.get("utm_medium")).toBe("dm");
    expect(parsed.searchParams.get("utm_campaign")).toBe("opp1");
  });

  it("keeps the campaign value exact (it is the attribution join key)", () => {
    const campaign = "cuid_With-Mixed.Case";
    const url = buildTrackedUrl("https://futurole.com/x", {
      source: "x",
      campaign,
    });
    expect(new URL(url).searchParams.get("utm_campaign")).toBe(campaign);
  });
});

describe("extractUtmCampaign", () => {
  it("extracts the campaign from a full URL", () => {
    expect(
      extractUtmCampaign("https://futurole.com/ats-scan?utm_campaign=opp42"),
    ).toBe("opp42");
  });

  it("extracts from a bare query string", () => {
    expect(extractUtmCampaign("?utm_source=reddit&utm_campaign=opp7")).toBe(
      "opp7",
    );
  });

  it("round-trips with buildTrackedUrl", () => {
    const url = buildTrackedUrl("https://futurole.com/ats-scan", {
      source: "r/resumes",
      campaign: "roundtrip-id",
    });
    expect(extractUtmCampaign(url)).toBe("roundtrip-id");
  });

  it("returns null when absent", () => {
    expect(extractUtmCampaign("https://futurole.com/ats-scan")).toBeNull();
    expect(extractUtmCampaign("not a url and no campaign")).toBeNull();
  });
});
