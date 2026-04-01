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
  category: finance
  tags:
    - accounting
    - tax
    - receipts
    - invoices
    - self-hosted
    - bookkeeping
    - ai-accounting
  use-cases:
    - "Automate receipt scanning and expense categorization with AI"
    - "Build a self-hosted bookkeeping system that processes invoices automatically"
    - "Prepare tax documents by analyzing a year of bank transactions"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# TaxHacker

Self-hosted AI accountant for freelancers, indie hackers, and small businesses. Upload receipts, invoices, or bank statements — the LLM extracts, categorizes, and stores everything in a structured database.

> Source: [vas3k/TaxHacker](https://github.com/vas3k/TaxHacker) (3.9k+ ⭐)

## What It Does

TaxHacker replaces the spreadsheet-and-folder chaos of freelancer accounting:

1. **Upload** — Drop photos of receipts, invoice PDFs, or bank statement CSVs
2. **Extract** — AI reads the document and pulls out vendor, amount, date, items, tax, currency
3. **Categorize** — Transactions are auto-sorted into categories (office, travel, software, etc.)
4. **Store** — Everything lands in a structured, searchable database
5. **Export** — Generate filtered CSV reports for your accountant or tax filing

## Self-Hosted Setup with Docker

### Quick Start

```bash
# Download docker-compose.yml
curl -O https://raw.githubusercontent.com/vas3k/TaxHacker/main/docker-compose.yml

# Start the stack
docker compose up -d
```

The Docker Compose setup includes:

- **TaxHacker app** — The main web application
- **PostgreSQL** — Database for transactions and metadata
- **Redis** — Queue for background AI processing jobs

Access the UI at `http://localhost:8000` after startup.

### Production Deployment

```bash
# Clone for customization
git clone https://github.com/vas3k/TaxHacker.git
cd TaxHacker

# Copy and edit environment config
cp .env.example .env

# Key settings in .env:
# SECRET_KEY=your-random-secret-key
# OPENAI_API_KEY=sk-...          # Or use Gemini/Mistral
# AI_PROVIDER=openai              # openai, google, mistral
# AI_MODEL=gpt-4o                 # Model to use for extraction
# DATABASE_URL=postgres://...
# ALLOWED_HOSTS=your-domain.com

docker compose -f docker-compose.prod.yml up -d
```

Recommended: Hetzner VPS (CX22, ~$5/month) with Docker. Add Caddy or nginx for HTTPS.

## Receipt OCR Pipeline

The AI extraction pipeline processes documents in stages:

```
Photo/PDF → Upload → OCR/Text Extraction → LLM Analysis → Structured Data → Database
```

### How AI Extraction Works

1. **Document upload** — User drops a receipt photo or invoice PDF
2. **Text extraction** — OCR for images, text extraction for PDFs
3. **LLM analysis** — The AI reads the extracted text and identifies:
   - Vendor/merchant name
   - Transaction date
   - Total amount and currency
   - Individual line items with prices
   - Tax amounts (VAT, sales tax)
   - Category suggestion
4. **Storage** — Structured data saved to PostgreSQL
5. **Review** — User can verify and adjust in the web UI

### Supported Document Types

- Store receipts (any language, any currency)
- Restaurant bills
- Invoice PDFs
- Bank statements
- Letters and notices
- Handwritten receipts

## Bank Statement Import

Import transactions in bulk from your bank:

### CSV Import

```
1. Go to Settings → Import
2. Upload your bank's CSV export
3. Map columns: date, description, amount, currency
4. AI auto-categorizes each transaction
5. Review and confirm
```

### Supported Formats

- **CSV** — Universal, works with any bank
- **OFX/QFX** — Standard financial exchange format
- Manual entry for one-off transactions

## AI Categorization

TaxHacker uses LLMs to categorize transactions automatically:

### Default Categories

Categories are fully customizable. Defaults include:

- Office & Supplies
- Software & Subscriptions
- Travel & Transport
- Food & Entertainment
- Professional Services
- Hardware & Equipment
- Taxes & Fees
- Income (by client/project)

### Custom AI Prompts

You can customize the AI prompt for any field or category:

```
# Example: Custom prompt for a "Project" field
"Look at the invoice. Determine which project this expense belongs to.
Our projects are: ProjectAlpha, ProjectBeta, Internal.
If unclear, use 'Internal'."
```

This lets you adapt TaxHacker to any industry or country's tax requirements.

### Custom Fields

Create unlimited custom fields with their own AI extraction prompts:

- Tax deduction eligibility (Yes/No)
- Cost center codes
- Client attribution
- VAT registration numbers

## Multi-Currency Support

TaxHacker handles international freelancing:

- **Auto-detection** — AI identifies the currency from the document
- **Historical rates** — Converts using the exchange rate on the transaction date
- **170+ currencies** — All world currencies supported
- **14 cryptocurrencies** — BTC, ETH, LTC, DOT, and more
- **Base currency** — Set your accounting currency; everything converts automatically

```
Invoice: €1,250.00 (2024-03-15)
→ Converted: $1,362.50 @ 1.0900 EUR/USD (historical rate)
```

## Tax Report Generation

Generate reports filtered by any combination of:

- Date range (quarterly, annual)
- Category
- Project
- Currency
- Custom fields

### Export Options

```
1. Go to Transactions → Filter by date range and category
2. Click Export → CSV
3. All matching transactions exported with:
   - Transaction details
   - Category assignments
   - Currency conversions
   - Attached document references
```

The CSV export is designed to be accountant-friendly — drop it into any spreadsheet or accounting software.

## LLM Provider Configuration

TaxHacker supports multiple AI providers:

| Provider | Models | Best For |
|----------|--------|----------|
| OpenAI | GPT-4o, GPT-4o-mini | Best accuracy, especially for complex invoices |
| Google Gemini | Gemini Pro, Flash | Good balance of cost and quality |
| Mistral | Mistral Large, Small | EU data residency, competitive pricing |

Local LLM support (Ollama, llama.cpp) is planned for future releases.

### Switching Providers

```bash
# In .env
AI_PROVIDER=google
AI_MODEL=gemini-2.0-flash
GOOGLE_API_KEY=your-key
```

## Tips

- **Batch upload** — Drop multiple receipts at once; they queue and process in background
- **Train the AI** — Custom prompts per field dramatically improve accuracy for your specific documents
- **Quarterly exports** — Set a calendar reminder to export each quarter for your accountant
- **Backup the database** — `docker compose exec db pg_dump taxhacker > backup.sql`
- **Multi-project** — Use projects to separate business lines or clients

## Limitations

- Requires an LLM API key (OpenAI, Google, or Mistral) — no built-in local model yet
- OCR accuracy depends on receipt quality — crumpled or faded receipts may need manual correction
- Not a replacement for professional accounting software (no double-entry bookkeeping)
- Early stage project — expect breaking changes between versions

## References

- [GitHub: vas3k/TaxHacker](https://github.com/vas3k/TaxHacker)
- [TaxHacker Website](https://taxhacker.app)
- [Demo Video](https://taxhacker.app/landing/video.mp4)
- [Docker Hub](https://hub.docker.com/r/vas3k/taxhacker)
