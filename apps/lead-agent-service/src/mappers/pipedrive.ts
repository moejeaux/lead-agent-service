import {
  UniversalLeadInput,
  EmployeeBand,
  RevenueBand,
} from "../types/universal";

/**
 * Pipedrive Person/Organization structure
 * Pipedrive uses snake_case field names
 */
export interface PipedrivePayload {
  id?: number;
  person_id?: number;
  org_id?: number | { value: number; name: string };
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string | Array<{ value: string; primary: boolean }>;
  phone?: string | Array<{ value: string; primary: boolean }>;
  title?: string;
  org_name?: string;
  organization?: {
    name?: string;
    address?: string;
    cc_email?: string;
  };
  owner_id?: number;
  value?: number;
  currency?: string;
  // Custom fields often come as hash keys
  [key: string]: unknown;
}

/**
 * Detect if payload is from Pipedrive
 */
export function isPipedrivePayload(payload: Record<string, unknown>): boolean {
  return (
    typeof payload.person_id === "number" ||
    typeof payload.org_id === "number" ||
    (typeof payload.org_id === "object" && payload.org_id !== null) ||
    typeof payload.org_name === "string" ||
    typeof payload.owner_id === "number" ||
    (Array.isArray(payload.email) && payload.email[0]?.value !== undefined) ||
    (Array.isArray(payload.phone) && payload.phone[0]?.value !== undefined)
  );
}

/**
 * Map Pipedrive Person/Deal to Universal schema
 */
export function mapPipedriveToUniversal(payload: Record<string, unknown>): {
  universal: UniversalLeadInput;
  externalId: string | null;
} {
  const pd = payload as PipedrivePayload;
  
  // Extract primary email
  let email: string | undefined;
  if (typeof pd.email === "string") {
    email = pd.email;
  } else if (Array.isArray(pd.email) && pd.email.length > 0) {
    const primary = pd.email.find(e => e.primary) || pd.email[0];
    email = primary?.value;
  }
  
  // Extract primary phone
  let phone: string | undefined;
  if (typeof pd.phone === "string") {
    phone = pd.phone;
  } else if (Array.isArray(pd.phone) && pd.phone.length > 0) {
    const primary = pd.phone.find(p => p.primary) || pd.phone[0];
    phone = primary?.value;
  }
  
  // Extract company name
  let companyName: string | undefined;
  if (pd.org_name) {
    companyName = pd.org_name;
  } else if (typeof pd.org_id === "object" && pd.org_id?.name) {
    companyName = pd.org_id.name;
  } else if (pd.organization?.name) {
    companyName = pd.organization.name;
  }
  
  // Extract domain from email
  let domain = "";
  if (email) {
    domain = email.split("@")[1] || "";
  } else if (companyName) {
    domain = companyName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
  }
  
  // Extract name parts
  let firstName = pd.first_name;
  let lastName = pd.last_name;
  if (!firstName && !lastName && pd.name) {
    const parts = pd.name.split(" ");
    firstName = parts[0];
    lastName = parts.slice(1).join(" ") || undefined;
  }
  
  // Map deal value to deal band
  const dealBand = mapValueToDealBand(pd.value);
  
  // External ID (prefer person_id, fallback to deal id)
  const externalId = pd.person_id?.toString() || pd.id?.toString() || null;
  
  return {
    universal: {
      company_domain: domain,
      company_name: companyName,
      
      contact_email: email,
      contact_first_name: firstName,
      contact_last_name: lastName,
      contact_title_raw: pd.title,
      contact_phone: phone,
      
      estimated_deal_band: dealBand,
    },
    externalId,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapValueToDealBand(value?: number): "Small" | "Mid" | "Enterprise" | undefined {
  if (value === undefined || value === null) return undefined;
  if (value < 10000) return "Small";
  if (value < 100000) return "Mid";
  return "Enterprise";
}

