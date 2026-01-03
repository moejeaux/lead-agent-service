import {
  UniversalLeadInput,
  ScoringResult,
  TenantScoringConfig,
  LeadTier,
  RoleSeniority,
  EmployeeBand,
  RevenueBand,
  DimensionBreakdown,
} from "../types/universal";
import { getDefaultScoringConfig } from "../db/tenants";

const SCORING_VERSION = "v1";

// ============================================================================
// BASE SCORING WEIGHTS (can be overridden per-tenant)
// ============================================================================

const BASE_WEIGHTS: Record<string, number> = {
  email_domain: 1.0,
  company_size: 1.0,
  revenue: 1.0,
  seniority: 1.0,
  industry: 1.0,
  lead_source: 1.0,
  use_case: 1.0,
  urgency: 1.0,
  deal_band: 1.0,
};

// ============================================================================
// DIMENSION MAPPING
// Maps score_breakdown keys to dimension categories
// ============================================================================

const DIMENSION_MAPPING: Record<string, keyof DimensionBreakdown> = {
  // Fit dimension: ICP/firmographic signals
  email_domain: "fit",
  company_size: "fit",
  revenue: "fit",
  seniority: "fit",
  industry: "fit",
  region_penalty: "fit",
  
  // Intent dimension: interest/behavior signals
  lead_source: "intent",
  use_case: "intent",
  deal_band: "intent",
  
  // Timing dimension: urgency/recency signals
  urgency: "timing",
};

// ============================================================================
// SCORING RULES
// ============================================================================

const FREE_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
  "icloud.com", "aol.com", "proton.me", "protonmail.com",
  "live.com", "msn.com", "ymail.com"
];

const HIGH_VALUE_INDUSTRIES = [
  "technology", "software", "finance", "healthcare", "saas",
  "fintech", "biotech", "ai", "machine learning"
];

const MEDIUM_VALUE_INDUSTRIES = [
  "manufacturing", "retail", "consulting", "professional services",
  "media", "education", "real estate"
];

const HIGH_QUALITY_SOURCES = [
  "referral", "partner", "event", "conference", "demo request", "inbound"
];

const MEDIUM_QUALITY_SOURCES = [
  "website", "webinar", "content download", "organic", "seo"
];

// ============================================================================
// DUAL SCORING INPUT
// ============================================================================

export interface DualScoringInput {
  /** Original CRM data before enrichment */
  rawLead: UniversalLeadInput;
  /** Lead data after enrichment (with additional signals) */
  enrichedLead: UniversalLeadInput;
  /** Tenant-specific scoring configuration */
  tenantConfig?: TenantScoringConfig | null;
}

// ============================================================================
// MAIN DUAL SCORING FUNCTION
// ============================================================================

/**
 * Score a lead with dual scoring: raw (pre-enrichment) and enriched (post-enrichment)
 * Returns both scores, the lift, and dimension breakdowns
 */
export function scoreLeadDual(input: DualScoringInput): ScoringResult {
  const { rawLead, enrichedLead, tenantConfig } = input;
  const config = tenantConfig ?? getDefaultScoringConfig();
  const weights = { ...BASE_WEIGHTS, ...config.weight_overrides };
  
  // Phase 1: Compute raw score (pre-enrichment data only)
  const rawResult = computeScore(rawLead, config, weights, "raw");
  
  // Phase 2: Compute enriched score (all available signals)
  const enrichedResult = computeScore(enrichedLead, config, weights, "enriched");
  
  // Calculate lift
  const lift = enrichedResult.score - rawResult.score;
  
  // Compute dimensions from enriched breakdown
  const dimensions = computeDimensions(enrichedResult.breakdown);
  
  return {
    // Backward-compatible fields (= enriched values)
    score: enrichedResult.score,
    tier: enrichedResult.tier,
    
    // Dual scoring fields
    raw_score: rawResult.score,
    raw_tier: rawResult.tier,
    enriched_score: enrichedResult.score,
    enriched_tier: enrichedResult.tier,
    lift,
    
    // Breakdown & dimensions
    scoring_version: SCORING_VERSION,
    score_breakdown: enrichedResult.breakdown,
    raw_breakdown: rawResult.breakdown,
    dimensions,
    
    // Combine reasons from both (enriched takes precedence)
    reasons: enrichedResult.reasons,
  };
}

/**
 * Legacy single-input scoring function
 * Computes only enriched score (for backward compatibility)
 * @deprecated Use scoreLeadDual for new implementations
 */
export function scoreLead(
  input: UniversalLeadInput,
  tenantConfig?: TenantScoringConfig | null
): ScoringResult {
  // When called with single input, treat it as both raw and enriched
  return scoreLeadDual({
    rawLead: input,
    enrichedLead: input,
    tenantConfig,
  });
}

// ============================================================================
// INTERNAL SCORING COMPUTATION
// ============================================================================

interface ScoreComputeResult {
  score: number;
  tier: LeadTier;
  breakdown: Record<string, number>;
  reasons: string[];
}

function computeScore(
  input: UniversalLeadInput,
  config: ReturnType<typeof getDefaultScoringConfig>,
  weights: Record<string, number>,
  phase: "raw" | "enriched"
): ScoreComputeResult {
  const breakdown: Record<string, number> = {};
  const reasons: string[] = [];
  let totalScore = 0;

  // --- Email Domain ---
  const emailScore = scoreEmailDomain(input, reasons, phase);
  const weightedEmailScore = Math.round(emailScore * weights.email_domain);
  if (emailScore > 0) {
    breakdown.email_domain = weightedEmailScore;
    totalScore += weightedEmailScore;
  }

  // --- Company Size (Employee Band) ---
  const sizeScore = scoreCompanySize(input, reasons, phase);
  const weightedSizeScore = Math.round(sizeScore * weights.company_size);
  if (sizeScore > 0) {
    breakdown.company_size = weightedSizeScore;
    totalScore += weightedSizeScore;
  }

  // --- Revenue Band ---
  const revenueScore = scoreRevenue(input, reasons, phase);
  const weightedRevenueScore = Math.round(revenueScore * weights.revenue);
  if (revenueScore > 0) {
    breakdown.revenue = weightedRevenueScore;
    totalScore += weightedRevenueScore;
  }

  // --- Seniority ---
  const seniorityScore = scoreSeniority(input, reasons, phase);
  const weightedSeniorityScore = Math.round(seniorityScore * weights.seniority);
  if (seniorityScore > 0) {
    breakdown.seniority = weightedSeniorityScore;
    totalScore += weightedSeniorityScore;
  }

  // --- Industry (with tenant priority boost) ---
  const industryScore = scoreIndustry(input, config.priority_industries, reasons, phase);
  const weightedIndustryScore = Math.round(industryScore * weights.industry);
  if (industryScore !== 0) {
    breakdown.industry = weightedIndustryScore;
    totalScore += weightedIndustryScore;
  }

  // --- Lead Source ---
  const sourceScore = scoreLeadSource(input, reasons, phase);
  const weightedSourceScore = Math.round(sourceScore * weights.lead_source);
  if (sourceScore > 0) {
    breakdown.lead_source = weightedSourceScore;
    totalScore += weightedSourceScore;
  }

  // --- Use Case (with tenant priority boost) ---
  const useCaseScore = scoreUseCase(input, config.priority_use_cases, reasons, phase);
  const weightedUseCaseScore = Math.round(useCaseScore * weights.use_case);
  if (useCaseScore > 0) {
    breakdown.use_case = weightedUseCaseScore;
    totalScore += weightedUseCaseScore;
  }

  // --- Urgency ---
  const urgencyScore = scoreUrgency(input, reasons, phase);
  const weightedUrgencyScore = Math.round(urgencyScore * weights.urgency);
  if (urgencyScore > 0) {
    breakdown.urgency = weightedUrgencyScore;
    totalScore += weightedUrgencyScore;
  }

  // --- Deal Band ---
  const dealScore = scoreDealBand(input, reasons, phase);
  const weightedDealScore = Math.round(dealScore * weights.deal_band);
  if (dealScore > 0) {
    breakdown.deal_band = weightedDealScore;
    totalScore += weightedDealScore;
  }

  // --- Region Exclusion Penalty ---
  const regionPenalty = scoreRegion(input, config.excluded_regions, reasons, phase);
  if (regionPenalty < 0) {
    breakdown.region_penalty = regionPenalty;
    totalScore += regionPenalty;
  }

  // Clamp score to 0-100
  const finalScore = Math.max(0, Math.min(100, totalScore));

  // Determine tier using tenant thresholds
  const tier = determineTier(finalScore, config.hot_threshold, config.warm_threshold);

  return {
    score: finalScore,
    tier,
    breakdown,
    reasons,
  };
}

// ============================================================================
// DIMENSION COMPUTATION
// ============================================================================

/**
 * Compute dimension scores (fit, intent, timing) from breakdown
 * Each dimension is a 0-100 score based on the sum of relevant signals
 */
export function computeDimensions(breakdown: Record<string, number>): DimensionBreakdown {
  const dimensionSums: Record<keyof DimensionBreakdown, number> = {
    fit: 0,
    intent: 0,
    timing: 0,
  };
  
  // Max possible scores per dimension (for normalization)
  const dimensionMaxes: Record<keyof DimensionBreakdown, number> = {
    fit: 95,    // email(15) + size(25) + revenue(25) + seniority(30) + industry(20) - region penalty excluded
    intent: 35, // lead_source(15) + use_case(15) + deal_band(15) - some overlap possible
    timing: 20, // urgency(20)
  };
  
  for (const [key, value] of Object.entries(breakdown)) {
    const dimension = DIMENSION_MAPPING[key];
    if (dimension && value > 0) {
      dimensionSums[dimension] += value;
    }
  }
  
  // Normalize to 0-100 scale
  return {
    fit: Math.min(100, Math.round((dimensionSums.fit / dimensionMaxes.fit) * 100)),
    intent: Math.min(100, Math.round((dimensionSums.intent / dimensionMaxes.intent) * 100)),
    timing: Math.min(100, Math.round((dimensionSums.timing / dimensionMaxes.timing) * 100)),
  };
}

// ============================================================================
// INDIVIDUAL SCORING FUNCTIONS
// ============================================================================

function scoreEmailDomain(
  input: UniversalLeadInput,
  reasons: string[],
  phase: "raw" | "enriched"
): number {
  if (!input.contact_email) return 0;
  
  const domain = input.contact_email.split("@")[1]?.toLowerCase() || "";
  if (!domain) return 0;
  
  if (FREE_EMAIL_DOMAINS.includes(domain)) {
    if (phase === "enriched") {
      reasons.push(`Free email: ${domain} (+0)`);
    }
    return 0;
  }
  
  // Corporate domain
  if (phase === "enriched") {
    reasons.push(`Corporate email: ${domain} (+15)`);
  }
  return 15;
}

function scoreCompanySize(
  input: UniversalLeadInput,
  reasons: string[],
  phase: "raw" | "enriched"
): number {
  if (!input.company_employee_band) return 0;
  
  const bandScores: Record<EmployeeBand, number> = {
    "1-10": 5,
    "11-50": 10,
    "51-200": 15,
    "201-1000": 20,
    "1000+": 25,
  };
  
  const score = bandScores[input.company_employee_band] ?? 0;
  if (score > 0 && phase === "enriched") {
    reasons.push(`Company size: ${input.company_employee_band} employees (+${score})`);
  }
  return score;
}

function scoreRevenue(
  input: UniversalLeadInput,
  reasons: string[],
  phase: "raw" | "enriched"
): number {
  if (!input.company_revenue_band) return 0;
  
  const bandScores: Record<RevenueBand, number> = {
    "<1M": 5,
    "1-10M": 10,
    "10-50M": 15,
    "50-250M": 20,
    "250M+": 25,
  };
  
  const score = bandScores[input.company_revenue_band] ?? 0;
  if (score > 0 && phase === "enriched") {
    reasons.push(`Revenue: ${input.company_revenue_band} (+${score})`);
  }
  return score;
}

function scoreSeniority(
  input: UniversalLeadInput,
  reasons: string[],
  phase: "raw" | "enriched"
): number {
  // Prefer explicit seniority enum, fall back to title parsing
  if (input.contact_role_seniority) {
    const seniorityScores: Record<RoleSeniority, number> = {
      "IC": 5,
      "Manager": 10,
      "Director": 15,
      "VP": 20,
      "C-Level": 30,
    };
    const score = seniorityScores[input.contact_role_seniority] ?? 0;
    if (score > 0 && phase === "enriched") {
      reasons.push(`Seniority: ${input.contact_role_seniority} (+${score})`);
    }
    return score;
  }
  
  // Fall back to title parsing
  if (!input.contact_title_raw) return 0;
  
  const titleLower = input.contact_title_raw.toLowerCase();
  const cSuiteKeywords = ["ceo", "cto", "cfo", "coo", "cmo", "chief", "founder", "owner", "president"];
  const vpKeywords = ["vp", "vice president", "head of"];
  const directorKeywords = ["director"];
  const managerKeywords = ["manager", "lead", "senior"];

  if (cSuiteKeywords.some(k => titleLower.includes(k))) {
    if (phase === "enriched") {
      reasons.push(`Title: ${input.contact_title_raw} → C-Level (+30)`);
    }
    return 30;
  }
  if (vpKeywords.some(k => titleLower.includes(k))) {
    if (phase === "enriched") {
      reasons.push(`Title: ${input.contact_title_raw} → VP (+20)`);
    }
    return 20;
  }
  if (directorKeywords.some(k => titleLower.includes(k))) {
    if (phase === "enriched") {
      reasons.push(`Title: ${input.contact_title_raw} → Director (+15)`);
    }
    return 15;
  }
  if (managerKeywords.some(k => titleLower.includes(k))) {
    if (phase === "enriched") {
      reasons.push(`Title: ${input.contact_title_raw} → Manager (+10)`);
    }
    return 10;
  }
  
  return 0;
}

function scoreIndustry(
  input: UniversalLeadInput,
  priorityIndustries: string[],
  reasons: string[],
  phase: "raw" | "enriched"
): number {
  if (!input.company_industry) return 0;
  
  const industryLower = input.company_industry.toLowerCase();
  
  // Check tenant priority industries first (highest boost)
  if (priorityIndustries.length > 0) {
    const isPriority = priorityIndustries.some(pi => 
      industryLower.includes(pi.toLowerCase())
    );
    if (isPriority) {
      if (phase === "enriched") {
        reasons.push(`Priority industry: ${input.company_industry} (+20)`);
      }
      return 20;
    }
  }
  
  // Standard industry scoring
  if (HIGH_VALUE_INDUSTRIES.some(i => industryLower.includes(i))) {
    if (phase === "enriched") {
      reasons.push(`High-value industry: ${input.company_industry} (+15)`);
    }
    return 15;
  }
  
  if (MEDIUM_VALUE_INDUSTRIES.some(i => industryLower.includes(i))) {
    if (phase === "enriched") {
      reasons.push(`Industry: ${input.company_industry} (+8)`);
    }
    return 8;
  }
  
  return 0;
}

function scoreLeadSource(
  input: UniversalLeadInput,
  reasons: string[],
  phase: "raw" | "enriched"
): number {
  if (!input.lead_source) return 0;
  
  const sourceLower = input.lead_source.toLowerCase();
  
  if (HIGH_QUALITY_SOURCES.some(s => sourceLower.includes(s))) {
    if (phase === "enriched") {
      reasons.push(`Lead source: ${input.lead_source} (+15)`);
    }
    return 15;
  }
  
  if (MEDIUM_QUALITY_SOURCES.some(s => sourceLower.includes(s))) {
    if (phase === "enriched") {
      reasons.push(`Lead source: ${input.lead_source} (+8)`);
    }
    return 8;
  }
  
  return 0;
}

function scoreUseCase(
  input: UniversalLeadInput,
  priorityUseCases: string[],
  reasons: string[],
  phase: "raw" | "enriched"
): number {
  if (!input.primary_use_case) return 0;
  
  const useCaseLower = input.primary_use_case.toLowerCase();
  
  // Check tenant priority use cases
  if (priorityUseCases.length > 0) {
    const isPriority = priorityUseCases.some(pu => 
      useCaseLower.includes(pu.toLowerCase())
    );
    if (isPriority) {
      if (phase === "enriched") {
        reasons.push(`Priority use case: ${input.primary_use_case} (+15)`);
      }
      return 15;
    }
  }
  
  // Having any use case shows intent
  if (phase === "enriched") {
    reasons.push(`Use case provided: ${input.primary_use_case} (+5)`);
  }
  return 5;
}

function scoreUrgency(
  input: UniversalLeadInput,
  reasons: string[],
  phase: "raw" | "enriched"
): number {
  if (!input.urgency_band) return 0;
  
  const urgencyScores: Record<string, number> = {
    "Exploring": 5,
    "ThisQuarter": 10,
    "ThisMonth": 20,
  };
  
  const score = urgencyScores[input.urgency_band] ?? 0;
  if (score > 0 && phase === "enriched") {
    reasons.push(`Urgency: ${input.urgency_band} (+${score})`);
  }
  return score;
}

function scoreDealBand(
  input: UniversalLeadInput,
  reasons: string[],
  phase: "raw" | "enriched"
): number {
  if (!input.estimated_deal_band) return 0;
  
  const dealScores: Record<string, number> = {
    "Small": 5,
    "Mid": 10,
    "Enterprise": 15,
  };
  
  const score = dealScores[input.estimated_deal_band] ?? 0;
  if (score > 0 && phase === "enriched") {
    reasons.push(`Deal size: ${input.estimated_deal_band} (+${score})`);
  }
  return score;
}

function scoreRegion(
  input: UniversalLeadInput,
  excludedRegions: string[],
  reasons: string[],
  phase: "raw" | "enriched"
): number {
  if (excludedRegions.length === 0) return 0;
  
  const region = input.company_region || input.contact_geo;
  if (!region) return 0;
  
  const regionLower = region.toLowerCase();
  const isExcluded = excludedRegions.some(er => 
    regionLower.includes(er.toLowerCase())
  );
  
  if (isExcluded) {
    if (phase === "enriched") {
      reasons.push(`Excluded region: ${region} (-20)`);
    }
    return -20;
  }
  
  return 0;
}

function determineTier(
  score: number,
  hotThreshold: number,
  warmThreshold: number
): LeadTier {
  if (score >= hotThreshold) return "Hot";
  if (score >= warmThreshold) return "Warm";
  return "Cold";
}

// Functions are exported inline above:
// - scoreLeadDual
// - scoreLead
// - computeDimensions (via computeDimensions function)
