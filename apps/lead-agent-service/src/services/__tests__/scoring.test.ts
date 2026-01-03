import { scoreLeadDual, scoreLead, computeDimensions } from "../scoring";
import { UniversalLeadInput, TenantScoringConfig } from "../../types/universal";

describe("Dual Scoring Engine", () => {
  const baseRawLead: UniversalLeadInput = {
    company_domain: "acme.com",
    company_name: "Acme Corp",
    contact_email: "john@acme.com",
    contact_title_raw: "Sales Manager",
    company_industry: "Technology",
  };

  const enrichedLead: UniversalLeadInput = {
    ...baseRawLead,
    company_employee_band: "201-1000",
    company_revenue_band: "50-250M",
    contact_role_seniority: "Manager",
    company_region: "US",
    lead_source: "Demo Request",
    urgency_band: "ThisQuarter",
  };

  describe("scoreLeadDual", () => {
    it("should compute different scores for raw vs enriched leads", () => {
      const result = scoreLeadDual({
        rawLead: baseRawLead,
        enrichedLead: enrichedLead,
      });

      // Raw score should be lower (fewer signals)
      expect(result.raw_score).toBeLessThan(result.enriched_score);
      
      // Lift should be positive (enrichment added signals)
      expect(result.lift).toBeGreaterThan(0);
      expect(result.lift).toBe(result.enriched_score - result.raw_score);
    });

    it("should return same score for raw and enriched when identical", () => {
      const result = scoreLeadDual({
        rawLead: baseRawLead,
        enrichedLead: baseRawLead, // Same as raw
      });

      expect(result.raw_score).toBe(result.enriched_score);
      expect(result.lift).toBe(0);
    });

    it("should maintain backward compatibility with score/tier fields", () => {
      const result = scoreLeadDual({
        rawLead: baseRawLead,
        enrichedLead: enrichedLead,
      });

      // score should equal enriched_score
      expect(result.score).toBe(result.enriched_score);
      // tier should equal enriched_tier
      expect(result.tier).toBe(result.enriched_tier);
    });

    it("should compute dimensions (fit, intent, timing)", () => {
      const result = scoreLeadDual({
        rawLead: baseRawLead,
        enrichedLead: enrichedLead,
      });

      expect(result.dimensions).toBeDefined();
      expect(result.dimensions.fit).toBeGreaterThanOrEqual(0);
      expect(result.dimensions.fit).toBeLessThanOrEqual(100);
      expect(result.dimensions.intent).toBeGreaterThanOrEqual(0);
      expect(result.dimensions.intent).toBeLessThanOrEqual(100);
      expect(result.dimensions.timing).toBeGreaterThanOrEqual(0);
      expect(result.dimensions.timing).toBeLessThanOrEqual(100);
    });

    it("should include reasons only in enriched output", () => {
      const result = scoreLeadDual({
        rawLead: baseRawLead,
        enrichedLead: enrichedLead,
      });

      // Reasons should be present and describe the enriched signals
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons.some(r => r.includes("Corporate email"))).toBe(true);
    });

    it("should respect tenant config thresholds", () => {
      const customConfig: Partial<TenantScoringConfig> = {
        hot_threshold: 90, // Higher threshold
        warm_threshold: 50,
        weight_overrides: {},
        priority_industries: [],
        excluded_regions: [],
        priority_use_cases: [],
      };

      const result = scoreLeadDual({
        rawLead: baseRawLead,
        enrichedLead: enrichedLead,
        tenantConfig: customConfig as TenantScoringConfig,
      });

      // With higher thresholds, tier should be lower
      if (result.enriched_score < 90) {
        expect(result.enriched_tier).not.toBe("Hot");
      }
    });

    it("should apply priority industry boost", () => {
      const configWithPriority: Partial<TenantScoringConfig> = {
        hot_threshold: 70,
        warm_threshold: 40,
        weight_overrides: {},
        priority_industries: ["technology"],
        excluded_regions: [],
        priority_use_cases: [],
      };

      const result = scoreLeadDual({
        rawLead: baseRawLead,
        enrichedLead: enrichedLead,
        tenantConfig: configWithPriority as TenantScoringConfig,
      });

      // Should have industry boost in reasons
      expect(result.reasons.some(r => r.includes("Priority industry"))).toBe(true);
    });

    it("should apply excluded region penalty", () => {
      const leadWithExcludedRegion: UniversalLeadInput = {
        ...enrichedLead,
        company_region: "Russia",
      };

      const configWithExclusion: Partial<TenantScoringConfig> = {
        hot_threshold: 70,
        warm_threshold: 40,
        weight_overrides: {},
        priority_industries: [],
        excluded_regions: ["russia"],
        priority_use_cases: [],
      };

      const result = scoreLeadDual({
        rawLead: baseRawLead,
        enrichedLead: leadWithExcludedRegion,
        tenantConfig: configWithExclusion as TenantScoringConfig,
      });

      // Should have region penalty in breakdown
      expect(result.score_breakdown.region_penalty).toBe(-20);
      expect(result.reasons.some(r => r.includes("Excluded region"))).toBe(true);
    });
  });

  describe("scoreLead (legacy)", () => {
    it("should work with single input for backward compatibility", () => {
      const result = scoreLead(enrichedLead);

      expect(result.score).toBeGreaterThan(0);
      expect(result.tier).toBeDefined();
      expect(result.scoring_version).toBe("v1");
      expect(result.score_breakdown).toBeDefined();
      expect(result.reasons).toBeDefined();
      
      // Dual fields should still be present
      expect(result.raw_score).toBeDefined();
      expect(result.enriched_score).toBeDefined();
      expect(result.lift).toBe(0); // Same input = no lift
    });
  });

  describe("computeDimensions", () => {
    it("should categorize fit signals correctly", () => {
      const breakdown = {
        email_domain: 15,
        company_size: 20,
        seniority: 20,
        industry: 15,
      };

      const dimensions = computeDimensions(breakdown);

      // Fit should include all these signals
      expect(dimensions.fit).toBeGreaterThan(0);
    });

    it("should categorize intent signals correctly", () => {
      const breakdown = {
        lead_source: 15,
        use_case: 10,
        deal_band: 10,
      };

      const dimensions = computeDimensions(breakdown);

      expect(dimensions.intent).toBeGreaterThan(0);
    });

    it("should categorize timing signals correctly", () => {
      const breakdown = {
        urgency: 20,
      };

      const dimensions = computeDimensions(breakdown);

      expect(dimensions.timing).toBeGreaterThan(0);
    });

    it("should normalize dimensions to 0-100 scale", () => {
      const maxBreakdown = {
        email_domain: 15,
        company_size: 25,
        revenue: 25,
        seniority: 30,
        industry: 20,
        lead_source: 15,
        use_case: 15,
        deal_band: 15,
        urgency: 20,
      };

      const dimensions = computeDimensions(maxBreakdown);

      expect(dimensions.fit).toBeLessThanOrEqual(100);
      expect(dimensions.intent).toBeLessThanOrEqual(100);
      expect(dimensions.timing).toBeLessThanOrEqual(100);
    });
  });

  describe("Edge Cases", () => {
    it("should handle minimal input gracefully", () => {
      const minimalLead: UniversalLeadInput = {
        company_domain: "example.com",
      };

      const result = scoreLeadDual({
        rawLead: minimalLead,
        enrichedLead: minimalLead,
      });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.tier).toBeDefined();
    });

    it("should handle free email domains", () => {
      const freeEmailLead: UniversalLeadInput = {
        company_domain: "gmail.com",
        contact_email: "john@gmail.com",
      };

      const result = scoreLeadDual({
        rawLead: freeEmailLead,
        enrichedLead: freeEmailLead,
      });

      // Free email should not contribute to score
      expect(result.score_breakdown.email_domain).toBeUndefined();
    });

    it("should clamp scores to 0-100", () => {
      // Even with many signals, score should not exceed 100
      const maxLead: UniversalLeadInput = {
        company_domain: "enterprise.com",
        contact_email: "ceo@enterprise.com",
        company_employee_band: "1000+",
        company_revenue_band: "250M+",
        contact_role_seniority: "C-Level",
        company_industry: "SaaS",
        lead_source: "Demo Request",
        primary_use_case: "Enterprise automation",
        urgency_band: "ThisMonth",
        estimated_deal_band: "Enterprise",
      };

      const result = scoreLeadDual({
        rawLead: maxLead,
        enrichedLead: maxLead,
      });

      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.enriched_score).toBeLessThanOrEqual(100);
    });
  });
});

