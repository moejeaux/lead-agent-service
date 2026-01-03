import {
  UniversalLeadInput,
  EmployeeBand,
  RevenueBand,
  RoleFunction,
  RoleSeniority,
  EnrichmentMeta,
} from "../types/universal";

/**
 * Enrichment result - data fetched from external providers
 */
export interface EnrichmentResult {
  enrichedData: Partial<UniversalLeadInput>;
  meta: EnrichmentMeta;
  durationMs: number;
}

/**
 * Enrich a lead using external data providers
 * Currently stubbed - plug in Clearbit, ZoomInfo, Apollo, etc.
 */
export async function enrichLead(input: UniversalLeadInput): Promise<EnrichmentResult> {
  const startTime = Date.now();
  
  console.log(`[enrichment] Enriching: ${input.contact_email || input.company_domain}`);
  
  // Stub enrichment - replace with actual API calls
  const enrichedData = await stubEnrichment(input);
  
  const durationMs = Date.now() - startTime;
  
  return {
    enrichedData,
    meta: {
      provider: "stub",
      enriched_at: new Date().toISOString(),
      confidence: 0.0,
    },
    durationMs,
  };
}

/**
 * Merge enrichment data into lead input
 * Only fills in missing fields - doesn't overwrite existing data
 */
export function mergeEnrichment(
  original: UniversalLeadInput,
  enriched: Partial<UniversalLeadInput>
): UniversalLeadInput {
  return {
    // Company-level (prefer original, fill gaps with enriched)
    company_domain: original.company_domain,
    company_name: original.company_name ?? enriched.company_name,
    company_industry: original.company_industry ?? enriched.company_industry,
    company_employee_band: original.company_employee_band ?? enriched.company_employee_band,
    company_revenue_band: original.company_revenue_band ?? enriched.company_revenue_band,
    company_region: original.company_region ?? enriched.company_region,
    company_tech_stack_summary: original.company_tech_stack_summary ?? enriched.company_tech_stack_summary,
    
    // Person-level
    contact_email: original.contact_email ?? enriched.contact_email,
    contact_first_name: original.contact_first_name ?? enriched.contact_first_name,
    contact_last_name: original.contact_last_name ?? enriched.contact_last_name,
    contact_role_function: original.contact_role_function ?? enriched.contact_role_function,
    contact_role_seniority: original.contact_role_seniority ?? enriched.contact_role_seniority,
    contact_title_raw: original.contact_title_raw ?? enriched.contact_title_raw,
    contact_geo: original.contact_geo ?? enriched.contact_geo,
    contact_phone: original.contact_phone ?? enriched.contact_phone,
    
    // Need / fit
    primary_use_case: original.primary_use_case ?? enriched.primary_use_case,
    estimated_deal_band: original.estimated_deal_band ?? enriched.estimated_deal_band,
    urgency_band: original.urgency_band ?? enriched.urgency_band,
    lead_source: original.lead_source ?? enriched.lead_source,
  };
}

// ============================================================================
// STUB ENRICHMENT (Replace with real providers)
// ============================================================================

async function stubEnrichment(input: UniversalLeadInput): Promise<Partial<UniversalLeadInput>> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
  const enriched: Partial<UniversalLeadInput> = {};
  
  // Infer employee band from domain (stub logic)
  if (!input.company_employee_band && input.company_domain) {
    // In real implementation: call Clearbit/ZoomInfo API
    // enriched.company_employee_band = await lookupEmployeeCount(input.company_domain);
  }
  
  // Infer seniority from title if not set
  if (!input.contact_role_seniority && input.contact_title_raw) {
    enriched.contact_role_seniority = inferSeniorityFromTitle(input.contact_title_raw);
  }
  
  // Infer function from title if not set
  if (!input.contact_role_function && input.contact_title_raw) {
    enriched.contact_role_function = inferFunctionFromTitle(input.contact_title_raw);
  }
  
  return enriched;
}

// ============================================================================
// INFERENCE HELPERS
// ============================================================================

function inferSeniorityFromTitle(title: string): RoleSeniority | undefined {
  const titleLower = title.toLowerCase();
  
  const cSuiteKeywords = ["ceo", "cto", "cfo", "coo", "cmo", "chief", "founder", "owner", "president"];
  const vpKeywords = ["vp", "vice president", "head of"];
  const directorKeywords = ["director"];
  const managerKeywords = ["manager", "lead"];
  
  if (cSuiteKeywords.some(k => titleLower.includes(k))) return "C-Level";
  if (vpKeywords.some(k => titleLower.includes(k))) return "VP";
  if (directorKeywords.some(k => titleLower.includes(k))) return "Director";
  if (managerKeywords.some(k => titleLower.includes(k))) return "Manager";
  
  return "IC";
}

function inferFunctionFromTitle(title: string): RoleFunction | undefined {
  const titleLower = title.toLowerCase();
  
  if (/sales|account exec|ae|sdr|bdr|business dev/i.test(titleLower)) return "Sales";
  if (/marketing|growth|demand gen|content/i.test(titleLower)) return "Marketing";
  if (/rev\s*ops|revenue ops|sales ops|mops/i.test(titleLower)) return "RevOps";
  if (/operations|ops manager|supply chain/i.test(titleLower)) return "Ops";
  if (/finance|accounting|controller|fp&a/i.test(titleLower)) return "Finance";
  if (/engineer|developer|devops|it|tech|cto|architect/i.test(titleLower)) return "IT";
  if (/ceo|founder|owner|president|coo|cfo|chief/i.test(titleLower)) return "FounderExec";
  if (/legal|counsel|compliance/i.test(titleLower)) return "Legal";
  
  return "Other";
}

// ============================================================================
// PROVIDER STUBS (Implement these with real API calls)
// ============================================================================

/**
 * Clearbit enrichment stub
 * @see https://clearbit.com/docs
 */
export async function enrichWithClearbit(
  email?: string,
  domain?: string
): Promise<Partial<UniversalLeadInput>> {
  console.log(`[enrichment:clearbit] Would enrich: ${email || domain}`);
  // TODO: Implement Clearbit API call
  return {};
}

/**
 * Apollo enrichment stub
 * @see https://docs.apollo.io
 */
export async function enrichWithApollo(
  email?: string,
  domain?: string
): Promise<Partial<UniversalLeadInput>> {
  console.log(`[enrichment:apollo] Would enrich: ${email || domain}`);
  // TODO: Implement Apollo API call
  return {};
}

/**
 * ZoomInfo enrichment stub
 * @see https://developers.zoominfo.com
 */
export async function enrichWithZoomInfo(
  email?: string,
  domain?: string
): Promise<Partial<UniversalLeadInput>> {
  console.log(`[enrichment:zoominfo] Would enrich: ${email || domain}`);
  // TODO: Implement ZoomInfo API call
  return {};
}
