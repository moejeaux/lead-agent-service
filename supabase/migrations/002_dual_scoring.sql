-- ============================================================================
-- Dual Scoring: Raw vs Enriched Scores + Dimensions
-- Migration: 002_dual_scoring
-- ============================================================================

-- Add dual scoring columns to scoring_runs
ALTER TABLE scoring_runs
  ADD COLUMN IF NOT EXISTS raw_score INTEGER,
  ADD COLUMN IF NOT EXISTS raw_tier lead_tier,
  ADD COLUMN IF NOT EXISTS enriched_score INTEGER,
  ADD COLUMN IF NOT EXISTS enriched_tier lead_tier,
  ADD COLUMN IF NOT EXISTS lift INTEGER,
  ADD COLUMN IF NOT EXISTS dimensions JSONB;

-- Backfill existing records: set enriched = current values, raw = same (no historical data)
UPDATE scoring_runs
SET
  enriched_score = score,
  enriched_tier = tier,
  raw_score = score,
  raw_tier = tier,
  lift = 0
WHERE enriched_score IS NULL;

-- Add indexes for common queries on dual scoring
CREATE INDEX IF NOT EXISTS idx_scoring_runs_lift ON scoring_runs(lift DESC);
CREATE INDEX IF NOT EXISTS idx_scoring_runs_enriched_score ON scoring_runs(enriched_score DESC);

-- Add comment for documentation
COMMENT ON COLUMN scoring_runs.raw_score IS 'Lead score computed from original CRM data only (pre-enrichment)';
COMMENT ON COLUMN scoring_runs.raw_tier IS 'Lead tier based on raw_score';
COMMENT ON COLUMN scoring_runs.enriched_score IS 'Lead score computed after enrichment with all available signals';
COMMENT ON COLUMN scoring_runs.enriched_tier IS 'Lead tier based on enriched_score';
COMMENT ON COLUMN scoring_runs.lift IS 'Score improvement from enrichment: enriched_score - raw_score';
COMMENT ON COLUMN scoring_runs.dimensions IS 'Dimension breakdown: { fit: 0-100, intent: 0-100, timing: 0-100 }';

