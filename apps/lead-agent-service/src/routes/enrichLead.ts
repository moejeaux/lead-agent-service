import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { EnrichLeadRequest, EnrichLeadResponse, LeadDecision } from "../types/salesforce";
import { scoreLead } from "../services/scoring";
import * as decisionLog from "../db/decisionLog";

const router = Router();

/**
 * POST /enrich-lead
 * Enriches and scores a Salesforce Lead
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const input = req.body as EnrichLeadRequest;

    // Log incoming request
    console.log(`[enrich-lead] Incoming request:`);
    console.log(`[enrich-lead]   Email: ${input.Email || "N/A"}`);
    console.log(`[enrich-lead]   Company: ${input.Company}`);
    console.log(`[enrich-lead]   Name: ${input.FirstName || ""} ${input.LastName}`);

    // Validate required fields
    if (!input.LastName || !input.Company) {
      console.log(`[enrich-lead] Validation failed: missing LastName or Company`);
      return res.status(400).json({
        error: "Missing required fields: LastName and Company are required"
      });
    }

    // Score the lead
    const scoreResult = scoreLead(input);

    // Generate decision ID
    const decisionId = randomUUID();

    // Build response
    const response: EnrichLeadResponse = {
      ...scoreResult,
      decisionId
    };

    // Log computed results
    console.log(`[enrich-lead] Computed score: ${response.score}`);
    console.log(`[enrich-lead] Tier: ${response.tier}`);
    console.log(`[enrich-lead] Reasons: ${response.reasons.join(", ")}`);
    console.log(`[enrich-lead] Estimated ARR: $${response.estimatedArr}`);
    console.log(`[enrich-lead] Decision ID: ${decisionId}`);

    // Persist decision log
    const decision: LeadDecision = {
      decisionId,
      email: input.Email || null,
      company: input.Company,
      firstName: input.FirstName || null,
      lastName: input.LastName,
      score: response.score,
      tier: response.tier,
      reasons: response.reasons,
      estimatedArr: response.estimatedArr,
      rawRequest: input,
      createdAt: new Date()
    };

    await decisionLog.insert(decision);

    // Return response
    return res.status(200).json(response);

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[enrich-lead] Error processing request:`, message);
    return res.status(500).json({ error: message });
  }
});

export default router;

