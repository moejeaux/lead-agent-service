import { getSupabase } from "./supabase";
import { Tenant, TenantScoringConfig, TenantInsert, TenantScoringConfigInsert } from "../types/universal";

const TENANTS_TABLE = "tenants";
const CONFIG_TABLE = "tenant_scoring_config";

/**
 * Get tenant by API key (for auth)
 */
export async function getTenantByApiKey(apiKey: string): Promise<Tenant | null> {
  const supabase = getSupabase();
  
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from(TENANTS_TABLE)
    .select("*")
    .eq("api_key", apiKey)
    .eq("is_active", true)
    .single();
  
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get tenant: ${error.message}`);
  }
  
  return data as Tenant;
}

/**
 * Get tenant by ID
 */
export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const supabase = getSupabase();
  
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from(TENANTS_TABLE)
    .select("*")
    .eq("id", tenantId)
    .single();
  
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get tenant: ${error.message}`);
  }
  
  return data as Tenant;
}

/**
 * Get tenant scoring config
 */
export async function getTenantScoringConfig(tenantId: string): Promise<TenantScoringConfig | null> {
  const supabase = getSupabase();
  
  if (!supabase) return null;
  
  const { data, error } = await supabase
    .from(CONFIG_TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .single();
  
  if (error) {
    if (error.code === "PGRST116") return null; // No config = use defaults
    throw new Error(`Failed to get tenant config: ${error.message}`);
  }
  
  return data as TenantScoringConfig;
}

/**
 * Create or update tenant scoring config
 */
export async function upsertTenantScoringConfig(
  tenantId: string,
  config: Partial<TenantScoringConfigInsert>
): Promise<TenantScoringConfig | null> {
  const supabase = getSupabase();
  
  if (!supabase) return null;
  
  const record: TenantScoringConfigInsert = {
    tenant_id: tenantId,
    scoring_version: config.scoring_version ?? "v1",
    weight_overrides: config.weight_overrides ?? {},
    priority_industries: config.priority_industries ?? [],
    excluded_regions: config.excluded_regions ?? [],
    priority_use_cases: config.priority_use_cases ?? [],
    hot_threshold: config.hot_threshold ?? 70,
    warm_threshold: config.warm_threshold ?? 40,
  };
  
  const { data, error } = await supabase
    .from(CONFIG_TABLE)
    .upsert(record, { onConflict: "tenant_id" })
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to upsert tenant config: ${error.message}`);
  }
  
  return data as TenantScoringConfig;
}

/**
 * Create a new tenant
 */
export async function createTenant(params: {
  name: string;
  apiKey: string;
  sourceCrm?: string;
}): Promise<Tenant> {
  const supabase = getSupabase();
  
  if (!supabase) {
    throw new Error("Supabase not configured");
  }
  
  const record: TenantInsert = {
    name: params.name,
    api_key: params.apiKey,
    source_crm: params.sourceCrm ?? null,
    is_active: true,
  };
  
  const { data, error } = await supabase
    .from(TENANTS_TABLE)
    .insert(record)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to create tenant: ${error.message}`);
  }
  
  return data as Tenant;
}

/**
 * Get default scoring config (when tenant has no custom config)
 */
export function getDefaultScoringConfig(): Omit<TenantScoringConfig, 'id' | 'tenant_id' | 'created_at' | 'updated_at'> {
  return {
    scoring_version: "v1",
    weight_overrides: {},
    priority_industries: [],
    excluded_regions: [],
    priority_use_cases: [],
    hot_threshold: 70,
    warm_threshold: 40,
  };
}

