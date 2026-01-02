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
    // Parse request body as EnrichLeadRequest
    const input = req.body as EnrichLeadRequest;

    // Validate required fields
    if (!input.LastName || !input.Company) {
      console.log(`[enrich-lead] Validation failed: missing LastName or Company`);
      return res.status(400).json({
        error: "Missing required fields: LastName and Company are required"
      });
    }

    // Call scoreLead to get scoring result
    const scoreResult = scoreLead(input);

    // Generate decision ID (UUID)
    const decisionId = randomUUID();

    // Build response
    const response: EnrichLeadResponse = {
      ...scoreResult,
      decisionId
    };

    // Log { email, company, score, tier, decisionId } to console
    console.log(`[enrich-lead] Decision:`, {
      email: input.Email || null,
      company: input.Company,
      score: response.score,
      tier: response.tier,
      decisionId
    });

    // Persist decision via decisionLog.insert
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

    // Return JSON EnrichLeadResponse with decisionId
    return res.status(200).json(response);

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[enrich-lead] Error:`, message);
    return res.status(500).json({ error: message });
  }
});

export default router;
