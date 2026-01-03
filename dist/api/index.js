"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.post("/enrich-lead", (req, res) => {
    const { firstName = "", lastName = "", email = "", company = "", website = "", jobTitle = "", source = "" } = req.body || {};
    // --- Heuristic scoring ---
    let score = 0;
    // Email domain: corporate vs free
    const freeDomains = [
        "gmail.com",
        "yahoo.com",
        "outlook.com",
        "hotmail.com",
        "icloud.com",
        "aol.com",
        "proton.me",
        "protonmail.com"
    ];
    const emailDomain = email.split("@")[1]?.toLowerCase() || "";
    if (emailDomain && !freeDomains.includes(emailDomain)) {
        score += 20;
    }
    // Job title seniority
    const title = jobTitle.toLowerCase();
    const seniorKeywords = ["founder", "owner", "chief", "cxo", "vp", "vice president", "head", "director"];
    const managerKeywords = ["manager"];
    if (seniorKeywords.some(k => title.includes(k))) {
        score += 30;
    }
    else if (managerKeywords.some(k => title.includes(k))) {
        score += 15;
    }
    // Company present
    if (company && company.trim().length > 3) {
        score += 10;
    }
    // Lead source quality
    const goodSources = ["website", "web", "referral", "event", "conference"];
    const src = source.toLowerCase();
    if (goodSources.some(s => src.includes(s))) {
        score += 15;
    }
    // --- Tiering ---
    let tier = "C";
    if (score >= 70)
        tier = "A";
    else if (score >= 40)
        tier = "B";
    // --- Minimal enrichment stub (can grow later) ---
    const enrichment = {
        companySize: "",
        industry: "",
        country: ""
    };
    const responseBody = {
        email,
        firstName,
        lastName,
        company,
        website,
        jobTitle,
        source,
        enrichment,
        score,
        tier
    };
    res.json(responseBody);
});
app.listen(port, () => {
    console.log(`Lead agent API listening on port ${port}`);
});
