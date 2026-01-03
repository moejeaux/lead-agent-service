import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import {
  UniversalLeadInput,
  EnrichLeadResponseV2,
  SourceCRM,
} from "../types/universal";
import { scoreLeadDual } from "../services/scoring";
import { enrichLead, mergeEnrichment } from "../services/enrichment";
import { optionalTenantAuth } from "../middleware/tenantAuth";
import * as leads from "../db/leads";
import * as scoringRuns from "../db/scoringRuns";

// Import CRM mappers
import { mapSalesforceToUniversal, isSalesforcePayload } from "../mappers/salesforce";
import { mapHubSpotToUniversal, isHubSpotPayload } from "../mappers/hubspot";
import { mapPipedriveToUniversal, isPipedrivePayload } from "../mappers/pipedrive";

const router = Router();

/**
 * POST /enrich-lead
 * Universal lead enrichment + scoring endpoint
 * 
 * Flow: Detect CRM → Map → Enrich → Dual Score (raw vs enriched) → Persist → Return
 */
router.post("/", optionalTenantAuth, async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const tenant = req.tenant!;
    const tenantConfig = req.tenantConfig!;
    const rawPayload = req.body;
    
    // Detect source CRM and map to universal schema
    const { source, universalInput, externalId } = detectAndMap(rawPayload);
    
    // Validate required field
    if (!universalInput.company_domain) {
      return res.status(400).json({
        error: "Missing required field: company_domain (or Company/Email for auto-detection)"
      });
    }
    
    console.log(`[enrich-lead] Processing lead from ${source}:`, {
      domain: universalInput.company_domain,
      email: universalInput.contact_email,
      tenant: tenant.name,
    });
    
    // Store the raw lead (pre-enrichment) for dual scoring
    const rawLead: UniversalLeadInput = { ...universalInput };
    
    // Enrich lead with external data
    const enrichmentResult = await enrichLead(universalInput);
    const enrichedLead = mergeEnrichment(universalInput, enrichmentResult.enrichedData);
    
    // Dual scoring: compute both raw and enriched scores
    const scoringResult = scoreLeadDual({
      rawLead,
      enrichedLead,
      tenantConfig,
    });
    
    // Generate IDs
    const leadId = randomUUID();
    const scoringRunId = randomUUID();
    
    // Persist lead (upsert by tenant + external ID if available)
    // Store enriched values as the canonical lead state
    const persistedLead = await leads.upsertLead(
      tenant.id,
      externalId || leadId,
      {
        ...leads.universalInputToLeadInsert(enrichedLead, {
          external_source: source,
          raw_input: rawPayload,
        }),
        lead_score: scoringResult.enriched_score,
        lead_tier: scoringResult.enriched_tier,
        scoring_version: scoringResult.scoring_version,
        scored_at: new Date().toISOString(),
        enrichment_meta: enrichmentResult.meta,
      }
    );
    
    const totalDurationMs = Date.now() - startTime;
    
    // Record scoring run for audit with full dual scoring data
    await scoringRuns.recordScoringRun({
      leadId: persistedLead?.id ?? null,
      tenantId: tenant.id,
      inputSnapshot: enrichedLead,
      configSnapshot: tenantConfig,
      
      // Dual scoring fields
      rawScore: scoringResult.raw_score,
      rawTier: scoringResult.raw_tier,
      enrichedScore: scoringResult.enriched_score,
      enrichedTier: scoringResult.enriched_tier,
      lift: scoringResult.lift,
      
      // Legacy compat
      score: scoringResult.score,
      tier: scoringResult.tier,
      
      scoringVersion: scoringResult.scoring_version,
      scoreBreakdown: scoringResult.score_breakdown,
      dimensions: scoringResult.dimensions,
      reasons: scoringResult.reasons,
      enrichmentSources: [enrichmentResult.meta.provider],
      enrichmentDurationMs: totalDurationMs,
    });
    
    // Build response with full dual scoring data
    const response: EnrichLeadResponseV2 = {
      lead_id: persistedLead?.id ?? leadId,
      scoring_run_id: scoringRunId,
      enriched: enrichedLead,
      
      // Full scoring result object
      scoring: scoringResult,
      
      // Backward-compatible top-level fields
      lead_score: scoringResult.enriched_score,
      lead_tier: scoringResult.enriched_tier,
      scoring_version: scoringResult.scoring_version,
      score_breakdown: scoringResult.score_breakdown,
      reasons: scoringResult.reasons,
      
      // Shorthand dual-score fields for CRM field mapping
      raw_score: scoringResult.raw_score,
      raw_tier: scoringResult.raw_tier,
      enriched_score: scoringResult.enriched_score,
      enriched_tier: scoringResult.enriched_tier,
      lift: scoringResult.lift,
      dimensions: scoringResult.dimensions,
      
      // Meta
      enrichment_sources: [enrichmentResult.meta.provider],
      enrichment_duration_ms: totalDurationMs,
    };
    
    console.log(`[enrich-lead] Dual scored:`, {
      lead_id: response.lead_id,
      raw_score: response.raw_score,
      enriched_score: response.enriched_score,
      lift: response.lift,
      tier: response.enriched_tier,
      dimensions: response.dimensions,
      duration_ms: totalDurationMs,
    });
    
    return res.status(200).json(response);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[enrich-lead] Error:`, message);
    return res.status(500).json({ error: message });
  }
});

/**
 * Detect CRM source and map to universal schema
 */
function detectAndMap(payload: Record<string, unknown>): {
  source: SourceCRM;
  universalInput: UniversalLeadInput;
  externalId: string | null;
} {
  // Check for explicit source hint
  const hintedSource = payload._source as string | undefined;
  
  // Salesforce detection
  if (hintedSource === "salesforce" || isSalesforcePayload(payload)) {
    const result = mapSalesforceToUniversal(payload);
    return {
      source: "salesforce",
      universalInput: result.universal,
      externalId: result.externalId,
    };
  }
  
  // HubSpot detection
  if (hintedSource === "hubspot" || isHubSpotPayload(payload)) {
    const result = mapHubSpotToUniversal(payload);
    return {
      source: "hubspot",
      universalInput: result.universal,
      externalId: result.externalId,
    };
  }
  
  // Pipedrive detection
  if (hintedSource === "pipedrive" || isPipedrivePayload(payload)) {
    const result = mapPipedriveToUniversal(payload);
    return {
      source: "pipedrive",
      universalInput: result.universal,
      externalId: result.externalId,
    };
  }
  
  // Default: treat as already universal or raw API payload
  return {
    source: "api",
    universalInput: mapRawToUniversal(payload),
    externalId: (payload.external_id as string) || null,
  };
}

/**
 * Map raw/universal payload (pass-through with validation)
 */
function mapRawToUniversal(payload: Record<string, unknown>): UniversalLeadInput {
  // Extract domain from email if not provided
  let domain = payload.company_domain as string | undefined;
  const email = payload.contact_email as string | undefined;
  
  if (!domain && email) {
    domain = email.split("@")[1];
  }
  
  return {
    company_domain: domain || "",
    company_name: payload.company_name as string | undefined,
    company_industry: payload.company_industry as string | undefined,
    company_employee_band: payload.company_employee_band as UniversalLeadInput["company_employee_band"],
    company_revenue_band: payload.company_revenue_band as UniversalLeadInput["company_revenue_band"],
    company_region: payload.company_region as string | undefined,
    company_tech_stack_summary: payload.company_tech_stack_summary as Record<string, unknown> | undefined,
    contact_email: email,
    contact_first_name: payload.contact_first_name as string | undefined,
    contact_last_name: payload.contact_last_name as string | undefined,
    contact_role_function: payload.contact_role_function as UniversalLeadInput["contact_role_function"],
    contact_role_seniority: payload.contact_role_seniority as UniversalLeadInput["contact_role_seniority"],
    contact_title_raw: payload.contact_title_raw as string | undefined,
    contact_geo: payload.contact_geo as string | undefined,
    contact_phone: payload.contact_phone as string | undefined,
    primary_use_case: payload.primary_use_case as string | undefined,
    estimated_deal_band: payload.estimated_deal_band as UniversalLeadInput["estimated_deal_band"],
    urgency_band: payload.urgency_band as UniversalLeadInput["urgency_band"],
    lead_source: payload.lead_source as string | undefined,
  };
}

export default router;
