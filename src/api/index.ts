import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/enrich-lead", (req, res) => {
  const lead = req.body;

  // minimal stub – later we'll call real enrichment APIs
  const scored = {
    ...lead,
    enrichment: {
      companySize: "unknown",
      industry: "unknown"
    },
    score: 50,
    tier: "B"
  };

  res.json(scored);
});

app.listen(port, () => {
  console.log(`Lead agent API listening on port ${port}`);
});
