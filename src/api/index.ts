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
  const {
    firstName = "",
    lastName = "",
    email = "",
    company = "",
    website = "",
    jobTitle = "",
    source = ""
  } = req.body;

  // minimal stub – later we'll call real enrichment APIs
  const enriched = {
    email,
    firstName,
    lastName,
    company,
    website,
    jobTitle,
    source,
    enrichment: {
      companySize: "",
      industry: "",
      country: ""
    },
    score: 50,
    tier: "B"
  };

  res.json(enriched);
});

app.listen(port, () => {
  console.log(`Lead agent API listening on port ${port}`);
});
