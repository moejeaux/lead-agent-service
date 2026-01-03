import {
  UniversalLeadInput,
  EmployeeBand,
  RevenueBand,
} from "../types/universal";

/**
 * HubSpot Contact/Company properties structure
 * HubSpot uses snake_case or lowercase field names
 */
export interface HubSpotPayload {
  vid?: number;
  id?: string;
  properties?: {
    firstname?: { value: string };
    lastname?: { value: string };
    email?: { value: string };
    phone?: { value: string };
    jobtitle?: { value: string };
    company?: { value: string };
    industry?: { value: string };
    numberofemployees?: { value: string };
    annualrevenue?: { value: string };
    city?: { value: string };
    state?: { value: string };
    country?: { value: string };
    website?: { value: string };
    hs_lead_status?: { value: string };
    lifecyclestage?: { value: string };
    [key: string]: { value: string } | undefined;
  };
  // Flat format (from webhooks or API v3)
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
  jobtitle?: string;
  company?: string;
  industry?: string;
  numberofemployees?: string;
  annualrevenue?: string;
  city?: string;
  state?: string;
  country?: string;
  website?: string;
  hs_lead_status?: string;
  lifecyclestage?: string;
  [key: string]: unknown;
}

/**
 * Detect if payload is from HubSpot
 */
export function isHubSpotPayload(payload: Record<string, unknown>): boolean {
  // HubSpot uses lowercase field names and often has 'vid' or 'properties' object
  return (
    typeof payload.vid === "number" ||
    typeof payload.properties === "object" ||
    typeof payload.firstname === "string" ||
    typeof payload.lastname === "string" ||
    typeof payload.jobtitle === "string" ||
    typeof payload.lifecyclestage === "string" ||
    typeof payload.hs_lead_status === "string"
  );
}

/**
 * Map HubSpot Contact to Universal schema
 */
export function mapHubSpotToUniversal(payload: Record<string, unknown>): {
  universal: UniversalLeadInput;
  externalId: string | null;
} {
  const hs = payload as HubSpotPayload;
  
  // Extract values (handle both nested properties and flat format)
  const getValue = (key: string): string | undefined => {
    if (hs.properties && hs.properties[key]) {
      return hs.properties[key]?.value;
    }
    const val = (hs as Record<string, unknown>)[key];
    return typeof val === "string" ? val : undefined;
  };
  
  const email = getValue("email");
  const website = getValue("website");
  const company = getValue("company");
  
  // Extract domain
  let domain = "";
  if (email) {
    domain = email.split("@")[1] || "";
  } else if (website) {
    domain = extractDomainFromUrl(website);
  } else if (company) {
    domain = company.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
  }
  
  // Parse employee count
  const employeeStr = getValue("numberofemployees");
  const employeeCount = employeeStr ? parseInt(employeeStr, 10) : undefined;
  const employeeBand = mapEmployeeCountToBand(employeeCount);
  
  // Parse revenue
  const revenueStr = getValue("annualrevenue");
  const revenue = revenueStr ? parseFloat(revenueStr) : undefined;
  const revenueBand = mapRevenueToBand(revenue);
  
  // Build region
  const country = getValue("country");
  const state = getValue("state");
  const region = buildRegion(country, state);
  
  // External ID
  const externalId = hs.vid?.toString() || hs.id || null;
  
  return {
    universal: {
      company_domain: domain,
      company_name: company,
      company_industry: getValue("industry"),
      company_employee_band: employeeBand,
      company_revenue_band: revenueBand,
      company_region: region,
      
      contact_email: email,
      contact_first_name: getValue("firstname"),
      contact_last_name: getValue("lastname"),
      contact_title_raw: getValue("jobtitle"),
      contact_phone: getValue("phone"),
      contact_geo: region,
      
      lead_source: getValue("lifecyclestage") || getValue("hs_lead_status"),
    },
    externalId,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractDomainFromUrl(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
  }
}

function mapEmployeeCountToBand(count?: number): EmployeeBand | undefined {
  if (count === undefined || count === null || isNaN(count)) return undefined;
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  if (count <= 200) return "51-200";
  if (count <= 1000) return "201-1000";
  return "1000+";
}

function mapRevenueToBand(revenue?: number): RevenueBand | undefined {
  if (revenue === undefined || revenue === null || isNaN(revenue)) return undefined;
  if (revenue < 1_000_000) return "<1M";
  if (revenue < 10_000_000) return "1-10M";
  if (revenue < 50_000_000) return "10-50M";
  if (revenue < 250_000_000) return "50-250M";
  return "250M+";
}

function buildRegion(country?: string, state?: string): string | undefined {
  if (country && state) return `${state}, ${country}`;
  return country || state || undefined;
}

