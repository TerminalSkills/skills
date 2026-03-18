---
title: Automate Small Business Accounting
slug: automate-small-business-accounting
description: Connect Stripe and bank exports to automatically categorize transactions, sync them to Xero or QuickBooks, and generate a monthly P&L report — with zero manual data entry.
skills:
  - bookkeeping-automation
  - xero-accounting
  - quickbooks-online
  - invoice-generator
category: finance
tags:
  - accounting
  - bookkeeping
  - automation
  - xero
  - quickbooks
  - stripe
  - finance
  - small-business
  - saas
---

## The Problem

Marco runs a bootstrapped SaaS with 80 paying customers and a small team of two contractors. Revenue is $18K/month, but his books are a disaster. He exports his Stripe payouts and bank statements to a spreadsheet, manually categorizes each line item, and pastes the totals into a Google Sheet P&L template his accountant sent him last year.

The process takes 3–4 hours every month. He always does it the week before his quarterly tax call, which means he's making business decisions — payroll, new hires, ad spend — with financial data that's a month stale. Last quarter he almost missed an accountant deadline because he couldn't figure out which AWS charges went to which project.

Marco needs his books closed by the 5th of each month, automatically, so he can spend those 3 hours on the product instead.

## The Solution

Build a monthly accounting pipeline that runs automatically:

1. **Parse** Stripe payouts + bank CSV exports using `bookkeeping-automation`
2. **Categorize** transactions with keyword rules (free) + AI for edge cases (cheap)
3. **Sync** to Xero or QuickBooks via API using `xero-accounting` or `quickbooks-online`
4. **Generate** a formatted P&L report and email it to Marco's accountant

The full pipeline runs on a cron job on the 2nd of each month. Marco reviews a 1-page P&L summary over his morning coffee, approves it, and the accountant gets clean data to work with.

## Step-by-Step Walkthrough

### Step 1 — Parse and combine transaction sources

Marco gets transactions from two places: Stripe (for SaaS revenue) and his business checking account (for expenses). Both export CSV. The `bookkeeping-automation` parser handles both.

```python
# pipeline.py — Monthly accounting pipeline entry point
from parser import parse_csv
from categorizer import categorize_by_rules, categorize_with_ai
from dedup import remove_duplicates
from reports import expense_report, monthly_summary, export_to_csv
from datetime import datetime
import os

def run_monthly_pipeline(year: int, month: int):
    """Run the full monthly accounting pipeline."""
    period = f"{year}-{month:02d}"
    print(f"\n🧾 Running accounting pipeline for {period}...")

    # --- Parse Stripe payouts (CSV export from Stripe Dashboard) ---
    stripe_txs = parse_csv(
        f"data/stripe_{period}.csv",
        date_col="created (UTC)",
        desc_col="description",
        amount_col="net",
        date_fmt="%Y-%m-%d %H:%M:%S",
    )

    # Override categories for Stripe revenue
    for tx in stripe_txs:
        if tx.amount > 0:
            tx.category = "Revenue"
            tx.notes = "Stripe payout"

    # --- Parse bank statement (CSV from business checking account) ---
    bank_txs = parse_csv(
        f"data/bank_{period}.csv",
        date_col="Date",
        desc_col="Description",
        amount_col="Amount",
        date_fmt="%m/%d/%Y",
    )

    # --- Combine and deduplicate ---
    all_txs = stripe_txs + bank_txs
    all_txs = remove_duplicates(all_txs)
    print(f"  Loaded {len(all_txs)} transactions ({len(stripe_txs)} Stripe + {len(bank_txs)} bank)")

    return all_txs
```

### Step 2 — Categorize transactions automatically

Rule-based categorization matches 75–80% of Marco's recurring expenses (AWS, GitHub, Vercel, Gusto, etc.) instantly. The remaining edge cases go to an LLM — typically 20–30 transactions per month at near-zero cost.

```python
# pipeline.py (continued)
import openai

def categorize_transactions(transactions):
    """Apply rules first, then AI for unknowns."""

    # Add Marco's specific business rules
    from categorizer import CATEGORY_RULES
    CATEGORY_RULES["Revenue"] += ["stripe payment", "stripe payout"]
    CATEGORY_RULES["Payroll & Contractors"] += ["contractor invoice", "gusto"]
    CATEGORY_RULES["Software & SaaS"] += [
        "aws", "vercel", "github", "linear", "loom", "notion",
        "cloudflare", "datadog", "1password", "zoom",
    ]
    CATEGORY_RULES["Advertising"] += ["google ads", "twitter", "linkedin"]

    # Pass 1: rules (free, instant)
    transactions = categorize_by_rules(transactions)

    uncategorized_count = sum(1 for tx in transactions if tx.category == "Uncategorized")
    print(f"  Rules matched {len(transactions) - uncategorized_count}/{len(transactions)} transactions")

    # Pass 2: AI for the rest (send only uncategorized to save tokens)
    if uncategorized_count > 0:
        transactions = categorize_with_ai(
            transactions,
            api_key=os.environ["OPENAI_API_KEY"],
            model="gpt-4o-mini",  # Cheap, fast, accurate enough for categorization
        )
        print(f"  AI categorized {uncategorized_count} remaining transactions")

    return transactions
```

### Step 3 — Sync to Xero

Once transactions are categorized, push them to Xero: Stripe payouts become sales invoices (already paid), bank expenses become bank transactions coded to the right accounts.

```python
# sync_to_xero.py — Push categorized transactions into Xero
from xero_client import XeroClient
from xero_auth import get_valid_token, get_tenant_id
from sync_invoices import create_invoice, mark_invoice_paid
from sync_bank_transactions import create_bank_transaction
from parser import Transaction
from typing import List
import os

# Map bookkeeping categories to Xero account codes
# Update these to match your Xero chart of accounts
XERO_ACCOUNT_MAP = {
    "Revenue": "200",
    "Software & SaaS": "489",
    "Payroll & Contractors": "477",
    "Advertising": "441",
    "Meals & Entertainment": "420",
    "Travel": "493",
    "Banking & Fees": "404",
    "Office & Supplies": "469",
    "Other": "499",
}

BANK_ACCOUNT_ID = os.environ["XERO_BANK_ACCOUNT_ID"]

def sync_to_xero(transactions: List[Transaction]):
    """Push categorized transactions to Xero."""
    client = XeroClient()
    synced = 0
    errors = 0

    for tx in transactions:
        try:
            account_code = XERO_ACCOUNT_MAP.get(tx.category, "499")

            if tx.amount > 0:
                # Revenue: create invoice + mark paid
                invoice = create_invoice(
                    contact_name="Stripe Revenue",
                    line_items=[{
                        "description": tx.description or "SaaS Revenue",
                        "quantity": 1,
                        "unitAmount": float(tx.amount),
                        "accountCode": account_code,
                    }],
                    due_date=tx.date.strftime("%Y-%m-%d"),
                )
                mark_invoice_paid(invoice["InvoiceID"], amount=float(tx.amount))
            else:
                # Expense: create bank transaction (SPEND)
                create_bank_transaction(
                    account_id=BANK_ACCOUNT_ID,
                    contact_name=tx.description[:50] or "Unknown",
                    amount=abs(float(tx.amount)),
                    date=tx.date.strftime("%Y-%m-%d"),
                    description=tx.description,
                    account_code=account_code,
                    tx_type="SPEND",
                )

            synced += 1

        except Exception as e:
            print(f"  ✗ Failed to sync: {tx.description} — {e}")
            errors += 1

    print(f"  Synced {synced} transactions to Xero ({errors} errors)")
    return synced, errors
```

### Step 4 — Generate the monthly P&L report

After sync, pull the official P&L from Xero (which now includes all the new transactions) and format it for the accountant.

```python
# generate_report.py — Pull P&L from Xero and format for review
from reports_xero import get_profit_and_loss
from invoice_generator import generate_pdf_report  # Or just format as markdown
from datetime import datetime
import calendar

def generate_monthly_report(year: int, month: int) -> str:
    """Pull P&L from Xero and generate a formatted report."""
    start_date = f"{year}-{month:02d}-01"
    last_day = calendar.monthrange(year, month)[1]
    end_date = f"{year}-{month:02d}-{last_day:02d}"
    month_name = datetime(year, month, 1).strftime("%B %Y")

    pnl = get_profit_and_loss(start_date, end_date)

    lines = [
        f"# P&L Report — {month_name}",
        f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "| Category | Amount |",
        "|---|---|",
    ]

    for row in pnl["rows"]:
        label = row["label"]
        value = row["value"]
        # Bold the key summary lines
        if label in ("Total Income", "Gross Profit", "Net Profit", "Net Income"):
            lines.append(f"| **{label}** | **{value}** |")
        else:
            lines.append(f"| {label} | {value} |")

    report_md = "\n".join(lines)

    # Save to file
    output_path = f"reports/pnl_{year}_{month:02d}.md"
    os.makedirs("reports", exist_ok=True)
    with open(output_path, "w") as f:
        f.write(report_md)

    print(f"\n📊 P&L report saved to {output_path}")
    return report_md

# --- Full pipeline ---
if __name__ == "__main__":
    import sys
    from datetime import date

    # Default to previous month
    today = date.today()
    year = int(sys.argv[1]) if len(sys.argv) > 1 else today.year
    month = int(sys.argv[2]) if len(sys.argv) > 2 else today.month - 1 or 12

    transactions = run_monthly_pipeline(year, month)
    transactions = categorize_transactions(transactions)
    export_to_csv(transactions, f"data/categorized_{year}_{month:02d}.csv")
    sync_to_xero(transactions)
    report = generate_monthly_report(year, month)
    print(report)
```

### Step 5 — Automate with a monthly cron job

Run the pipeline automatically on the 2nd of each month (giving Stripe and the bank time to finalize the prior month's exports):

```bash
# crontab -e
# Run at 7:00 AM on the 2nd of each month
0 7 2 * * cd /home/marco/accounting && python pipeline.py >> logs/pipeline.log 2>&1
```

Or as a GitHub Actions scheduled workflow:

```yaml
# .github/workflows/monthly-accounting.yml
name: Monthly Accounting Pipeline

on:
  schedule:
    - cron: "0 7 2 * *"   # 2nd of each month at 7:00 AM UTC
  workflow_dispatch:       # Allow manual trigger

jobs:
  run-pipeline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Download Stripe export
        env:
          STRIPE_API_KEY: ${{ secrets.STRIPE_API_KEY }}
        run: python scripts/download_stripe_export.py

      - name: Run accounting pipeline
        env:
          XERO_CLIENT_ID: ${{ secrets.XERO_CLIENT_ID }}
          XERO_CLIENT_SECRET: ${{ secrets.XERO_CLIENT_SECRET }}
          XERO_BANK_ACCOUNT_ID: ${{ secrets.XERO_BANK_ACCOUNT_ID }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: python pipeline.py

      - name: Upload report as artifact
        uses: actions/upload-artifact@v4
        with:
          name: monthly-pnl-report
          path: reports/
```

## Results

Marco ran the pipeline for the first time mid-February, processing January's data retroactively. What used to take 3 hours took 4 minutes:

- **143 transactions** parsed from 2 sources (Stripe payout CSV + bank CSV)
- **118 auto-categorized by rules** (83%) — zero manual review needed
- **25 sent to GPT-4o-mini** for AI categorization — cost: $0.03
- **141 synced to Xero** (2 duplicates removed)
- **P&L report generated** and saved to `reports/pnl_2025_01.md`

The accountant received clean, categorized books by the 3rd of the month instead of the 28th. Marco now makes payroll and ad spend decisions with current data instead of month-old guesses. The monthly cron job runs without intervention — he only reviews the CSV if the error count is non-zero.

**Total ongoing cost:** ~$0.05/month in AI API calls + Xero subscription he already had.
