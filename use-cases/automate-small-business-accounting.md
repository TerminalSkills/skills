---
title: Automate Small Business Accounting
slug: automate-small-business-accounting
description: Connect Stripe and bank exports to automatically categorize transactions, sync them to Xero or QuickBooks, and generate a monthly P&L report — with a human review before anything is posted.
skills:
  - bookkeeping-automation
  - xero-accounting
  - quickbooks-online
category: business
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

Marco (an invented founder) runs a bootstrapped SaaS with 80 paying customers and two contractors. He exports Stripe payouts and bank statements to a spreadsheet, categorizes each line by hand and pastes totals into a Google Sheet P&L template his accountant sent him. It takes 3-4 hours every month and happens the week before his quarterly call with the accountant, so decisions on payroll, hiring and ad spend rest on month-old numbers.

Marco wants the categorization and the Xero entry done by a script he reviews, not by hand.

## The Solution

A monthly pipeline with a person in the loop:

1. **Parse** the bank and Stripe CSV exports with `bookkeeping-automation` (Decimal money, whole-word keyword rules, optional LLM for leftovers, duplicate and reconciliation checks).
2. **Review** the categorized CSV and the spending breakdown. Nothing is posted until Marco runs the script again with `--post`.
3. **Sync** to Xero with `xero-accounting` (bank transactions through the Accounting API), or to QuickBooks Online with `quickbooks-online` (see below).
4. **Report**: read the P&L back from the ledger and send it to the accountant.

The agent prepares and posts the entries; the accountant owns tax treatment and the chart of accounts. Nothing here is tax advice.

## Step-by-Step Walkthrough

### Step 1: Set up the modules

Save `parser.py` and `pipeline.py` from the `bookkeeping-automation` skill, and `xero_auth.py`, `xero_client.py` and `sync_bank_transactions.py` from the `xero-accounting` skill, in one project folder. Install `ofxtools` and `requests` in a virtual environment. Create a Xero app (scopes `accounting.transactions`, `accounting.reports.read`, `offline_access`), authorize it against a **Demo Company** first, and export `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` and `XERO_BANK_ACCOUNT_ID` as environment variables.

### Step 2: Export the two sources

- Bank: the CSV export from the business account. Open it and read the header row; pass the real column names and date format to `parse_csv`. If the bank offers OFX/QFX, `parse_ofx` is more reliable than CSV.
- Stripe: export the payouts (or balance transactions) report as CSV from the Dashboard. A payout is the net of charges minus Stripe fees and refunds, so the sales figure for revenue should come from the charges report; tell the accountant which one you booked.

### Step 3: Categorize, review, then post

The script below chains the skills' functions. By default it only writes `categorized.csv` and prints a breakdown. With `--post` it refuses to run while any row is "Uncategorized", sends the rest to Xero as `SPEND`/`RECEIVE` bank transactions (the skill's `import_transactions`) and records a fingerprint of every posted row in `synced.json`, so a second run cannot post the same rows twice.

```python
# monthly.py - parse, categorize, review, then (only with --post) push to Xero
import argparse
import csv
import hashlib
import json
import os
from decimal import Decimal

from parser import parse_csv
from pipeline import categorize_by_rules, categorize_with_llm, drop_repeated_ids, expense_report

# Read your real codes from GET /Accounts (needs accounting.settings); these are placeholders.
XERO_ACCOUNT_MAP = {
    "Revenue": "200", "Software & SaaS": "489", "Payroll & Contractors": "477",
    "Advertising": "441", "Meals & Entertainment": "420", "Travel": "493",
    "Banking & Fees": "404", "Other": "499",
}
LEDGER = "synced.json"   # fingerprints of rows already pushed, so a re-run cannot double-post


def fingerprint(tx):
    return hashlib.sha256(f"{tx.raw_id}|{tx.date.date()}|{tx.amount}|{tx.description}".encode()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_file")
    ap.add_argument("--post", action="store_true", help="push to Xero (default: review only)")
    args = ap.parse_args()

    # Pass the real header names of YOUR export; banks differ.
    txs = parse_csv(args.csv_file, date_col="Date", desc_col="Description",
                    amount_col="Amount", date_fmt="%Y-%m-%d", id_col="Transaction ID")
    txs = categorize_by_rules(drop_repeated_ids(txs))
    # categorize_with_llm(txs, ask) is optional; see the bookkeeping-automation skill.
    print(expense_report(txs, "Expenses to review"))
    left = [t for t in txs if t.category == "Uncategorized"]
    print(f"{len(left)} rows still Uncategorized: fix the rules or label them before posting")

    with open("categorized.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "description", "amount", "category"])
        for t in txs:
            w.writerow([t.date.date(), t.description, t.amount, t.category])
    if not args.post:
        print("Review categorized.csv, then re-run with --post")
        return
    if left:
        raise SystemExit("Refusing to post with Uncategorized rows")

    from sync_bank_transactions import import_transactions   # from the xero-accounting skill
    done = set(json.load(open(LEDGER))) if os.path.exists(LEDGER) else set()
    new = [t for t in txs if fingerprint(t) not in done]
    rows = [{"date": t.date.strftime("%Y-%m-%d"), "contact": t.description[:50] or "Unknown",
             "amount": float(t.amount), "description": t.description,
             "account_code": XERO_ACCOUNT_MAP.get(t.category, "499")} for t in new]
    created = import_transactions(os.environ["XERO_BANK_ACCOUNT_ID"], rows)
    ok = [t for t, c in zip(new, created) if not c.get("HasValidationErrors")]
    done.update(fingerprint(t) for t in ok)
    json.dump(sorted(done), open(LEDGER, "w"))
    print(f"Posted {len(ok)} of {len(new)} new rows ({len(txs) - len(new)} already synced)")


if __name__ == "__main__":
    main()
```

Run it in two steps:

```console
$ python monthly.py bank_2026-10.csv
$ python monthly.py bank_2026-10.csv --post
```

For the leftovers, `categorize_with_llm(txs, ask)` takes any function that sends a prompt to the model you choose; read the model name from an environment variable because model names are retired regularly. Descriptions leave your machine in that call, so strip account numbers or use a local model.

The account codes in `XERO_ACCOUNT_MAP` are placeholders. Read the organisation's real chart with `GET /Accounts` (scope `accounting.settings`) and map your categories to it.

### Step 4: Read the P&L back

After the sync, `reports.py` from the `xero-accounting` skill returns the profit and loss for the month:

```python
from reports import profit_and_loss
for label, value in profit_and_loss("2026-10-01", "2026-10-31").items():
    print(f"{label:<24}{value:>12}")
```

The labels come from the organisation's own report layout. Save the output to `reports/pnl_2026_10.md` or paste it into an email to the accountant.

### Step 5: Use QuickBooks Online instead

If the books live in QuickBooks Online, keep Steps 1-3 up to `categorized.csv` and replace the posting step with the `quickbooks-online` skill: its OAuth client sends every request with an explicit `minorversion=75`, creates vendors and expenses/bills from the categorized rows, and `ProfitAndLoss` report gives Step 4. Map categories to QuickBooks accounts by name from the company's own chart of accounts.

### Step 6: Run it monthly

Put a recurring reminder on the 2nd of the month (after Stripe and the bank have finalized the previous month). Run the review step, look at `categorized.csv` and the unmatched rows, fix the rules, then post. Keep the Xero refresh token in a file or database outside git: it is single use and an unused one expires after 60 days, so a month-long gap is fine but a two-month gap needs a new authorization.

## Results

On the example run for October (invented numbers): 143 rows parsed from two sources, 118 matched by the rules, 25 left for the model or for Marco, and 2 repeated bank ids removed before posting. Marco compares the posted bank transactions with the statement balance using `reconcile` before the report goes to the accountant.

What changes for Marco is the work, not the responsibility: categorizing and keying are done by the script, while approving the categories, the account mapping and the revenue treatment stays with him and his accountant.

## Related Skills

- [bookkeeping-automation](/skills/bookkeeping-automation)
- [xero-accounting](/skills/xero-accounting)
- [quickbooks-online](/skills/quickbooks-online)
