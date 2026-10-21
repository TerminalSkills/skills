---
name: taxhacker
description: >-
  Self-hosted AI accounting tool that analyzes receipts, invoices, and bank transactions
  using LLMs. Use when: automating personal/business bookkeeping, categorizing expenses
  with AI, preparing tax documents, building self-hosted financial tools.
license: Apache-2.0
compatibility: "Docker with Compose (or Node.js 26+ and PostgreSQL 17 for local development)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/vas3k/TaxHacker
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

> Source: [vas3k/TaxHacker](https://github.com/vas3k/TaxHacker) 

## Instructions

### 1. Deploy with Docker

```bash
mkdir taxhacker && cd taxhacker
curl -O https://raw.githubusercontent.com/vas3k/TaxHacker/v0.8.5/docker-compose.yml
sed -i 's|taxhacker:latest|taxhacker:0.8.5|; s|"7331:7331"|"127.0.0.1:7331:7331"|' docker-compose.yml
docker compose up -d
```

The file is fetched from the `v0.8.5` release tag (not `main`) and edited before it runs: the image is pinned to `0.8.5`, and the port is bound to localhost only because self-hosted mode has no login, so the stock `7331:7331` mapping would let anyone on your network open your books. Read the file before starting it.

The stack runs three containers from the published image `ghcr.io/vas3k/taxhacker`: the app, a `cron` container (e-mail sync every 5 minutes), and PostgreSQL 17. There is no Redis. Migrations run on startup. Open `http://localhost:7331` (self-hosted mode logs you in automatically). Uploads go to `./data` and the database to `./pgdata`.

Image tags have no `v` prefix (`0.8.5`), unlike the git tags (`v0.8.5`). To upgrade, check the releases page, change both the download tag and the image tag, and run `docker compose pull && docker compose up -d`.

### 2. Configure the AI provider

Open Settings in the web UI and enter a key and model, or provide them as environment variables on the `app` service:

```yaml
services:
  app:
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}          # OPENAI_MODEL_NAME defaults to gpt-4o-mini
      GOOGLE_API_KEY: ${GOOGLE_API_KEY}          # GOOGLE_MODEL_NAME, e.g. gemini-2.5-flash
      MISTRAL_API_KEY: ${MISTRAL_API_KEY}        # MISTRAL_MODEL_NAME, e.g. mistral-medium-latest
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}  # optional in Docker (auto-generated in ./data); create with `openssl rand -hex 32`
```

| Provider | Notes |
|----------|-------|
| OpenAI | Default model in `.env.example` is `gpt-4o-mini` |
| Google Gemini | Example model `gemini-2.5-flash`, good cost/quality balance |
| Mistral | Example model `mistral-medium-latest`, EU provider |
| Local LLM | Any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, LocalAI) in self-hosted mode; OCR quality depends on the model |

Other variables: `PORT` (default 7331), `BASE_URL`, `DISABLE_SIGNUP`, `SELF_HOSTED_MODE`, `UPLOAD_PATH`, `DATABASE_URL`.

### 3. Upload documents

Drop photos of receipts, invoice PDFs, or bank statement CSVs into the web UI. The AI extraction pipeline:

1. Files land in "unsorted" until you run the AI analysis (or process them manually)
2. The LLM reads the image or PDF and extracts vendor, date, amount, currency, items, tax
3. Auto-categorizes into your categories and projects, and can split invoice items into separate transactions
4. Stores structured data in PostgreSQL

### 4. Import bank statements

Use the sidebar entry "Import from CSV" (`/import/csv`), upload your bank's CSV export and map its columns to TaxHacker fields (date, name, amount, currency). Imported rows can then be categorized by hand or with the AI.

### 5. Generate tax reports

Filter transactions by date range, category, project, amount or custom fields. Export the filtered set to CSV with the attached documents, or download a full data archive.

## Examples

### Example 1: Freelancer quarterly tax prep

A freelancer in Berlin uploads 3 months of receipts and a Sparkasse bank statement CSV:

```
Upload: 47 receipt photos + bank_statement_Q1_2024.csv
→ AI processes the documents you queue (a couple of minutes)
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
software developer in Germany? Answer: Yes (100%), Partial (with the percentage), or No.
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
- **Backup regularly** — `docker compose exec postgres pg_dump -U postgres taxhacker > backup.sql`, plus a copy of `./data`
- **Production deployment** — Put it behind a reverse proxy (Caddy, nginx) with HTTPS. Self-hosted mode auto-logs in, so never expose port 7331 directly without your own authentication; see `docs/self-hosted-public-access.md` in the repo
- Needs an LLM: an OpenAI, Google or Mistral key, or a local OpenAI-compatible endpoint; nothing is bundled
- The project calls itself early development ("use at your own risk"); keep backups and review extracted numbers
- OCR accuracy depends on receipt quality — crumpled or faded receipts may need manual correction
- Not a replacement for double-entry bookkeeping software — designed for freelancer/indie hacker workflows

## References

- [GitHub: vas3k/TaxHacker](https://github.com/vas3k/TaxHacker)
- [TaxHacker Website](https://taxhacker.app)
- [Container image](https://github.com/vas3k/TaxHacker/pkgs/container/taxhacker)
