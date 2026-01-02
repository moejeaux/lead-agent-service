import { LeadDecision } from "../types/salesforce";
import { db } from "./client";

const TABLE_NAME = "lead_decisions";

/**
 * Insert a lead decision into the log
 */
export async function insert(decision: LeadDecision): Promise<LeadDecision> {
  console.log(`[decisionLog] Inserting decision: ${decision.decisionId}`);
  console.log(`[decisionLog]   Company: ${decision.company}`);
  console.log(`[decisionLog]   Email: ${decision.email || "N/A"}`);
  console.log(`[decisionLog]   Score: ${decision.score}, Tier: ${decision.tier}`);
  
  return db.insert(TABLE_NAME, decision);
}

/**
 * List recent decisions
 */
export async function listRecent(limit: number = 10): Promise<LeadDecision[]> {
  console.log(`[decisionLog] Fetching last ${limit} decisions`);
  return db.queryRecent<LeadDecision>(TABLE_NAME, limit);
}

/**
 * Get a decision by ID
 */
export async function getById(decisionId: string): Promise<LeadDecision | null> {
  return db.getById<LeadDecision>(TABLE_NAME, decisionId);
}

