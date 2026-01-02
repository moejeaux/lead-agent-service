# Lead Agent Service Roadmap

## Vision

Deterministic scoring rules today, wrapped in a loop that quietly self-improves from Salesforce outcomes over time. Full control, explainable decisions, data-driven evolution.

---

## Phase 1: Stable Rules + Observability ✅ (Current)

**Status:** Implemented

### Goals
- Rock-solid, explainable baseline scoring
- Dataset you can trust for future analysis

### Completed
- [x] Deterministic `scoreLead()` with human-readable reasons
- [x] Decision logging with: lead fields, score, tier, reasons, decisionId
- [x] Console logging for Railway observability
- [x] In-memory store (Postgres-ready)

### TODO
- [ ] Add Salesforce ID / Opportunity ID to decision log when available
- [ ] Create `lead_decisions` Postgres table schema
- [ ] Add endpoint to receive Salesforce outcome webhooks (closed_won, deal_size, cycle_length)
- [ ] Link decisions to outcomes via Salesforce Lead ID

### Schema Extension
```typescript
interface LeadDecision {
  // ... existing fields ...
  salesforceLeadId?: string;      // SF Lead ID for joining
  salesforceOpportunityId?: string;
  outcomeReceivedAt?: Date;
  closedWon?: boolean;
  dealSize?: number;
  cycleLength?: number;           // days from lead to close
}
```

---

## Phase 2: Outcome-Linked Feedback Loop

**Status:** Planned

**Trigger:** After 4-6 weeks of decision + outcome data accumulates

### Goals
- Compute performance stats per scoring band
- Hand-tune rules based on real data, not vibes

### Tasks
- [ ] Create analytics queries/views:
  ```sql
  -- Win rate by tier
  SELECT tier, 
         COUNT(*) as total,
         SUM(CASE WHEN closed_won THEN 1 ELSE 0 END) as wins,
         AVG(deal_size) as avg_deal,
         AVG(cycle_length) as avg_cycle
  FROM lead_decisions
  WHERE outcome_received_at IS NOT NULL
  GROUP BY tier;
  
  -- Win rate by score deciles
  SELECT FLOOR(score / 10) * 10 as score_band,
         COUNT(*) as total,
         SUM(CASE WHEN closed_won THEN 1 ELSE 0 END) as wins
  FROM lead_decisions
  WHERE outcome_received_at IS NOT NULL
  GROUP BY score_band
  ORDER BY score_band;
  ```

- [ ] Build `/analytics` endpoint for dashboard:
  - Win rate by tier (low/medium/high)
  - Win rate by score deciles (0-9, 10-19, ..., 90-100+)
  - Average deal size by tier
  - Average cycle length by tier
  - Performance by industry, title level, company size, source

- [ ] Create rule tuning recommendations report:
  - Identify high-performing segments under-weighted
  - Identify low-performing segments over-weighted
  - Example: "Referrals at score 60+ close 85% → consider +5 source weight"
  - Example: "Companies <20 employees rarely close even at 70+ → consider -5 size weight"

### Deliverables
- Analytics dashboard endpoint
- Weekly/monthly performance report
- Rule adjustment recommendations (manual review)

---

## Phase 3: Gentle Auto-Improvement

**Status:** Future

**Trigger:** Stable Phase 2 analytics + confidence in data quality

### Goals
- Automated rule adjustment proposals
- Shadow mode testing before production
- Never silently mutate live scoring logic

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Production Scoring                        │
│                    (current rules)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ decisions + outcomes
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Improvement Agent                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Observe   │→ │   Propose   │→ │   Simulate          │  │
│  │  (last N    │  │  (new       │  │   (backtest on      │  │
│  │   days)     │  │   weights)  │  │    historical)      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                              │               │
│                                              ▼               │
│                              ┌─────────────────────────────┐ │
│                              │  Evaluate                   │ │
│                              │  - Beat current by X%?      │ │
│                              │  - Pass sanity checks?      │ │
│                              │  - No regression on key     │ │
│                              │    segments?                │ │
│                              └─────────────────────────────┘ │
│                                              │               │
│                                    ┌────────┴────────┐      │
│                                    ▼                 ▼      │
│                              ┌──────────┐     ┌──────────┐  │
│                              │ PROMOTE  │     │ DISCARD  │  │
│                              │ (human   │     │          │  │
│                              │  review) │     │          │  │
│                              └──────────┘     └──────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Tasks
- [ ] Create `scoring_rules` table to version rule configurations
- [ ] Build rule proposal engine:
  - Analyze last N days of outcomes
  - Propose weight adjustments based on segment performance
  - Never exceed ±20% change per iteration
  
- [ ] Implement shadow scoring:
  - Run proposed rules against incoming leads in parallel
  - Log shadow scores without affecting production
  - Compare shadow vs production predictions against outcomes

- [ ] Build promotion criteria:
  - Minimum improvement threshold (e.g., +5% win rate prediction)
  - No regression on high-value segments
  - Sanity checks (no rule weights < 0 or > 50)
  - Human approval gate before promotion

- [ ] Create `/rules` management endpoints:
  - `GET /rules/current` - active rule configuration
  - `GET /rules/proposed` - pending proposals
  - `GET /rules/history` - version history
  - `POST /rules/promote/:version` - promote proposed rules (admin only)
  - `POST /rules/rollback/:version` - rollback to previous (admin only)

### Safeguards
- All rule changes require human approval
- Automatic rollback if win rate drops >10% over 48 hours
- Audit log of all rule changes with before/after comparison
- A/B testing capability for gradual rollout

---

## Technical Debt & Infrastructure

### Database
- [ ] Set up Postgres on Railway
- [ ] Create migrations for `lead_decisions` table
- [ ] Create migrations for `scoring_rules` table
- [ ] Create migrations for `rule_proposals` table

### Monitoring
- [ ] Add structured JSON logging for Railway
- [ ] Create Grafana/dashboard for scoring metrics
- [ ] Alert on sudden score distribution changes
- [ ] Alert on decision volume anomalies

### API Hardening
- [ ] Add rate limiting
- [ ] Add API key authentication
- [ ] Add request validation with Zod
- [ ] Add OpenAPI response validation

---

## Success Metrics

| Phase | Metric | Target |
|-------|--------|--------|
| 1 | Decision logging coverage | 100% |
| 1 | Outcome linkage rate | >80% of leads |
| 2 | Win rate prediction accuracy | >70% |
| 2 | Score-to-outcome correlation | >0.5 |
| 3 | Auto-proposed rules adopted | >50% |
| 3 | Time to rule improvement | <2 weeks |

---

## Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1 (Observability) | 2-4 weeks | Postgres setup, SF webhook |
| Phase 2 (Analytics) | 4-6 weeks | 1000+ decisions with outcomes |
| Phase 3 (Auto-improve) | 8-12 weeks | Stable Phase 2, confidence in data |

---

## Notes

- **Never silently mutate live scoring logic** - all changes through explicit promotion
- **Explain everything** - every score change must have human-readable reasons
- **Data quality first** - Phase 3 is only valuable with clean outcome data
- **Start simple** - hand-tuned rules beat complex ML with bad data

