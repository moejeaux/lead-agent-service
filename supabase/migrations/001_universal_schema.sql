-- ============================================================================
-- Universal Lead Enrichment + Scoring Schema
-- Migration: 001_universal_schema
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------

CREATE TYPE employee_band AS ENUM ('1-10', '11-50', '51-200', '201-1000', '1000+');
CREATE TYPE revenue_band AS ENUM ('<1M', '1-10M', '10-50M', '50-250M', '250M+');
CREATE TYPE role_function AS ENUM ('Sales', 'Marketing', 'RevOps', 'Ops', 'Finance', 'IT', 'FounderExec', 'Legal', 'Other');
CREATE TYPE role_seniority AS ENUM ('IC', 'Manager', 'Director', 'VP', 'C-Level');
CREATE TYPE deal_band AS ENUM ('Small', 'Mid', 'Enterprise');
CREATE TYPE urgency_band AS ENUM ('Exploring', 'ThisQuarter', 'ThisMonth');
CREATE TYPE lead_tier AS ENUM ('Hot', 'Warm', 'Cold');

-- ----------------------------------------------------------------------------
-- TENANTS
-- Multi-tenant client accounts
-- ----------------------------------------------------------------------------

CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  api_key         TEXT UNIQUE NOT NULL,
  source_crm      TEXT,                            -- 'salesforce' | 'hubspot' | 'pipedrive' | 'api'
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_api_key ON tenants(api_key);

-- ----------------------------------------------------------------------------
-- TENANT_SCORING_CONFIG
-- Per-tenant scoring weights, thresholds, and overrides
-- ----------------------------------------------------------------------------

CREATE TABLE tenant_scoring_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Scoring version / model identifier
  scoring_version       TEXT DEFAULT 'v1',
  
  -- Weight overrides: { "company_size": 1.5, "seniority": 1.2 }
  weight_overrides      JSONB DEFAULT '{}',
  
  -- Inclusion/exclusion rules
  priority_industries   TEXT[] DEFAULT '{}',       -- Industries to boost
  excluded_regions      TEXT[] DEFAULT '{}',       -- Regions to penalize/exclude
  priority_use_cases    TEXT[] DEFAULT '{}',       -- Use cases to boost
  
  -- Tier threshold overrides
  hot_threshold         INTEGER DEFAULT 70,        -- score >= this = Hot
  warm_threshold        INTEGER DEFAULT 40,        -- score >= this = Warm (else Cold)
  
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id)
);

-- ----------------------------------------------------------------------------
-- LEADS
-- Universal schema lead records (normalized from any CRM)
-- Rename this table if 'leads' already exists in your Supabase
-- ----------------------------------------------------------------------------

CREATE TABLE leads (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- External identifiers
  external_id                 TEXT,                  -- CRM record ID
  external_source             TEXT,                  -- 'salesforce' | 'hubspot' | 'pipedrive' | 'api'
  
  -- =========================================================================
  -- COMPANY-LEVEL (Universal Schema)
  -- =========================================================================
  company_domain              TEXT NOT NULL,
  company_name                TEXT,
  company_industry            TEXT,                  -- Normalized industry
  company_employee_band       employee_band,
  company_revenue_band        revenue_band,
  company_region              TEXT,                  -- Region/country code
  company_tech_stack_summary  JSONB,                 -- { "crm": "salesforce", "marketing": "hubspot", ... }
  
  -- =========================================================================
  -- PERSON-LEVEL (Universal Schema)
  -- =========================================================================
  contact_email               TEXT,
  contact_first_name          TEXT,
  contact_last_name           TEXT,
  contact_role_function       role_function,
  contact_role_seniority      role_seniority,
  contact_title_raw           TEXT,
  contact_geo                 TEXT,
  contact_phone               TEXT,
  
  -- =========================================================================
  -- NEED / FIT
  -- =========================================================================
  primary_use_case            TEXT,
  estimated_deal_band         deal_band,
  urgency_band                urgency_band,
  lead_source                 TEXT,
  
  -- =========================================================================
  -- SCORING (Populated by scoring engine)
  -- =========================================================================
  lead_score                  INTEGER,               -- 0-100
  lead_tier                   lead_tier,
  scoring_version             TEXT,
  scored_at                   TIMESTAMPTZ,
  
  -- =========================================================================
  -- RAW / ENRICHMENT DATA
  -- =========================================================================
  raw_input                   JSONB,                 -- Latest raw CRM payload
  enrichment_meta             JSONB,                 -- { "provider": "clearbit", "enriched_at": "...", "confidence": 0.9 }
  
  -- Timestamps
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint for upsert behavior
  UNIQUE(tenant_id, external_id)
);

CREATE INDEX idx_leads_tenant ON leads(tenant_id);
CREATE INDEX idx_leads_external ON leads(tenant_id, external_id);
CREATE INDEX idx_leads_domain ON leads(company_domain);
CREATE INDEX idx_leads_score ON leads(lead_score DESC);
CREATE INDEX idx_leads_tier ON leads(lead_tier);

-- ----------------------------------------------------------------------------
-- SCORING_RUNS
-- Audit log for every scoring decision (for debugging + ML training)
-- ----------------------------------------------------------------------------

CREATE TABLE scoring_runs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                 UUID REFERENCES leads(id) ON DELETE SET NULL,
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Snapshot of what was used at scoring time
  input_snapshot          JSONB NOT NULL,            -- Universal fields snapshot
  config_snapshot         JSONB,                     -- Tenant config used
  
  -- Scoring output
  score                   INTEGER NOT NULL,
  tier                    lead_tier NOT NULL,
  scoring_version         TEXT NOT NULL,
  score_breakdown         JSONB,                     -- { "email_domain": 15, "seniority": 20, ... }
  reasons                 TEXT[],                    -- Human-readable reasons
  
  -- Enrichment metadata
  enrichment_sources      TEXT[],                    -- ['clearbit', 'apollo']
  enrichment_duration_ms  INTEGER,
  
  -- Timing
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scoring_runs_lead ON scoring_runs(lead_id);
CREATE INDEX idx_scoring_runs_tenant ON scoring_runs(tenant_id);
CREATE INDEX idx_scoring_runs_created ON scoring_runs(created_at DESC);
CREATE INDEX idx_scoring_runs_version ON scoring_runs(scoring_version);

-- ----------------------------------------------------------------------------
-- HELPER FUNCTIONS
-- ----------------------------------------------------------------------------

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_scoring_config_updated_at
  BEFORE UPDATE ON tenant_scoring_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY (Optional - enable if using Supabase Auth)
-- ----------------------------------------------------------------------------

-- ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tenant_scoring_config ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE scoring_runs ENABLE ROW LEVEL SECURITY;

-- Example policy: tenants can only see their own data
-- CREATE POLICY "Tenants see own leads" ON leads
--   FOR ALL USING (tenant_id = auth.uid());

