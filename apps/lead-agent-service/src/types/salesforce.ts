/**
 * Salesforce Lead request payload
 * Matches standard Salesforce Lead object fields
 */
export interface EnrichLeadRequest {
  FirstName?: string;
  LastName: string;
  Company: string;
  Email?: string;
  Phone?: string;
  Title?: string;
  Industry?: string;
  NumberOfEmployees?: number;
  AnnualRevenue?: number;
  LeadSource?: string;
}

/**
 * Response returned to Salesforce External Service / Flow
 */
export interface EnrichLeadResponse {
  score: number;
  tier: "low" | "medium" | "high";
  reasons: string[];
  estimatedArr: number;
  decisionId: string;
}

/**
 * Decision log entry stored in database
 */
export interface LeadDecision {
  decisionId: string;
  email: string | null;
  company: string;
  firstName: string | null;
  lastName: string;
  score: number;
  tier: "low" | "medium" | "high";
  reasons: string[];
  estimatedArr: number;
  rawRequest: EnrichLeadRequest;
  createdAt: Date;
}

