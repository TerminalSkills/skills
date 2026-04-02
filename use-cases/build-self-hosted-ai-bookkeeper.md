---
title: Build a Self-Hosted AI Bookkeeper
slug: build-self-hosted-ai-bookkeeper
description: Deploy TaxHacker on a cheap VPS to automate receipt scanning, expense categorization, and quarterly tax report generation — turning 2 days of bookkeeping into 30 minutes.
skills:
  - taxhacker
category: business
tags:
  - accounting
  - self-hosted
  - tax
  - bookkeeping
  - freelancer
---

## The Problem

Viktor is a freelance developer earning from 5 clients across 3 countries — Germany, Portugal, and the US. Every quarter, he faces the same nightmare:

- **200+ receipts** — paper receipts stuffed in a drawer, photos on his phone, PDF invoices in email
- **Bank statements from 2 banks** — one German (EUR), one US (USD), plus occasional PayPal transfers
- **Invoices in 3 currencies** — EUR, USD, and occasionally GBP
- **2 full days per quarter** — sorting, categorizing, converting currencies, building spreadsheets for his accountant

His current "system" is a Google Sheets file with 47 tabs, a Dropbox folder called "receipts-2024-SORT-ME", and a recurring quarterly anxiety attack. His accountant charges extra for disorganized submissions.

Viktor needs a system that:
1. Accepts any receipt format (photo, PDF, CSV)
2. Automatically extracts vendor, amount, date, and category
3. Handles multi-currency conversion at historical rates
4. Generates clean quarterly reports his accountant can actually use
5. Keeps all data under his control (not in some SaaS that might shut down)

## The Solution

Deploy TaxHacker self-hosted on a €5/month Hetzner VPS. Use AI to automate the entire pipeline from receipt upload to tax-ready CSV export. The key skills are:

- **taxhacker** — Self-hosted AI accounting with receipt OCR, bank import, and categorization

## Step-by-Step Walkthrough

### Step 1: Deploy TaxHacker on Hetzner

Provision a cheap VPS and get TaxHacker running in 10 minutes:

```bash
# SSH into your Hetzner VPS (CX22 — 2 vCPU, 4GB RAM, €4.51/month)
ssh root@your-vps-ip

# Install Docker
curl -fsSL https://get.docker.com | sh

# Create project directory
mkdir -p /opt/taxhacker && cd /opt/taxhacker

# Download docker-compose.yml
curl -O https://raw.githubusercontent.com/vas3k/TaxHacker/main/docker-compose.yml

# Create environment file
cat > .env << 'EOF'
SECRET_KEY=your-random-64-char-key-here
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-your-key-here
ALLOWED_HOSTS=bookkeeper.viktor.dev
EOF

# Start everything
docker compose up -d
```

Add Caddy for HTTPS:

```bash
# Install Caddy
apt install -y caddy

# Configure reverse proxy
cat > /etc/caddy/Caddyfile << 'EOF'
bookkeeper.viktor.dev {
    reverse_proxy localhost:8000
}
EOF

systemctl restart caddy
```

**Cost:** €4.51/month for the VPS + ~$2-5/month for OpenAI API calls (GPT-4o-mini is cheap for OCR tasks).

### Step 2: Set Up Categories for Viktor's Business

Before uploading anything, configure categories that match Viktor's tax situation:

```
# In TaxHacker Settings → Categories

Income:
  - Client: ProjectAlpha (DE)
  - Client: WebAgency (PT)
  - Client: StartupCo (US)
  - Client: FreelancePlatform
  - Client: Other

Expenses:
  - Software & Subscriptions (JetBrains, GitHub, AWS, etc.)
  - Hardware & Equipment (laptop, monitor, peripherals)
  - Office & Coworking (rent, supplies)
  - Travel & Transport (flights, trains, taxis)
  - Professional Services (accountant, lawyer, insurance)
  - Food & Entertainment (client lunches, conferences)
  - Education (courses, books, conferences)
  - Taxes & Fees (VAT, government fees)
```

Add a custom AI prompt for the "Client" field:

```
"Look at the invoice or bank transaction. Determine which client this relates to.
Known clients: ProjectAlpha (German company), WebAgency (Portuguese agency),
StartupCo (US startup), FreelancePlatform (Upwork/Toptal).
If you can't determine the client, use 'Unknown'."
```

### Step 3: Process Receipts — Photo → AI → Database

Now Viktor processes his 200+ receipts in batches:

**Phone receipts (photos):**
1. Open TaxHacker on phone browser → bookkeeper.viktor.dev
2. Tap Upload → select 30 receipt photos from camera roll
3. Hit "Process with AI" → batch processes in background
4. Come back in 5 minutes — all 30 are categorized

**What the AI extracts from each receipt:**

```
Receipt photo: crumpled restaurant bill from Lisbon

AI extracts:
├── Vendor: Restaurante O Velho (Lisboa)
├── Date: 2024-02-14
├── Amount: €47.50
├── Currency: EUR
├── Category: Food & Entertainment
├── Items: 2x Menu do Dia (€12.50), 1x Vinho (€8.50), 1x Sobremesa (€6.50), Gorjeta (€7.50)
├── Tax: €9.74 (IVA 23%)
└── Client: Unknown (personal expense)
```

**Email invoices (PDFs):**
1. Forward invoice PDFs to a dedicated folder
2. Bulk upload PDFs to TaxHacker
3. AI reads the PDF text directly — no OCR needed

### Step 4: Import Bank Statements

Both banks export CSV. Import them monthly:

```
1. Download CSV from Deutsche Bank (EUR account)
2. Download CSV from Chase (USD account)
3. TaxHacker → Import → Upload CSV
4. Map columns: Date, Description, Amount, Currency
5. AI categorizes each transaction automatically
```

The AI handles Viktor's recurring transactions perfectly after the first month:

```
"GITHUB INC" → Software & Subscriptions
"JETBRAINS SRO" → Software & Subscriptions
"DEUTSCHE BAHN" → Travel & Transport
"AWS EMEA" → Software & Subscriptions (expense)
"PROJECTALPHA GMBH" → Income: Client ProjectAlpha
```

### Step 5: Multi-Currency — Automatic Conversion

Viktor's base currency is EUR. TaxHacker auto-converts everything:

```
Invoice from StartupCo: $3,500.00 (2024-03-01)
→ Converted: €3,220.50 @ 0.9200 USD/EUR (ECB rate for 2024-03-01)

Coworking in Lisbon: €250.00 (2024-03-15)
→ Already in EUR, no conversion needed

Conference ticket (London): £450.00 (2024-03-20)
→ Converted: €526.50 @ 1.1700 GBP/EUR (ECB rate for 2024-03-20)
```

Historical exchange rates from ECB ensure tax compliance — you convert at the rate on the transaction date, not today's rate.

### Step 6: Generate Quarterly Tax Report

End of quarter — Viktor's favorite part now:

```
1. Go to Transactions → Filter:
   - Date range: 2024-01-01 to 2024-03-31
   - Group by: Category
2. Review the summary:
   Total Income: €14,850.00
   Total Expenses: €4,230.75
   Net: €10,619.25
3. Click Export → CSV
4. Download includes:
   - All transactions with categories
   - Currency conversions with rates used
   - References to uploaded documents
5. Email CSV + document archive to accountant
```

The accountant receives a clean, categorized spreadsheet instead of a shoe box of receipts. Viktor's accountant fee drops because organized submissions take less time to process.

## The Result

| Before | After |
|--------|-------|
| 2 days per quarter sorting receipts | 30 minutes per quarter (review + export) |
| Lost receipts, missing invoices | Everything digitized on upload |
| Manual currency conversion in spreadsheet | Automatic with historical ECB rates |
| Accountant surcharge for disorganized docs | Clean CSV export, lower accountant fees |
| Google Sheets with 47 tabs | Structured database with search and filter |
| Anxiety about missing deductions | AI catches every line item |

**Annual time saved:** ~6 days (8 days → 2 hours)
**Annual cost:** ~€75 (VPS + API) vs. €0 (manual spreadsheets) — but saves €500+ in accountant surcharges

## Tips and Gotchas

- **Start with bank CSVs** — They're the most structured and give the AI good training data for your spending patterns
- **Review AI categorization weekly** — Spend 5 minutes reviewing new transactions; corrections improve future accuracy
- **Use GPT-4o-mini** — It's accurate enough for receipt OCR and 10x cheaper than GPT-4o
- **Backup monthly** — `docker compose exec db pg_dump taxhacker > backup-$(date +%Y%m).sql`
- **Custom prompts matter** — A well-written category prompt specific to your business improves accuracy from ~80% to ~95%
- **Batch receipts** — Upload once a week instead of one-by-one. Less friction = actually doing it

## What's Next

Once the basic pipeline is running:

- Set up a Telegram bot to forward receipt photos directly to TaxHacker
- Create annual summary reports for tax filing
- Add project-level tracking to see profitability per client
- Connect to accounting software via CSV import (e.g., DATEV for German tax)
