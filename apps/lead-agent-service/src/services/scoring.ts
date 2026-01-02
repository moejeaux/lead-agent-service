import { EnrichLeadRequest, EnrichLeadResponse } from "../types/salesforce";

/**
 * Pure function that scores a lead based on deterministic heuristic rules
 * Each rule pushes a human-readable reason with the actual value and points awarded
 */
export function scoreLead(input: EnrichLeadRequest): Omit<EnrichLeadResponse, "decisionId"> {
  let score = 0;
  const reasons: string[] = [];

  // --- Email domain scoring ---
  const freeDomains = [
    "gmail.com", "yahoo.com", "outlook.com", "hotmail.com",
    "icloud.com", "aol.com", "proton.me", "protonmail.com"
  ];

  if (input.Email) {
    const emailDomain = input.Email.split("@")[1]?.toLowerCase() || "";
    if (emailDomain && !freeDomains.includes(emailDomain)) {
      score += 15;
      reasons.push(`Corporate domain: ${emailDomain} (+15)`);
    } else if (emailDomain) {
      reasons.push(`Free email provider: ${emailDomain} (+0)`);
    }
  }

  // --- Company size scoring ---
  if (input.NumberOfEmployees !== undefined && input.NumberOfEmployees !== null) {
    if (input.NumberOfEmployees >= 1000) {
      score += 25;
      reasons.push(`Company size: ${input.NumberOfEmployees.toLocaleString()} employees (+25)`);
    } else if (input.NumberOfEmployees >= 200) {
      score += 20;
      reasons.push(`Company size: ${input.NumberOfEmployees.toLocaleString()} employees (+20)`);
    } else if (input.NumberOfEmployees >= 50) {
      score += 10;
      reasons.push(`Company size: ${input.NumberOfEmployees.toLocaleString()} employees (+10)`);
    } else {
      score += 5;
      reasons.push(`Company size: ${input.NumberOfEmployees.toLocaleString()} employees (+5)`);
    }
  }

  // --- Annual revenue scoring ---
  if (input.AnnualRevenue !== undefined && input.AnnualRevenue !== null) {
    const revenueFormatted = `$${(input.AnnualRevenue / 1_000_000).toFixed(1)}M`;
    if (input.AnnualRevenue >= 100_000_000) {
      score += 25;
      reasons.push(`Annual revenue: ${revenueFormatted} (+25)`);
    } else if (input.AnnualRevenue >= 10_000_000) {
      score += 15;
      reasons.push(`Annual revenue: ${revenueFormatted} (+15)`);
    } else if (input.AnnualRevenue >= 1_000_000) {
      score += 10;
      reasons.push(`Annual revenue: ${revenueFormatted} (+10)`);
    }
  }

  // --- Job title seniority ---
  if (input.Title) {
    const titleLower = input.Title.toLowerCase();
    const cSuiteKeywords = ["ceo", "cto", "cfo", "coo", "cmo", "chief", "founder", "owner", "president"];
    const vpKeywords = ["vp", "vice president", "head of", "director"];
    const managerKeywords = ["manager", "lead", "senior"];

    if (cSuiteKeywords.some(k => titleLower.includes(k))) {
      score += 30;
      reasons.push(`Title: ${input.Title} (+30)`);
    } else if (vpKeywords.some(k => titleLower.includes(k))) {
      score += 20;
      reasons.push(`Title: ${input.Title} (+20)`);
    } else if (managerKeywords.some(k => titleLower.includes(k))) {
      score += 10;
      reasons.push(`Title: ${input.Title} (+10)`);
    }
  }

  // --- Industry scoring ---
  const highValueIndustries = ["technology", "software", "finance", "healthcare", "saas"];
  const mediumValueIndustries = ["manufacturing", "retail", "consulting", "professional services"];

  if (input.Industry) {
    const industryLower = input.Industry.toLowerCase();
    if (highValueIndustries.some(i => industryLower.includes(i))) {
      score += 15;
      reasons.push(`Industry: ${input.Industry} (+15)`);
    } else if (mediumValueIndustries.some(i => industryLower.includes(i))) {
      score += 8;
      reasons.push(`Industry: ${input.Industry} (+8)`);
    }
  }

  // --- Lead source quality ---
  if (input.LeadSource) {
    const sourceLower = input.LeadSource.toLowerCase();
    const highQualitySources = ["referral", "partner", "event", "conference", "demo request"];
    const mediumQualitySources = ["website", "webinar", "content download"];

    if (highQualitySources.some(s => sourceLower.includes(s))) {
      score += 15;
      reasons.push(`Lead source: ${input.LeadSource} (+15)`);
    } else if (mediumQualitySources.some(s => sourceLower.includes(s))) {
      score += 8;
      reasons.push(`Lead source: ${input.LeadSource} (+8)`);
    }
  }

  // --- Company name present ---
  if (input.Company && input.Company.trim().length > 2) {
    score += 5;
    reasons.push(`Company provided: ${input.Company} (+5)`);
  }

  // --- Tier calculation: high >= 70, medium >= 40, else low ---
  let tier: "low" | "medium" | "high" = "low";
  if (score >= 70) {
    tier = "high";
  } else if (score >= 40) {
    tier = "medium";
  }

  // --- Estimated ARR calculation ---
  let estimatedArr = 0;
  if (input.NumberOfEmployees !== undefined && input.NumberOfEmployees !== null) {
    if (input.NumberOfEmployees >= 1000) {
      estimatedArr = 50000;
    } else if (input.NumberOfEmployees >= 200) {
      estimatedArr = 25000;
    } else if (input.NumberOfEmployees >= 50) {
      estimatedArr = 12000;
    } else {
      estimatedArr = 5000;
    }
  } else {
    // Default estimate based on score
    estimatedArr = score >= 70 ? 20000 : score >= 40 ? 10000 : 5000;
  }

  // Adjust by revenue if available
  if (input.AnnualRevenue && input.AnnualRevenue >= 10_000_000) {
    estimatedArr = Math.round(estimatedArr * 1.5);
  }

  return {
    score,
    tier,
    reasons,
    estimatedArr
  };
}
