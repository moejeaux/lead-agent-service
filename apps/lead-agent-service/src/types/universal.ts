/**
 * Universal Lead Enrichment + Scoring Types
 * Matches the Supabase/Postgres schema
 */

// ============================================================================
// ENUMS (match Postgres enums)
// ============================================================================

export type EmployeeBand = '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';
export type RevenueBand = '<1M' | '1-10M' | '10-50M' | '50-250M' | '250M+';
export type RoleFunction = 'Sales' | 'Marketing' | 'RevOps' | 'Ops' | 'Finance' | 'IT' | 'FounderExec' | 'Legal' | 'Other';
export type RoleSeniority = 'IC' | 'Manager' | 'Director' | 'VP' | 'C-Level';
export type DealBand = 'Small' | 'Mid' | 'Enterprise';
export type UrgencyBand = 'Exploring' | 'ThisQuarter' | 'ThisMonth';
export type LeadTier = 'Hot' | 'Warm' | 'Cold';
export type SourceCRM = 'salesforce' | 'hubspot' | 'pipedrive' | 'api' | string;

// ============================================================================
// DATABASE RECORD TYPES
// ============================================================================

export interface Tenant {
  id: string;
  name: string;
  api_key: string;
  source_crm: SourceCRM | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantScoringConfig {
  id: string;
  tenant_id: string;
  scoring_version: string;
  weight_overrides: Record<string, number>;
  priority_industries: string[];
  excluded_regions: string[];
  priority_use_cases: string[];
  hot_threshold: number;
  warm_threshold: number;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  tenant_id: string;
  
  // External identifiers
  external_id: string | null;
  external_source: SourceCRM | null;
  
  // Company-level (universal)
  company_domain: string;
  company_name: string | null;
  company_industry: string | null;
  company_employee_band: EmployeeBand | null;
  company_revenue_band: RevenueBand | null;
  company_region: string | null;
  company_tech_stack_summary: Record<string, unknown> | null;
  
  // Person-level (universal)
  contact_email: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_role_function: RoleFunction | null;
  contact_role_seniority: RoleSeniority | null;
  contact_title_raw: string | null;
  contact_geo: string | null;
  contact_phone: string | null;
  
  // Need / fit
  primary_use_case: string | null;
  estimated_deal_band: DealBand | null;
  urgency_band: UrgencyBand | null;
  lead_source: string | null;
  
  // Scoring
  lead_score: number | null;
  lead_tier: LeadTier | null;
  scoring_version: string | null;
  scored_at: string | null;
  
  // Raw / enrichment
  raw_input: Record<string, unknown> | null;
  enrichment_meta: EnrichmentMeta | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface EnrichmentMeta {
  provider: string;
  enriched_at: string;
  confidence?: number;
  [key: string]: unknown;
}

export interface ScoringRun {
  id: string;
  lead_id: string | null;
  tenant_id: string;
  input_snapshot: UniversalLeadInput;
  config_snapshot: TenantScoringConfig | null;
  
  // Dual scoring fields
  score: number;                          // enriched_score (backward compat)
  tier: LeadTier;                         // enriched_tier (backward compat)
  raw_score: number | null;
  raw_tier: LeadTier | null;
  enriched_score: number;
  enriched_tier: LeadTier;
  lift: number;
  
  scoring_version: string;
  score_breakdown: Record<string, number> | null;
  dimensions: DimensionBreakdown | null;
  reasons: string[];
  enrichment_sources: string[] | null;
  enrichment_duration_ms: number | null;
  created_at: string;
}

// ============================================================================
// INPUT / OUTPUT TYPES (API Contract)
// ============================================================================

/**
 * Universal lead input - normalized from any CRM
 * This is the shape the scoring engine works with
 */
export interface UniversalLeadInput {
  // Company-level
  company_domain: string;
  company_name?: string;
  company_industry?: string;
  company_employee_band?: EmployeeBand;
  company_revenue_band?: RevenueBand;
  company_region?: string;
  company_tech_stack_summary?: Record<string, unknown>;
  
  // Person-level
  contact_email?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  contact_role_function?: RoleFunction;
  contact_role_seniority?: RoleSeniority;
  contact_title_raw?: string;
  contact_geo?: string;
  contact_phone?: string;
  
  // Need / fit
  primary_use_case?: string;
  estimated_deal_band?: DealBand;
  urgency_band?: UrgencyBand;
  lead_source?: string;
}

// ============================================================================
// SCORING TYPES
// ============================================================================

/**
 * Dimension breakdown for categorized scoring
 * Groups signals into high-level dimensions for easier interpretation
 */
export interface DimensionBreakdown {
  /** ICP/firmographic fit score (0-100): company size, industry, seniority, region */
  fit?: number;
  /** Intent/interest score (0-100): use case, lead source, engagement signals */
  intent?: number;
  /** Timing/urgency score (0-100): urgency band, recency signals */
  timing?: number;
}

/**
 * Scoring result from the scoring engine
 * Includes both raw (pre-enrichment) and enriched (post-enrichment) scores
 */
export interface ScoringResult {
  // -------------------------------------------------------------------------
  // Backward-compatible fields (score/tier = enriched values)
  // -------------------------------------------------------------------------
  
  /** Lead score 0-100 (equals enriched_score for backward compat) */
  score: number;
  /** Lead tier (equals enriched_tier for backward compat) */
  tier: LeadTier;
  
  // -------------------------------------------------------------------------
  // Dual scoring: Raw vs Enriched
  // -------------------------------------------------------------------------
  
  /**
   * Raw score (0-100): computed from original CRM fields only, before enrichment
   * TODO: Maps to Salesforce field Raw_Lead_Score__c
   */
  raw_score: number;
  /** Raw tier: tier based on raw_score */
  raw_tier: LeadTier;
  
  /**
   * Enriched score (0-100): computed after enrichment with all available signals
   * TODO: Maps to Salesforce field Enriched_Lead_Score__c
   */
  enriched_score: number;
  /** Enriched tier: tier based on enriched_score */
  enriched_tier: LeadTier;
  
  /**
   * Score lift from enrichment: enriched_score - raw_score
   * Positive = enrichment improved the score
   * Negative = enrichment revealed disqualifying signals
   */
  lift: number;
  
  // -------------------------------------------------------------------------
  // Breakdown & Dimensions
  // -------------------------------------------------------------------------
  
  /** Scoring model version */
  scoring_version: string;
  
  /** Detailed score breakdown by signal (e.g., { email_domain: 15, seniority: 20 }) */
  score_breakdown: Record<string, number>;
  
  /** Raw score breakdown (signals from original CRM data only) */
  raw_breakdown: Record<string, number>;
  
  /** Dimension-level scores (fit, intent, timing) */
  dimensions: DimensionBreakdown;
  
  /** Human-readable scoring explanations */
  reasons: string[];
}

/**
 * Full enrichment + scoring response
 */
export interface EnrichLeadResponseV2 {
  lead_id: string;
  scoring_run_id: string;
  
  // Enriched universal data
  enriched: UniversalLeadInput;
  
  // -------------------------------------------------------------------------
  // Full scoring result object
  // -------------------------------------------------------------------------
  scoring: ScoringResult;
  
  // -------------------------------------------------------------------------
  // Backward-compatible top-level fields (mirror scoring object)
  // -------------------------------------------------------------------------
  
  /** @deprecated Use scoring.enriched_score */
  lead_score: number;
  /** @deprecated Use scoring.enriched_tier */
  lead_tier: LeadTier;
  /** @deprecated Use scoring.scoring_version */
  scoring_version: string;
  /** @deprecated Use scoring.score_breakdown */
  score_breakdown: Record<string, number>;
  /** @deprecated Use scoring.reasons */
  reasons: string[];
  
  // -------------------------------------------------------------------------
  // Shorthand dual-score fields (for CRM field mapping convenience)
  // -------------------------------------------------------------------------
  
  /** Raw score (pre-enrichment) - convenience field */
  raw_score: number;
  /** Raw tier (pre-enrichment) - convenience field */
  raw_tier: LeadTier;
  /** Enriched score (post-enrichment) - convenience field */
  enriched_score: number;
  /** Enriched tier (post-enrichment) - convenience field */
  enriched_tier: LeadTier;
  /** Score lift from enrichment - convenience field */
  lift: number;
  /** Dimension breakdown - convenience field */
  dimensions: DimensionBreakdown;
  
  // Meta
  enrichment_sources: string[];
  enrichment_duration_ms: number;
}

// ============================================================================
// INSERT / UPDATE TYPES (for database operations)
// ============================================================================

export type LeadInsert = Omit<Lead, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type LeadUpdate = Partial<Omit<Lead, 'id' | 'tenant_id' | 'created_at'>>;

export type ScoringRunInsert = Omit<ScoringRun, 'id' | 'created_at'> & {
  id?: string;
};

export type TenantInsert = Omit<Tenant, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type TenantScoringConfigInsert = Omit<TenantScoringConfig, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};
