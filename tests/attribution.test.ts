import { describe, it, expect } from "vitest";
import {
  monthlyCents,
  aggregateByCampaign,
  type NormalizedSub,
} from "@/lib/attribution/stripe";

describe("monthlyCents", () => {
  it("passes monthly amounts through", () => {
    expect(monthlyCents(1900, "month")).toBe(1900);
  });

  it("divides yearly amounts by 12", () => {
    expect(monthlyCents(12000, "year")).toBe(1000);
  });

  it("accounts for interval_count (e.g. every 3 months)", () => {
    expect(monthlyCents(3000, "month", 3)).toBe(1000);
  });

  it("approximates weekly and daily", () => {
    expect(monthlyCents(100, "week")).toBe(Math.round((100 * 52) / 12));
    expect(monthlyCents(100, "day")).toBe(Math.round((100 * 365) / 12));
  });
});

describe("aggregateByCampaign", () => {
  const subs: NormalizedSub[] = [
    { campaign: "opp1", status: "active", monthlyAmountCents: 1900 },
    { campaign: "opp1", status: "trialing", monthlyAmountCents: 1900 },
    { campaign: "opp1", status: "active", monthlyAmountCents: 2900 },
    { campaign: "opp2", status: "past_due", monthlyAmountCents: 1000 },
    { campaign: "opp2", status: "canceled", monthlyAmountCents: 9999 },
    { campaign: null, status: "active", monthlyAmountCents: 5000 },
  ];

  const agg = aggregateByCampaign(subs);

  it("counts paid users and sums MRR for active/past_due", () => {
    expect(agg.get("opp1")?.paidUsers).toBe(2);
    expect(agg.get("opp1")?.mrrCents).toBe(1900 + 2900);
    expect(agg.get("opp2")?.paidUsers).toBe(1);
    expect(agg.get("opp2")?.mrrCents).toBe(1000);
  });

  it("counts trials separately and excludes them from MRR", () => {
    expect(agg.get("opp1")?.trials).toBe(1);
  });

  it("ignores canceled/inactive subscriptions", () => {
    // opp2 has a canceled sub worth 9999 that must not be counted.
    expect(agg.get("opp2")?.mrrCents).toBe(1000);
  });

  it("ignores subscriptions without a campaign", () => {
    expect(agg.has("")).toBe(false);
    expect([...agg.keys()].sort()).toEqual(["opp1", "opp2"]);
  });
});
