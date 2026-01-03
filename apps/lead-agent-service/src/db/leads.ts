import { getSupabase, isSupabaseConfigured } from "./supabase";
import { Lead, LeadInsert, LeadUpdate, UniversalLeadInput, LeadTier } from "../types/universal";

const TABLE = "leads";

/**
 * Upsert a lead by (tenant_id, external_id)
 * - Inserts on first seen
 * - Updates on subsequent calls
 */
export async function upsertLead(
  tenantId: string,
  externalId: string,
  data: Partial<LeadInsert>
): Promise<Lead | null> {
  const supabase = getSupabase();
  
  if (!supabase) {
    console.warn("[leads] Supabase not configured, skipping upsert");
    return null;
  }
  
  const record: LeadInsert = {
    tenant_id: tenantId,
    external_id: externalId,
    external_source: data.external_source ?? null,
    company_domain: data.company_domain ?? "",
    company_name: data.company_name ?? null,
    company_industry: data.company_industry ?? null,
    company_employee_band: data.company_employee_band ?? null,
    company_revenue_band: data.company_revenue_band ?? null,
    company_region: data.company_region ?? null,
    company_tech_stack_summary: data.company_tech_stack_summary ?? null,
    contact_email: data.contact_email ?? null,
    contact_first_name: data.contact_first_name ?? null,
    contact_last_name: data.contact_last_name ?? null,
    contact_role_function: data.contact_role_function ?? null,
    contact_role_seniority: data.contact_role_seniority ?? null,
    contact_title_raw: data.contact_title_raw ?? null,
    contact_geo: data.contact_geo ?? null,
    contact_phone: data.contact_phone ?? null,
    primary_use_case: data.primary_use_case ?? null,
    estimated_deal_band: data.estimated_deal_band ?? null,
    urgency_band: data.urgency_band ?? null,
    lead_source: data.lead_source ?? null,
    lead_score: data.lead_score ?? null,
    lead_tier: data.lead_tier ?? null,
    scoring_version: data.scoring_version ?? null,
    scored_at: data.scored_at ?? null,
    raw_input: data.raw_input ?? null,
    enrichment_meta: data.enrichment_meta ?? null,
  };
  
  const { data: result, error } = await supabase
    .from(TABLE)
    .upsert(record, {
      onConflict: "tenant_id,external_id",
      ignoreDuplicates: false,
    })
    .select()
    .single();
  
  if (error) {
    console.error("[leads] Upsert error:", error.message);
    throw new Error(`Failed to upsert lead: ${error.message}`);
  }
  
  return result as Lead;
}

/**
 * Update scoring fields on an existing lead
 */
export async function updateLeadScoring(
  leadId: string,
  score: number,
  tier: LeadTier,
  scoringVersion: string
): Promise<Lead | null> {
  const supabase = getSupabase();
  
  if (!supabase) {
    console.warn("[leads] Supabase not configured, skipping update");
    return null;
  }
  
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      lead_score: score,
      lead_tier: tier,
      scoring_version: scoringVersion,
      scored_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .select()
    .single();
  
  if (error) {
    console.error("[leads] Update scoring error:", error.message);
    throw new Error(`Failed to update lead scoring: ${error.message}`);
  }
  
  return data as Lead;
}

/**
 * Get a lead by ID
 */
export async function getLeadById(leadId: string): Promise<Lead | null> {
  const supabase = getSupabase();
  
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", leadId)
    .single();
  
  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw new Error(`Failed to get lead: ${error.message}`);
  }
  
  return data as Lead;
}

/**
 * Get a lead by tenant + external ID
 */
export async function getLeadByExternalId(
  tenantId: string,
  externalId: string
): Promise<Lead | null> {
  const supabase = getSupabase();
  
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("external_id", externalId)
    .single();
  
  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw new Error(`Failed to get lead: ${error.message}`);
  }
  
  return data as Lead;
}

/**
 * List leads for a tenant with optional filters
 */
export async function listLeads(
  tenantId: string,
  options: {
    limit?: number;
    offset?: number;
    tier?: LeadTier;
    minScore?: number;
  } = {}
): Promise<Lead[]> {
  const supabase = getSupabase();
  
  if (!supabase) return [];
  
  let query = supabase
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  
  if (options.tier) {
    query = query.eq("lead_tier", options.tier);
  }
  
  if (options.minScore !== undefined) {
    query = query.gte("lead_score", options.minScore);
  }
  
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to list leads: ${error.message}`);
  }
  
  return (data || []) as Lead[];
}

/**
 * Convert UniversalLeadInput to LeadInsert fields
 */
export function universalInputToLeadInsert(
  input: UniversalLeadInput,
  extra: {
    external_source?: string;
    raw_input?: Record<string, unknown>;
  } = {}
): Partial<LeadInsert> {
  return {
    company_domain: input.company_domain,
    company_name: input.company_name ?? null,
    company_industry: input.company_industry ?? null,
    company_employee_band: input.company_employee_band ?? null,
    company_revenue_band: input.company_revenue_band ?? null,
    company_region: input.company_region ?? null,
    company_tech_stack_summary: input.company_tech_stack_summary ?? null,
    contact_email: input.contact_email ?? null,
    contact_first_name: input.contact_first_name ?? null,
    contact_last_name: input.contact_last_name ?? null,
    contact_role_function: input.contact_role_function ?? null,
    contact_role_seniority: input.contact_role_seniority ?? null,
    contact_title_raw: input.contact_title_raw ?? null,
    contact_geo: input.contact_geo ?? null,
    contact_phone: input.contact_phone ?? null,
    primary_use_case: input.primary_use_case ?? null,
    estimated_deal_band: input.estimated_deal_band ?? null,
    urgency_band: input.urgency_band ?? null,
    lead_source: input.lead_source ?? null,
    external_source: extra.external_source ?? null,
    raw_input: extra.raw_input ?? null,
  };
}

