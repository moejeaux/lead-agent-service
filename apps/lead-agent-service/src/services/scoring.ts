import { EnrichLeadRequest, EnrichLeadResponse } from "../types/salesforce";

/**
 * Pure function that scores a lead based on heuristic rules
 * Returns score, tier, reasons, and estimated ARR
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
      reasons.push("Corporate email domain");
    } else if (emailDomain) {
      reasons.push("Free email provider");
    }
  }

  // --- Company size scoring ---
  if (input.NumberOfEmployees) {
    if (input.NumberOfEmployees >= 1000) {
      score += 25;
      reasons.push("Enterprise company (1000+ employees)");
    } else if (input.NumberOfEmployees >= 200) {
      score += 20;
      reasons.push("Mid-market company (200-999 employees)");
    } else if (input.NumberOfEmployees >= 50) {
      score += 10;
      reasons.push("Growing company (50-199 employees)");
    } else {
      score += 5;
      reasons.push("Small company (<50 employees)");
    }
  }

  // --- Annual revenue scoring ---
  if (input.AnnualRevenue) {
    if (input.AnnualRevenue >= 100_000_000) {
      score += 25;
      reasons.push("High revenue ($100M+)");
    } else if (input.AnnualRevenue >= 10_000_000) {
      score += 15;
      reasons.push("Strong revenue ($10M-$100M)");
    } else if (input.AnnualRevenue >= 1_000_000) {
      score += 10;
      reasons.push("Established revenue ($1M-$10M)");
    }
  }

  // --- Job title seniority ---
  if (input.Title) {
    const title = input.Title.toLowerCase();
    const cSuiteKeywords = ["ceo", "cto", "cfo", "coo", "cmo", "chief", "founder", "owner", "president"];
    const vpKeywords = ["vp", "vice president", "head of", "director"];
    const managerKeywords = ["manager", "lead", "senior"];

    if (cSuiteKeywords.some(k => title.includes(k))) {
      score += 30;
      reasons.push("C-suite or founder");
    } else if (vpKeywords.some(k => title.includes(k))) {
      score += 20;
      reasons.push("VP or director level");
    } else if (managerKeywords.some(k => title.includes(k))) {
      score += 10;
      reasons.push("Manager level");
    }
  }

  // --- Industry scoring ---
  const highValueIndustries = ["technology", "software", "finance", "healthcare", "saas"];
  const mediumValueIndustries = ["manufacturing", "retail", "consulting", "professional services"];

  if (input.Industry) {
    const industry = input.Industry.toLowerCase();
    if (highValueIndustries.some(i => industry.includes(i))) {
      score += 15;
      reasons.push(`High-value industry: ${input.Industry}`);
    } else if (mediumValueIndustries.some(i => industry.includes(i))) {
      score += 8;
      reasons.push(`Target industry: ${input.Industry}`);
    }
  }

  // --- Lead source quality ---
  if (input.LeadSource) {
    const source = input.LeadSource.toLowerCase();
    const highQualitySources = ["referral", "partner", "event", "conference", "demo request"];
    const mediumQualitySources = ["website", "webinar", "content download"];

    if (highQualitySources.some(s => source.includes(s))) {
      score += 15;
      reasons.push(`High-intent source: ${input.LeadSource}`);
    } else if (mediumQualitySources.some(s => source.includes(s))) {
      score += 8;
      reasons.push(`Engaged source: ${input.LeadSource}`);
    }
  }

  // --- Company name present ---
  if (input.Company && input.Company.trim().length > 2) {
    score += 5;
  }

  // --- Tier calculation ---
  let tier: "low" | "medium" | "high" = "low";
  if (score >= 70) {
    tier = "high";
  } else if (score >= 40) {
    tier = "medium";
  }

  // --- Estimated ARR calculation ---
  // Simple heuristic: base amount adjusted by company size and score
  let estimatedArr = 0;
  if (input.NumberOfEmployees) {
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

