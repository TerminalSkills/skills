---
name: taxhacker
description: >-
  Self-hosted AI accounting tool that analyzes receipts, invoices, and bank transactions
  using LLMs. Use when: automating personal/business bookkeeping, categorizing expenses
  with AI, preparing tax documents, building self-hosted financial tools.
license: MIT
compatibility: "Python 3.10+ or Docker"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags:
    - accounting
    - tax
    - receipts
    - self-hosted
    - bookkeeping
---

# TaxHacker

## Overview

Self-hosted AI accountant for freelancers, indie hackers, and small businesses. Upload receipts, invoices, or bank statements — the LLM extracts, categorizes, and stores everything in a structured database. Supports multi-currency with historical exchange rates and exports accountant-ready CSV reports.

> Source: [vas3k/TaxHacker](https://github.com/vas3k/TaxHacker) (3.9k+ stars)

## Instructions

### 1. Deploy with Docker

```bash
curl -O https://raw.githubusercontent.com/vas3k/TaxHacker/main/docker-compose.yml
docker compose up -d
```

The stack includes TaxHacker app, PostgreSQL, and Redis for background job processing. Access the UI at `http://localhost:8000`.

### 2. Configure AI provider

```bash
# In .env
AI_PROVIDER=openai              # openai, google, mistral
AI_MODEL=gpt-4o
OPENAI_API_KEY=sk-...
SECRET_KEY=your-random-secret-key
```

| Provider | Models | Best For |
|----------|--------|----------|
| OpenAI | GPT-4o, GPT-4o-mini | Best accuracy for complex invoices |
| Google Gemini | Gemini Pro, Flash | Good cost/quality balance |
| Mistral | Mistral Large, Small | EU data residency |

### 3. Upload documents

Drop photos of receipts, invoice PDFs, or bank statement CSVs into the web UI. The AI extraction pipeline:

1. OCR for images, text extraction for PDFs
2. LLM identifies vendor, date, amount, currency, line items, tax
3. Auto-categorizes into configurable categories
4. Stores structured data in PostgreSQL

### 4. Import bank statements

Go to Settings → Import, upload your bank's CSV export, map columns (date, description, amount, currency), and AI auto-categorizes each transaction.

### 5. Generate tax reports

Filter transactions by date range, category, project, or currency. Export to CSV for your accountant.

## Examples

### Example 1: Freelancer quarterly tax prep

A freelancer in Berlin uploads 3 months of receipts and a Sparkasse bank statement CSV:

```
Upload: 47 receipt photos + bank_statement_Q1_2024.csv
→ AI processes all documents in background (~2 minutes)
→ 142 transactions categorized:
  - Software & Subscriptions: €1,847.00 (23 transactions)
  - Travel & Transport: €2,341.50 (18 transactions)
  - Office & Supplies: €456.00 (6 transactions)
  - Professional Services: €3,200.00 (4 transactions)
→ Export → CSV filtered by Q1 2024
→ Send to accountant for Umsatzsteuer filing
```

### Example 2: Multi-currency invoice processing

An indie hacker invoicing clients in USD, EUR, and GBP:

```
Invoice: €1,250.00 from French client (2024-03-15)
→ Converted: $1,362.50 @ 1.0900 EUR/USD (historical rate)

Invoice: £800.00 from UK client (2024-03-20)
→ Converted: $1,016.00 @ 1.2700 GBP/USD (historical rate)

Bank deposit: $2,378.50 matched to both invoices
→ Category: Income — Client Revenue
→ Project: Auto-assigned based on invoice metadata
```

TaxHacker supports 170+ currencies and 14 cryptocurrencies with historical exchange rates.

### Example 3: Custom AI extraction fields

Configure a "Tax Deductible" field with a custom AI prompt:

```
Custom prompt: "Analyze this expense. Is it deductible for a freelance
software developer in Germany? Answer: Yes (100%), Partial (50%), or No.
Consider: office supplies, software, hardware, professional development
are fully deductible. Meals are 70% deductible."

Receipt: Hetzner Cloud — €23.40/month server hosting
→ Tax Deductible: Yes (100%)
→ Category: Software & Subscriptions

Receipt: Restaurant dinner with client — €87.50
→ Tax Deductible: Partial (70%)
→ Category: Food & Entertainment
```

## Guidelines

- **Batch upload** — Drop multiple receipts at once; they queue and process in background
- **Custom prompts per field** dramatically improve accuracy for your specific documents and tax jurisdiction
- **Quarterly exports** — Set a calendar reminder to export each quarter for your accountant
- **Backup regularly** — `docker compose exec db pg_dump taxhacker > backup.sql`
- **Production deployment** — Use Hetzner VPS (CX22, ~$5/month) with Caddy/nginx for HTTPS
- Requires an LLM API key (OpenAI, Google, or Mistral) — no built-in local model yet
- OCR accuracy depends on receipt quality — crumpled or faded receipts may need manual correction
- Not a replacement for double-entry bookkeeping software — designed for freelancer/indie hacker workflows

## References

- [GitHub: vas3k/TaxHacker](https://github.com/vas3k/TaxHacker)
- [TaxHacker Website](https://taxhacker.app)
- [Docker Hub](https://hub.docker.com/r/vas3k/taxhacker)
