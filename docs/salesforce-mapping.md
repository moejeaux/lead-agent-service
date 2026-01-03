# Salesforce Field Mapping Guide

This guide explains how to create custom fields in Salesforce and map them to the Lead Agent Service response.

## Custom Fields to Create on Lead Object

Create these custom fields on the **Lead** object in Salesforce Setup:

### Scoring Fields

| API Name | Label | Type | Description |
|----------|-------|------|-------------|
| `Raw_Lead_Score__c` | Raw Lead Score | Number(3,0) | Score from original form data (0-100) |
| `Enriched_Lead_Score__c` | Enriched Lead Score | Number(3,0) | Score after enrichment (0-100) |
| `Lead_Score_Lift__c` | Score Lift | Number(3,0) | Improvement from enrichment |
| `Lead_Tier__c` | Lead Tier | Picklist | Values: Hot, Warm, Cold |
| `Scoring_Version__c` | Scoring Version | Text(10) | e.g., "v1" |

### Dimension Fields

| API Name | Label | Type | Description |
|----------|-------|------|-------------|
| `Fit_Score__c` | Fit Score | Number(3,0) | ICP/firmographic fit (0-100) |
| `Intent_Score__c` | Intent Score | Number(3,0) | Interest/behavior signals (0-100) |
| `Timing_Score__c` | Timing Score | Number(3,0) | Urgency signals (0-100) |

### Enrichment Fields

| API Name | Label | Type | Description |
|----------|-------|------|-------------|
| `Company_Employee_Band__c` | Employee Band | Picklist | 1-10, 11-50, 51-200, 201-1000, 1000+ |
| `Company_Revenue_Band__c` | Revenue Band | Picklist | <1M, 1-10M, 10-50M, 50-250M, 250M+ |
| `Contact_Seniority__c` | Contact Seniority | Picklist | IC, Manager, Director, VP, C-Level |
| `Contact_Function__c` | Contact Function | Picklist | Sales, Marketing, RevOps, Ops, Finance, IT, FounderExec, Legal, Other |
| `Scoring_Reasons__c` | Scoring Reasons | Long Text Area | Human-readable scoring explanations |
| `Lead_Agent_Decision_Id__c` | Decision ID | Text(40) | UUID for audit trail |

---

## Salesforce Flow Configuration

### 1. Create an External Service

1. Go to **Setup → External Services**
2. Click **Add an External Service**
3. Name: `LeadAgentService`
4. Service Schema: **From URL**
5. URL: `https://lead-agent-service-production.up.railway.app/openapi.yaml`
6. Click **Save & Next**, then **Done**

### 2. Create the Flow

1. Go to **Setup → Flows**
2. Create a **Record-Triggered Flow**
3. Object: **Lead**
4. Trigger: **A record is created or updated**
5. Entry Conditions: `Status EQUALS 'Open - Not Contacted'` (or your criteria)

### 3. Add External Service Action

1. Add an **Action** element
2. Category: **External Services**
3. Action: `LeadAgentService.enrichLead`
4. Set Input Values from the Lead record:

```
Input Field          → Lead Field
─────────────────────────────────────
Company              → {!$Record.Company}
Email                → {!$Record.Email}
FirstName            → {!$Record.FirstName}
LastName             → {!$Record.LastName}
Title                → {!$Record.Title}
Industry             → {!$Record.Industry}
NumberOfEmployees    → {!$Record.NumberOfEmployees}
AnnualRevenue        → {!$Record.AnnualRevenue}
LeadSource           → {!$Record.LeadSource}
Country              → {!$Record.Country}
State                → {!$Record.State}
```

5. Store output in a variable: `enrichResponse`

### 4. Add Update Records Element

1. Add an **Update Records** element
2. Record: **Lead record that triggered the flow**
3. Set Field Values:

```
Lead Field                    → Flow Variable
─────────────────────────────────────────────────────
Raw_Lead_Score__c             → {!enrichResponse.raw_score}
Enriched_Lead_Score__c        → {!enrichResponse.enriched_score}
Lead_Score_Lift__c            → {!enrichResponse.lift}
Lead_Tier__c                  → {!enrichResponse.enriched_tier}
Fit_Score__c                  → {!enrichResponse.dimensions.fit}
Intent_Score__c               → {!enrichResponse.dimensions.intent}
Timing_Score__c               → {!enrichResponse.dimensions.timing}
Scoring_Version__c            → {!enrichResponse.scoring_version}
Lead_Agent_Decision_Id__c     → {!enrichResponse.scoring_run_id}
```

### 5. Activate the Flow

1. Save the Flow
2. Click **Activate**

---

## API Response → Salesforce Field Mapping Reference

```
API Response Field              → Salesforce Field
────────────────────────────────────────────────────────
raw_score                       → Raw_Lead_Score__c
enriched_score                  → Enriched_Lead_Score__c  
lift                            → Lead_Score_Lift__c
enriched_tier                   → Lead_Tier__c
dimensions.fit                  → Fit_Score__c
dimensions.intent               → Intent_Score__c
dimensions.timing               → Timing_Score__c
scoring_version                 → Scoring_Version__c
scoring_run_id                  → Lead_Agent_Decision_Id__c
enriched.company_employee_band  → Company_Employee_Band__c
enriched.company_revenue_band   → Company_Revenue_Band__c
enriched.contact_role_seniority → Contact_Seniority__c
enriched.contact_role_function  → Contact_Function__c
reasons (joined)                → Scoring_Reasons__c
```

---

## Formula Fields (Optional)

### Score Change Indicator

Create a formula field to show if enrichment helped:

**API Name**: `Score_Change_Indicator__c`  
**Type**: Formula (Text)

```
IF(Lead_Score_Lift__c > 10, "🟢 Strong Lift",
IF(Lead_Score_Lift__c > 0, "🟡 Slight Lift",
IF(Lead_Score_Lift__c < 0, "🔴 Downgrade",
"➖ No Change")))
```

### Lead Quality Summary

**API Name**: `Lead_Quality_Summary__c`  
**Type**: Formula (Text)

```
Lead_Tier__c & " | " &
"Fit: " & TEXT(Fit_Score__c) & " | " &
"Intent: " & TEXT(Intent_Score__c) & " | " &
"Timing: " & TEXT(Timing_Score__c)
```

---

## Testing

1. Create a test Lead with minimal data (just Company and LastName)
2. Verify the Flow runs and populates scoring fields
3. Check that `raw_score` < `enriched_score` when enrichment adds signals
4. Verify `lift` = `enriched_score` - `raw_score`

---

## Troubleshooting

### Flow Errors

- **401 Unauthorized**: Check that `X-API-Key` header is set (if auth is required)
- **400 Bad Request**: Ensure Company field is not blank
- **500 Server Error**: Check Railway logs for details

### Missing Scores

- Verify the External Service schema is up to date
- Re-import the OpenAPI spec if fields are missing

