---
name: bookkeeping-automation
description: >-
  Automate bookkeeping workflows by parsing bank statements (CSV/OFX/QIF),
  categorizing transactions using rules or AI, reconciling accounts, generating
  expense reports, and detecting duplicates. Use when: automating transaction
  categorization, building reconciliation pipelines, processing bank exports,
  or generating expense summaries without manual data entry.
license: Apache-2.0
compatibility: "Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: ["bookkeeping", "bank-statements", "reconciliation", "categorization", "accounting"]
  use-cases:
    - "Parse a bank CSV export and auto-categorize all transactions"
    - "Detect duplicate transactions across multiple bank feeds"
    - "Reconcile bank statement balance against accounting system records"
    - "Generate a monthly expense breakdown by category"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Bookkeeping Automation

## Overview

Automate the manual parts of bookkeeping: importing bank statements in multiple formats, categorizing transactions using keyword rules or AI, deduplicating entries, reconciling account balances, and producing expense reports. This skill is format-agnostic — it handles CSV exports from most banks, OFX/QFX files (used by most US banks and Mint), and QIF files (legacy Quicken format).

## Instructions

### Step 1: Parse bank statements

```python
# parser.py — Parse CSV, OFX, and QIF bank statement formats

import csv
import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import List

@dataclass
class Transaction:
    date: datetime
    description: str
    amount: Decimal          # Negative = debit, Positive = credit
    raw_id: str = ""         # Bank's transaction ID (for dedup)
    category: str = "Uncategorized"
    notes: str = ""

def parse_csv(filepath: str, date_col: str = "Date", desc_col: str = "Description",
              amount_col: str = "Amount", date_fmt: str = "%m/%d/%Y") -> List[Transaction]:
    """
    Parse a bank CSV export. Column names vary by bank — adjust defaults.

    Common variants:
      Chase:    Date, Description, Amount
      Bank of America: Date, Description, Amount, Running Bal.
      Wells Fargo: date, description, deposits, withdrawals, balance
    """
    transactions = []
    with open(filepath, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Handle split debit/credit columns (e.g., Wells Fargo)
            if "deposits" in [k.lower() for k in row]:
                credit = Decimal(row.get("deposits", "0").replace(",", "") or "0")
                debit = Decimal(row.get("withdrawals", "0").replace(",", "") or "0")
                amount = credit - debit
            else:
                raw = row[amount_col].replace(",", "").replace("$", "").strip()
                amount = Decimal(raw)

            transactions.append(Transaction(
                date=datetime.strptime(row[date_col].strip(), date_fmt),
                description=row[desc_col].strip(),
                amount=amount,
                raw_id=row.get("Transaction ID", ""),
            ))
    return transactions

def parse_ofx(filepath: str) -> List[Transaction]:
    """Parse OFX/QFX files (Open Financial Exchange — used by most US banks)."""
    transactions = []
    with open(filepath, encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # Extract STMTTRN blocks
    pattern = re.compile(r"<STMTTRN>(.*?)</STMTTRN>", re.DOTALL)
    for match in pattern.finditer(content):
        block = match.group(1)

        def extract(tag):
            m = re.search(rf"<{tag}>(.*?)(?:<|$)", block)
            return m.group(1).strip() if m else ""

        date_str = extract("DTPOSTED")[:8]  # YYYYMMDD
        transactions.append(Transaction(
            date=datetime.strptime(date_str, "%Y%m%d"),
            description=extract("MEMO") or extract("NAME"),
            amount=Decimal(extract("TRNAMT")),
            raw_id=extract("FITID"),
        ))
    return transactions

def parse_qif(filepath: str) -> List[Transaction]:
    """Parse QIF files (Quicken Interchange Format — legacy but still common)."""
    transactions = []
    current = {}

    with open(filepath, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("D"):   # Date
                current["date"] = line[1:]
            elif line.startswith("T"): # Amount
                current["amount"] = line[1:].replace(",", "")
            elif line.startswith("P"): # Payee
                current["description"] = line[1:]
            elif line.startswith("N"): # Check number / ID
                current["raw_id"] = line[1:]
            elif line == "^":          # Record separator
                if "date" in current and "amount" in current:
                    # QIF dates vary: M/D/Y, M/D'YY, etc.
                    for fmt in ("%m/%d/%Y", "%m/%d'%y", "%d/%m/%Y"):
                        try:
                            parsed_date = datetime.strptime(current["date"], fmt)
                            break
                        except ValueError:
                            continue
                    transactions.append(Transaction(
                        date=parsed_date,
                        description=current.get("description", ""),
                        amount=Decimal(current["amount"]),
                        raw_id=current.get("raw_id", ""),
                    ))
                current = {}

    return transactions
```

### Step 2: Categorize transactions

```python
# categorizer.py — Rule-based and AI-powered transaction categorization

import re
from typing import List
from parser import Transaction

# Rule-based categorization — extend this dict for your business
CATEGORY_RULES = {
    "Software & SaaS": [
        "aws", "amazon web services", "digitalocean", "cloudflare", "github",
        "vercel", "heroku", "stripe", "twilio", "sendgrid", "datadog",
        "notion", "linear", "figma", "zapier", "openai",
    ],
    "Advertising": [
        "google ads", "facebook ads", "meta ads", "twitter ads", "linkedin ads",
        "reddit ads", "bing ads",
    ],
    "Payroll & Contractors": [
        "gusto", "rippling", "deel", "remote.com", "paylocity", "payroll",
        "wise", "transferwise",
    ],
    "Office & Supplies": [
        "staples", "office depot", "amazon", "best buy",
    ],
    "Travel": [
        "airbnb", "marriott", "hilton", "delta", "united", "american airlines",
        "southwest", "uber", "lyft", "expedia",
    ],
    "Meals & Entertainment": [
        "restaurant", "cafe", "coffee", "starbucks", "doordash", "grubhub",
        "ubereats",
    ],
    "Banking & Fees": [
        "bank fee", "service charge", "wire fee", "monthly fee", "overdraft",
    ],
    "Revenue": [
        "stripe payment", "paypal transfer", "square payment",
    ],
}

def categorize_by_rules(transactions: List[Transaction]) -> List[Transaction]:
    """Apply keyword rules to categorize transactions."""
    for tx in transactions:
        desc_lower = tx.description.lower()
        matched = False
        for category, keywords in CATEGORY_RULES.items():
            if any(kw in desc_lower for kw in keywords):
                tx.category = category
                matched = True
                break
        if not matched:
            tx.category = "Uncategorized"
    return transactions

def categorize_with_ai(transactions: List[Transaction], api_key: str,
                       model: str = "gpt-4o-mini") -> List[Transaction]:
    """
    Use an LLM to categorize transactions that rules couldn't match.
    Only sends uncategorized transactions to reduce API costs.
    """
    import json
    import openai

    client = openai.OpenAI(api_key=api_key)
    uncategorized = [tx for tx in transactions if tx.category == "Uncategorized"]

    if not uncategorized:
        return transactions

    # Batch up to 50 transactions per request
    batch_size = 50
    categories = list(CATEGORY_RULES.keys()) + ["Personal", "Tax", "Insurance", "Other"]

    for i in range(0, len(uncategorized), batch_size):
        batch = uncategorized[i:i + batch_size]
        tx_list = [
            {"id": j, "description": tx.description, "amount": str(tx.amount)}
            for j, tx in enumerate(batch)
        ]

        prompt = f"""Categorize these bank transactions into one of these categories:
{json.dumps(categories, indent=2)}

Transactions:
{json.dumps(tx_list, indent=2)}

Return a JSON array of {{"id": <int>, "category": "<category>"}} objects only."""

        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0,
        )

        try:
            results = json.loads(response.choices[0].message.content)
            # Handle both {"results": [...]} and [...] formats
            if isinstance(results, dict):
                results = next(iter(results.values()))
            for r in results:
                batch[r["id"]].category = r["category"]
        except (json.JSONDecodeError, KeyError, IndexError):
            pass  # Keep "Uncategorized" if AI fails

    return transactions
```

### Step 3: Detect and remove duplicates

```python
# dedup.py — Detect duplicate transactions
from typing import List, Tuple
from parser import Transaction
from datetime import timedelta
from decimal import Decimal

def detect_duplicates(transactions: List[Transaction],
                      date_window_days: int = 3,
                      amount_tolerance: Decimal = Decimal("0.01")) -> List[Tuple]:
    """
    Find likely duplicate transactions based on:
    - Same amount (within tolerance)
    - Similar description (fuzzy match)
    - Date within a rolling window

    Returns list of (tx_a, tx_b) duplicate pairs.
    """
    duplicates = []
    sorted_txs = sorted(transactions, key=lambda t: (t.amount, t.date))

    for i, tx_a in enumerate(sorted_txs):
        for tx_b in sorted_txs[i + 1:]:
            # Stop early — sorted by amount, no point checking further
            if abs(tx_b.amount - tx_a.amount) > amount_tolerance:
                break

            # Check date proximity
            date_diff = abs((tx_b.date - tx_a.date).days)
            if date_diff > date_window_days:
                continue

            # If both have bank IDs, use them for exact match
            if tx_a.raw_id and tx_b.raw_id and tx_a.raw_id == tx_b.raw_id:
                duplicates.append((tx_a, tx_b))
                continue

            # Fuzzy description match (Jaccard similarity on word sets)
            words_a = set(tx_a.description.lower().split())
            words_b = set(tx_b.description.lower().split())
            if words_a and words_b:
                jaccard = len(words_a & words_b) / len(words_a | words_b)
                if jaccard > 0.6:
                    duplicates.append((tx_a, tx_b))

    return duplicates

def remove_duplicates(transactions: List[Transaction]) -> List[Transaction]:
    """Return deduplicated list, keeping the first occurrence of each duplicate pair."""
    duplicates = detect_duplicates(transactions)
    to_remove = set(id(pair[1]) for pair in duplicates)
    return [tx for tx in transactions if id(tx) not in to_remove]
```

### Step 4: Reconcile accounts

```python
# reconciler.py — Reconcile parsed transactions against a known closing balance
from typing import List
from decimal import Decimal
from parser import Transaction
from datetime import datetime

def reconcile(transactions: List[Transaction],
              opening_balance: Decimal,
              expected_closing_balance: Decimal,
              statement_date: datetime) -> dict:
    """
    Reconcile a list of transactions against a bank statement.

    Returns a dict with reconciliation status and any discrepancy.
    """
    # Filter to transactions on or before statement date
    in_scope = [tx for tx in transactions if tx.date <= statement_date]
    computed_balance = opening_balance + sum(tx.amount for tx in in_scope)
    discrepancy = computed_balance - expected_closing_balance

    result = {
        "opening_balance": float(opening_balance),
        "total_transactions": len(in_scope),
        "total_debits": float(sum(tx.amount for tx in in_scope if tx.amount < 0)),
        "total_credits": float(sum(tx.amount for tx in in_scope if tx.amount > 0)),
        "computed_closing_balance": float(computed_balance),
        "expected_closing_balance": float(expected_closing_balance),
        "discrepancy": float(discrepancy),
        "reconciled": abs(discrepancy) < Decimal("0.01"),
    }

    if result["reconciled"]:
        print(f"✓ Reconciled — closing balance: ${computed_balance:.2f}")
    else:
        print(f"✗ Discrepancy of ${discrepancy:.2f} found")
        print(f"  Computed: ${computed_balance:.2f}")
        print(f"  Expected: ${expected_closing_balance:.2f}")

    return result
```

### Step 5: Generate expense reports

```python
# reports.py — Generate expense summaries
from typing import List
from parser import Transaction
from collections import defaultdict
from decimal import Decimal
import json

def monthly_summary(transactions: List[Transaction]) -> dict:
    """Group transactions by month and category, return summary."""
    summary = defaultdict(lambda: defaultdict(Decimal))

    for tx in transactions:
        month_key = tx.date.strftime("%Y-%m")
        summary[month_key][tx.category] += tx.amount

    return {month: dict(cats) for month, cats in sorted(summary.items())}

def expense_report(transactions: List[Transaction], title: str = "Expense Report") -> str:
    """Generate a human-readable expense report."""
    debits = [tx for tx in transactions if tx.amount < 0]
    by_category = defaultdict(Decimal)
    for tx in debits:
        by_category[tx.category] += abs(tx.amount)

    total = sum(by_category.values())
    lines = [f"\n{'=' * 50}", f"  {title}", f"{'=' * 50}"]

    for category, amount in sorted(by_category.items(), key=lambda x: -x[1]):
        pct = (amount / total * 100) if total else 0
        lines.append(f"  {category:<30} ${amount:>10.2f}  ({pct:.1f}%)")

    lines.append(f"{'─' * 50}")
    lines.append(f"  {'TOTAL':<30} ${total:>10.2f}")
    lines.append(f"{'=' * 50}\n")
    return "\n".join(lines)

def export_to_csv(transactions: List[Transaction], output_path: str):
    """Export categorized transactions to CSV for review or import."""
    import csv
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "description", "amount", "category", "notes"])
        writer.writeheader()
        for tx in transactions:
            writer.writerow({
                "date": tx.date.strftime("%Y-%m-%d"),
                "description": tx.description,
                "amount": str(tx.amount),
                "category": tx.category,
                "notes": tx.notes,
            })
    print(f"Exported {len(transactions)} transactions to {output_path}")
```

## Examples

### Example 1: Full pipeline — CSV → categorize → report

```python
from parser import parse_csv
from categorizer import categorize_by_rules, categorize_with_ai
from dedup import remove_duplicates
from reports import expense_report, export_to_csv
import os

# 1. Parse bank CSV
transactions = parse_csv("march_bank_statement.csv")
print(f"Parsed {len(transactions)} transactions")

# 2. Apply rules first (free, fast)
transactions = categorize_by_rules(transactions)

# 3. AI for remaining unknowns (paid, slower)
transactions = categorize_with_ai(transactions, api_key=os.environ["OPENAI_API_KEY"])

# 4. Remove duplicates
transactions = remove_duplicates(transactions)

# 5. Print expense report
print(expense_report(transactions, title="March 2025 Expenses"))

# 6. Export for review / accounting system import
export_to_csv(transactions, "march_2025_categorized.csv")
```

**Output:**
```
Parsed 143 transactions

==================================================
  March 2025 Expenses
==================================================
  Software & SaaS                $   4,230.00  (41.2%)
  Payroll & Contractors          $   3,800.00  (37.0%)
  Advertising                    $   1,200.00  (11.7%)
  Meals & Entertainment          $     420.00   (4.1%)
  Travel                         $     320.00   (3.1%)
  Other                          $     300.00   (2.9%)
──────────────────────────────────────────────────
  TOTAL                          $  10,270.00
==================================================
```

### Example 2: Reconcile an OFX statement

```python
from parser import parse_ofx
from dedup import remove_duplicates
from reconciler import reconcile
from decimal import Decimal
from datetime import datetime

transactions = parse_ofx("march_checking.ofx")
transactions = remove_duplicates(transactions)

result = reconcile(
    transactions=transactions,
    opening_balance=Decimal("12,450.00"),
    expected_closing_balance=Decimal("8,930.00"),
    statement_date=datetime(2025, 3, 31),
)
# ✓ Reconciled — closing balance: $8,930.00
```

## Guidelines

- Always run deduplication before categorization and reconciliation — bank exports sometimes include the same transaction twice (pending + cleared).
- Use rule-based categorization first; send only unmatched transactions to AI to keep costs low. 70–80% of transactions typically match keyword rules.
- For AI categorization, batch 50 transactions per request and request JSON output to avoid parsing errors.
- When reconciling, sort transactions by date and check for off-by-one errors around the statement cutoff date.
- Preserve the original `raw_id` (FITID in OFX, Num in QIF) for reliable deduplication even if descriptions vary.
- Export to CSV after categorization for a human review step before pushing to Xero or QuickBooks.
- For recurring reports, store processed transaction IDs in a local SQLite database to avoid reprocessing already-imported entries.
