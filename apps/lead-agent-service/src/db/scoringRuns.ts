import { getSupabase } from "./supabase";
import {
  ScoringRun,
  ScoringRunInsert,
  UniversalLeadInput,
  TenantScoringConfig,
  LeadTier,
  DimensionBreakdown,
} from "../types/universal";

const TABLE = "scoring_runs";

/**
 * Record a scoring run (audit log entry) with dual scoring data
 */
export async function recordScoringRun(params: {
  leadId: string | null;
  tenantId: string;
  inputSnapshot: UniversalLeadInput;
  configSnapshot?: TenantScoringConfig | null;
  
  // Dual scoring fields
  rawScore: number;
  rawTier: LeadTier;
  enrichedScore: number;
  enrichedTier: LeadTier;
  lift: number;
  
  // Legacy compat (= enriched values)
  score: number;
  tier: LeadTier;
  
  scoringVersion: string;
  scoreBreakdown?: Record<string, number>;
  dimensions?: DimensionBreakdown;
  reasons: string[];
  enrichmentSources?: string[];
  enrichmentDurationMs?: number;
}): Promise<ScoringRun | null> {
  const supabase = getSupabase();
  
  if (!supabase) {
    console.warn("[scoringRuns] Supabase not configured, skipping record");
    // Log to console for debugging when Supabase isn't configured
    console.log("[scoringRuns] Would record:", {
      raw_score: params.rawScore,
      raw_tier: params.rawTier,
      enriched_score: params.enrichedScore,
      enriched_tier: params.enrichedTier,
      lift: params.lift,
    });
    return null;
  }
  
  const record: ScoringRunInsert = {
    lead_id: params.leadId,
    tenant_id: params.tenantId,
    input_snapshot: params.inputSnapshot,
    config_snapshot: params.configSnapshot ?? null,
    
    // Dual scoring
    raw_score: params.rawScore,
    raw_tier: params.rawTier,
    enriched_score: params.enrichedScore,
    enriched_tier: params.enrichedTier,
    lift: params.lift,
    
    // Legacy compat (= enriched values)
    score: params.score,
    tier: params.tier,
    
    scoring_version: params.scoringVersion,
    score_breakdown: params.scoreBreakdown ?? null,
    dimensions: params.dimensions ?? null,
    reasons: params.reasons,
    enrichment_sources: params.enrichmentSources ?? null,
    enrichment_duration_ms: params.enrichmentDurationMs ?? null,
  };
  
  const { data, error } = await supabase
    .from(TABLE)
    .insert(record)
    .select()
    .single();
  
  if (error) {
    console.error("[scoringRuns] Insert error:", error.message);
    throw new Error(`Failed to record scoring run: ${error.message}`);
  }
  
  return data as ScoringRun;
}

/**
 * Get scoring runs for a lead
 */
export async function getScoringRunsForLead(
  leadId: string,
  limit: number = 10
): Promise<ScoringRun[]> {
  const supabase = getSupabase();
  
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  
  if (error) {
    throw new Error(`Failed to get scoring runs: ${error.message}`);
  }
  
  return (data || []) as ScoringRun[];
}

/**
 * Get recent scoring runs for a tenant (for monitoring/debugging)
 */
export async function getRecentScoringRuns(
  tenantId: string,
  limit: number = 50
): Promise<ScoringRun[]> {
  const supabase = getSupabase();
  
  if (!supabase) return [];
  
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  
  if (error) {
    throw new Error(`Failed to get recent scoring runs: ${error.message}`);
  }
  
  return (data || []) as ScoringRun[];
}

/**
 * Get scoring run by ID
 */
export async function getScoringRunById(id: string): Promise<ScoringRun | null> {
  const supabase = getSupabase();
  
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();
  
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get scoring run: ${error.message}`);
  }
  
  return data as ScoringRun;
}

/**
 * Get scoring stats for a tenant (for analytics)
 * Now includes lift statistics
 */
export async function getScoringStats(
  tenantId: string,
  scoringVersion?: string
): Promise<{
  total: number;
  avgScore: number;
  avgRawScore: number;
  avgEnrichedScore: number;
  avgLift: number;
  tierCounts: Record<LeadTier, number>;
}> {
  const supabase = getSupabase();
  
  if (!supabase) {
    return {
      total: 0,
      avgScore: 0,
      avgRawScore: 0,
      avgEnrichedScore: 0,
      avgLift: 0,
      tierCounts: { Hot: 0, Warm: 0, Cold: 0 },
    };
  }
  
  let query = supabase
    .from(TABLE)
    .select("score, tier, raw_score, enriched_score, lift")
    .eq("tenant_id", tenantId);
  
  if (scoringVersion) {
    query = query.eq("scoring_version", scoringVersion);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to get scoring stats: ${error.message}`);
  }
  
  const runs = data || [];
  const total = runs.length;
  
  if (total === 0) {
    return {
      total: 0,
      avgScore: 0,
      avgRawScore: 0,
      avgEnrichedScore: 0,
      avgLift: 0,
      tierCounts: { Hot: 0, Warm: 0, Cold: 0 },
    };
  }
  
  const avgScore = runs.reduce((sum, r) => sum + (r.score ?? 0), 0) / total;
  const avgRawScore = runs.reduce((sum, r) => sum + (r.raw_score ?? 0), 0) / total;
  const avgEnrichedScore = runs.reduce((sum, r) => sum + (r.enriched_score ?? 0), 0) / total;
  const avgLift = runs.reduce((sum, r) => sum + (r.lift ?? 0), 0) / total;
  
  const tierCounts: Record<LeadTier, number> = { Hot: 0, Warm: 0, Cold: 0 };
  for (const run of runs) {
    if (run.tier in tierCounts) {
      tierCounts[run.tier as LeadTier]++;
    }
  }
  
  return {
    total,
    avgScore: Math.round(avgScore * 10) / 10,
    avgRawScore: Math.round(avgRawScore * 10) / 10,
    avgEnrichedScore: Math.round(avgEnrichedScore * 10) / 10,
    avgLift: Math.round(avgLift * 10) / 10,
    tierCounts,
  };
}
