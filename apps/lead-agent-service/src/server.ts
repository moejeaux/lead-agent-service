import express from "express";
import cors from "cors";
import { config } from "./config";
import enrichLeadRouter from "./routes/enrichLead";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount routes
app.use("/enrich-lead", enrichLeadRouter);

// Start server
app.listen(config.port, () => {
  console.log(`[server] Lead Agent Service started`);
  console.log(`[server] Port: ${config.port}`);
  console.log(`[server] Environment: ${config.nodeEnv}`);
  console.log(`[server] Database: ${config.databaseUrl ? "configured" : "in-memory"}`);
});

export default app;

