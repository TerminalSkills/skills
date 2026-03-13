---
name: clay
description: >-
  You are an expert in Clay, the data enrichment and outbound sales platform
  that pulls from 75+ data providers to build rich prospect profiles. You help
  teams automate lead discovery, enrich contacts with firmographic and
  technographic data, score leads against ICP criteria, and trigger
  personalized outreach sequences — replacing manual research with automated,
  data-driven prospecting.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Marketing & Growth
  tags:
    - lead-enrichment
    - data-enrichment
    - outbound-sales
    - prospecting
    - b2b
    - crm
---

# Clay — AI-Powered Lead Enrichment and Outbound Automation

You are an expert in Clay, the data enrichment and outbound sales platform that pulls from 75+ data providers to build rich prospect profiles. You help teams automate lead discovery, enrich contacts with firmographic and technographic data, score leads against ICP criteria, and trigger personalized outreach sequences — replacing manual research with automated, data-driven prospecting.

## Core Capabilities

### Table Setup and Enrichment

```markdown
## Clay Table Structure

A Clay table is a spreadsheet with superpowers. Each row is a lead.
Columns can be:
- **Imported** — CSV upload, CRM sync, or webhook
- **Enriched** — Auto-populated from 75+ data sources
- **AI-generated** — GPT/Claude processes enriched data into insights

## Example: ICP-Matched Lead Table

| Column          | Source          | Description                              |
|-----------------|-----------------|------------------------------------------|
| Company Name    | Import          | From LinkedIn export or CRM              |
| Domain          | Enrichment      | Company website from Clearbit            |
| Employee Count  | Enrichment      | From LinkedIn/Crunchbase                 |
| Funding Stage   | Enrichment      | Series A/B/C from Crunchbase             |
| Tech Stack      | Enrichment      | BuiltWith/Wappalyzer detection           |
| API Endpoints   | Enrichment      | Custom: count public API docs pages      |
| Decision Maker  | Enrichment      | VP Eng/CTO from LinkedIn + Apollo        |
| Email           | Enrichment      | Verified email from Hunter/Apollo        |
| Recent News     | Enrichment      | Latest press from Google News            |
| LinkedIn Post   | Enrichment      | Latest post from contact's LinkedIn      |
| ICP Score       | AI Formula      | 0-100 score based on all enrichment data |
| Personalized Opener | AI Formula | GPT-generated first line for cold email  |
```

### API Integration

```typescript
// Fetch enriched leads from Clay table
const response = await fetch(`https://api.clay.com/v3/tables/${tableId}/rows`, {
  headers: {
    "Authorization": `Bearer ${process.env.CLAY_API_KEY}`,
    "Content-Type": "application/json",
  },
});

const { data: rows } = await response.json();

// Filter to qualified leads
const qualified = rows.filter(row => (
  row.icpScore >= 70 &&
  row.emailVerified === true &&
  row.employeeCount >= 20
));

// Add a new lead via API (triggers enrichment automatically)
await fetch(`https://api.clay.com/v3/tables/${tableId}/rows`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.CLAY_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    rows: [
      { "Company": "Acme Corp", "Domain": "acme.com" },
      { "Company": "Beta Inc", "Domain": "beta.io" },
    ],
  }),
});
// Clay automatically enriches all configured columns
```

### Enrichment Providers

```markdown
## Available Data Sources (75+)

**Company Data:**
- Clearbit, Crunchbase, LinkedIn (company), BuiltWith, Wappalyzer
- Google Maps, Glassdoor, G2, TrustRadius

**Contact Data:**
- Apollo, Hunter, Lusha, RocketReach, Snov.io
- LinkedIn (person), Twitter/X profile

**Technographic:**
- BuiltWith, Wappalyzer, SimilarTech
- Custom HTTP header checks, robots.txt analysis

**Intent & News:**
- Google News, Crunchbase funding alerts
- Job posting analysis (hiring signals)
- Website change detection

**AI Enrichment:**
- GPT/Claude for custom analysis
- "Summarize this company's value proposition in one sentence"
- "Score this lead 0-100 against our ICP: B2B SaaS, 20-100 employees, uses Node.js"
```

### Webhook Triggers

```typescript
// Clay fires webhooks when rows change or meet conditions
// Example: trigger outbound sequence when ICP score reaches 80+

// Webhook payload from Clay
interface ClayWebhook {
  table_id: string;
  row_id: string;
  trigger: string;                     // "row_updated" | "filter_matched"
  data: {
    company: string;
    contactEmail: string;
    contactName: string;
    icpScore: number;
    personalizedOpener: string;
  };
}

// Handle webhook — start email sequence
app.post("/api/clay-webhook", async (req, res) => {
  const payload: ClayWebhook = req.body;

  if (payload.data.icpScore >= 80) {
    await startEmailSequence({
      to: payload.data.contactEmail,
      name: payload.data.contactName,
      company: payload.data.company,
      opener: payload.data.personalizedOpener,
    });
  }

  res.json({ ok: true });
});
```

## Installation

```markdown
## Setup
1. Create account at https://clay.com
2. Create a table with your ICP columns
3. Configure enrichment providers (drag-and-drop)
4. Set up AI formulas for scoring and personalization
5. API key: Settings → API → Generate key

## Pricing
- Free: 100 enrichments/month
- Starter: $149/month (2,000 enrichments)
- Explorer: $349/month (10,000 enrichments)
- Pro: $800/month (50,000 enrichments)
```

## Best Practices

1. **Start with domain** — Import company domains; Clay enriches everything else automatically
2. **ICP scoring formula** — Use AI formulas to score leads 0-100; automate which leads get outreach
3. **Waterfall enrichment** — Clay tries multiple providers for each data point; if Apollo has no email, it tries Hunter, then Lusha
4. **Webhook to CRM** — Trigger webhooks when leads qualify; auto-create deals in HubSpot/Salesforce
5. **Email verification** — Always verify emails before sending; Clay has built-in verification from multiple providers
6. **Personalization at scale** — Use AI columns to generate openers based on LinkedIn posts, tech stack, and recent news
7. **Job posting signals** — Enrich with job postings; companies hiring engineers are growing and more likely to buy dev tools
8. **Refresh cadence** — Re-enrich leads monthly; tech stacks, headcount, and contacts change frequently
