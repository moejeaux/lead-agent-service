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
