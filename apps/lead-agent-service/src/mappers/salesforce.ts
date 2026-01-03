import {
  UniversalLeadInput,
  EmployeeBand,
  RevenueBand,
  RoleFunction,
  RoleSeniority,
} from "../types/universal";

/**
 * Salesforce Lead object structure
 */
export interface SalesforceLeadPayload {
  Id?: string;
  FirstName?: string;
  LastName?: string;
  Company?: string;
  Email?: string;
  Phone?: string;
  Title?: string;
  Industry?: string;
  NumberOfEmployees?: number;
  AnnualRevenue?: number;
  LeadSource?: string;
  Street?: string;
  City?: string;
  State?: string;
  PostalCode?: string;
  Country?: string;
  Website?: string;
  Description?: string;
  [key: string]: unknown;
}

/**
 * Detect if payload is from Salesforce
 */
export function isSalesforcePayload(payload: Record<string, unknown>): boolean {
  // Salesforce uses PascalCase field names
  return (
    typeof payload.LastName === "string" ||
    typeof payload.Company === "string" ||
    typeof payload.NumberOfEmployees === "number" ||
    typeof payload.AnnualRevenue === "number" ||
    (typeof payload.Id === "string" && payload.Id.length === 18) // Salesforce IDs are 18 chars
  );
}

/**
 * Map Salesforce Lead to Universal schema
 */
export function mapSalesforceToUniversal(payload: Record<string, unknown>): {
  universal: UniversalLeadInput;
  externalId: string | null;
} {
  const sf = payload as SalesforceLeadPayload;
  
  // Extract domain from email or website
  let domain = "";
  if (sf.Email) {
    domain = sf.Email.split("@")[1] || "";
  } else if (sf.Website) {
    domain = extractDomainFromUrl(sf.Website);
  } else if (sf.Company) {
    // Fallback: create slug from company name
    domain = sf.Company.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
  }
  
  // Map employee count to band
  const employeeBand = mapEmployeeCountToBand(sf.NumberOfEmployees);
  
  // Map revenue to band
  const revenueBand = mapRevenueToBand(sf.AnnualRevenue);
  
  // Build region from address fields
  const region = buildRegion(sf.Country, sf.State);
  
  return {
    universal: {
      company_domain: domain,
      company_name: sf.Company,
      company_industry: sf.Industry,
      company_employee_band: employeeBand,
      company_revenue_band: revenueBand,
      company_region: region,
      
      contact_email: sf.Email,
      contact_first_name: sf.FirstName,
      contact_last_name: sf.LastName,
      contact_title_raw: sf.Title,
      contact_phone: sf.Phone,
      contact_geo: region,
      
      lead_source: sf.LeadSource,
    },
    externalId: sf.Id || null,
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
  if (count === undefined || count === null) return undefined;
  if (count <= 10) return "1-10";
  if (count <= 50) return "11-50";
  if (count <= 200) return "51-200";
  if (count <= 1000) return "201-1000";
  return "1000+";
}

function mapRevenueToBand(revenue?: number): RevenueBand | undefined {
  if (revenue === undefined || revenue === null) return undefined;
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

