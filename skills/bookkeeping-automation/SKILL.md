---
name: bookkeeping-automation
description: >-
  Automate bookkeeping workflows by parsing bank statements (CSV/OFX/QIF),
  categorizing transactions using rules or an LLM, reconciling accounts,
  generating expense reports, and detecting duplicates. Use when: automating
  transaction categorization, building reconciliation pipelines, processing
  bank exports, or generating expense summaries without manual data entry.
license: Apache-2.0
compatibility: "Python 3.10+; ofxtools 1.1 for OFX/QFX files (pip install ofxtools)"
metadata:
  author: terminal-skills
  version: "1.1.0"
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

Automate the repetitive parts of bookkeeping: import bank statements (CSV, OFX/QFX, QIF), categorize transactions with ordered keyword rules and an optional LLM for the leftovers, remove repeated rows safely, reconcile against the statement balance, and print an expense report. Money is always `Decimal`, never `float`. The code below was run on sample CSV, OFX (SGML, version 1.02) and QIF files with Python 3.12 and ofxtools 1.1.1. The output is a draft for a human to review before anything is posted to Xero, QuickBooks or a ledger; it is not tax or accounting advice.

## Instructions

1. Save the two modules below as `parser.py` and `pipeline.py` in a scratch folder and install the one dependency: `pip install ofxtools` (inside a virtual environment). The imports below assume those file names (the stdlib `parser` module was removed in Python 3.10, so there is no clash).
2. Look at the header row of the CSV export and pass its real column names, date format and (if the bank uses separate debit and credit columns) `debit_col`/`credit_col`. Banks differ and change their exports, so never assume a layout; check one row by eye.
3. Run `categorize_by_rules` first (free and deterministic). Rules are ordered and the first match wins, so list specific phrases above general ones. Rules only match whole words and respect direction (money in vs out).
4. Send only the remaining "Uncategorized" rows to a model with `categorize_with_llm`. It takes any `ask(prompt) -> str` function, so it works with any provider; read the model name from an environment variable instead of hard-coding one, because model names are retired regularly (OpenAI, for instance, lists `gpt-4o-mini` for shutdown on 14 January 2027). Sending descriptions to a third-party API is a privacy decision: strip account numbers and names first, or use a local model.
5. Deduplicate with `drop_repeated_ids` (same bank id, date and amount twice, typical of overlapping exports). Use `possible_duplicates` only to produce a list for a person to review: identical rows without bank ids can be genuine (two coffees on one day).
6. Reconcile with `reconcile`: opening balance plus the transactions in the statement period must equal the closing balance exactly. Take the balances from the statement, never from the transaction file itself.
7. Print `expense_report`, export the categorized rows for review, and only then import into the accounting system.

### parser.py

```python
# parser.py - bank statement parsers (CSV, OFX/QFX via ofxtools, QIF)
import csv
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


@dataclass
class Transaction:
    date: datetime
    description: str
    amount: Decimal              # negative = money out, positive = money in
    raw_id: str = ""             # bank's transaction id (OFX FITID), used for dedup
    category: str = "Uncategorized"


def money(text: str) -> Decimal:
    """'1,234.50', '$12.00', '(45.10)' and '-45.10' all become Decimal."""
    t = text.replace(",", "").replace("$", "").strip()
    if t.startswith("(") and t.endswith(")"):
        t = "-" + t[1:-1]
    return Decimal(t or "0")


def parse_csv(path, date_col="Date", desc_col="Description", amount_col="Amount",
              date_fmt="%m/%d/%Y", debit_col=None, credit_col=None, id_col=None):
    """Column names and date formats differ per bank: pass what the header row says.
    Banks that export separate debit and credit columns: set debit_col and credit_col."""
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if debit_col:
                amount = money(row[credit_col]) - money(row[debit_col])
            else:
                amount = money(row[amount_col])
            rows.append(Transaction(datetime.strptime(row[date_col].strip(), date_fmt),
                                    row[desc_col].strip(), amount,
                                    row.get(id_col, "") if id_col else ""))
    return rows


def parse_ofx(path):
    """OFX 1.x (SGML) and 2.x (XML), .ofx and .qfx. Hand-written regexes break on
    SGML files, whose leaf tags have no closing tag, so use ofxtools."""
    from ofxtools.Parser import OFXTree
    tree = OFXTree()
    tree.parse(path)
    out = []
    for stmt in tree.convert().statements:
        for t in stmt.transactions:
            out.append(Transaction(t.dtposted.replace(tzinfo=None),
                                   t.memo or t.name or "", Decimal(t.trnamt), t.fitid or ""))
    return out


def parse_qif(path):
    """QIF has no standard date format: try the common ones, fail loudly otherwise."""
    out, cur = [], {}
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if line == "^":
                if "D" in cur and "T" in cur:
                    out.append(Transaction(_qif_date(cur["D"]), cur.get("P", ""),
                                           money(cur["T"]), cur.get("N", "")))
                cur = {}
            elif line and line[0] in "DTPN":
                cur[line[0]] = line[1:]
    return out


def _qif_date(text):
    for fmt in ("%m/%d/%Y", "%m/%d'%Y", "%m/%d'%y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text.replace(" ", ""), fmt)
        except ValueError:
            pass
    raise ValueError(f"Unrecognised QIF date: {text!r}")
```

### pipeline.py

```python
# pipeline.py - categorize, deduplicate, reconcile, report
import json
import re
from collections import defaultdict
from decimal import Decimal
from parser import Transaction

# Ordered: the FIRST matching rule wins, so put specific rules above general ones
# ("stripe payment" before "stripe", "uber eats" before "uber").
RULES = [
    ("Revenue", ["stripe payment", "stripe payout", "paypal transfer", "square deposit"], "in"),
    ("Meals & Entertainment", ["uber eats", "doordash", "grubhub", "starbucks", "cafe", "coffee"], "out"),
    ("Travel", ["airbnb", "marriott", "hilton", "delta air", "united airlines", "uber", "lyft"], "out"),
    ("Software & SaaS", ["aws", "amazon web services", "digitalocean", "cloudflare", "github",
                         "vercel", "stripe", "twilio", "datadog", "notion", "figma", "zapier"], "out"),
    ("Advertising", ["google ads", "meta ads", "linkedin ads", "reddit ads"], "out"),
    ("Payroll & Contractors", ["gusto", "rippling", "deel", "payroll"], "out"),
    ("Banking & Fees", ["bank fee", "service charge", "wire fee", "monthly fee", "overdraft"], "out"),
]
CATEGORIES = [r[0] for r in RULES] + ["Insurance", "Professional Services", "Other"]


def categorize_by_rules(txs):
    for tx in txs:
        text = tx.description.lower()
        direction = "in" if tx.amount > 0 else "out"
        for category, words, only in RULES:
            if only == direction and any(re.search(rf"\b{re.escape(w)}\b", text) for w in words):
                tx.category = category
                break
    return txs


def categorize_with_llm(txs, ask, batch_size=40):
    """ask(prompt: str) -> str must return JSON text. Pass any provider's client call;
    only descriptions and amounts leave your machine, never account numbers.
    Output is validated: unknown ids or categories are ignored and stay Uncategorized."""
    todo = [t for t in txs if t.category == "Uncategorized"]
    for i in range(0, len(todo), batch_size):
        batch = todo[i:i + batch_size]
        items = [{"id": n, "description": t.description, "amount": str(t.amount)}
                 for n, t in enumerate(batch)]
        reply = ask(f"Assign each bank transaction one category from {json.dumps(CATEGORIES)}. "
                    f'Reply with JSON only: {{"results": [{{"id": 0, "category": "..."}}]}}\n'
                    f"{json.dumps(items)}")
        try:
            for r in json.loads(reply)["results"]:
                if r["category"] in CATEGORIES and 0 <= r["id"] < len(batch):
                    batch[r["id"]].category = r["category"]
        except (ValueError, KeyError, TypeError):
            pass
    return txs


def drop_repeated_ids(txs):
    """Safe automatic dedup: the same bank id appearing twice (overlapping exports)."""
    seen, out = set(), []
    for t in txs:
        if t.raw_id:
            key = (t.raw_id, t.date.date(), t.amount)
            if key in seen:
                continue
            seen.add(key)
        out.append(t)
    return out


def possible_duplicates(txs):
    """Same day, amount and description but no bank id to prove it: REVIEW, never auto-delete
    (two coffees on one day are legitimate)."""
    groups = defaultdict(list)
    for t in txs:
        if not t.raw_id:
            groups[(t.date.date(), t.amount, t.description.lower())].append(t)
    return [g for g in groups.values() if len(g) > 1]


def reconcile(txs, opening, closing, start, end):
    """Opening balance + transactions dated start..end (inclusive) should equal the closing balance."""
    scope = [t for t in txs if start <= t.date <= end]
    computed = opening + sum((t.amount for t in scope), Decimal("0"))
    diff = computed - closing
    return {"transactions": len(scope), "computed_closing": computed,
            "expected_closing": closing, "difference": diff, "reconciled": diff == 0}


def expense_report(txs, title):
    spend = defaultdict(Decimal)
    for t in txs:
        if t.amount < 0:
            spend[t.category] += -t.amount
    total = sum(spend.values(), Decimal("0"))
    lines = [title, "=" * 52]
    for cat, amt in sorted(spend.items(), key=lambda kv: -kv[1]):
        lines.append(f"{cat:<26}{amt:>12,.2f}  {amt / total * 100:5.1f}%")
    lines += ["-" * 52, f"{'TOTAL':<26}{total:>12,.2f}"]
    return "\n".join(lines)
```

## Examples

### Example 1: Categorize a March export and see what is left

**User request:** "Categorize march_bank_statement.csv and give me a spending breakdown."

```python
from parser import parse_csv
from pipeline import (categorize_by_rules, drop_repeated_ids, expense_report,
                      possible_duplicates)

txs = parse_csv("march_bank_statement.csv", id_col="Transaction ID")
print(f"Parsed {len(txs)} rows")
txs = categorize_by_rules(drop_repeated_ids(txs))
left = [t for t in txs if t.category == "Uncategorized"]
print(f"{len(left)} of {len(txs)} need review or an LLM")
print(expense_report(txs, "March 2025 expenses"))
print(possible_duplicates(txs))
```

**Output** (ten sample rows, one of them a repeated bank id):

```
Parsed 10 rows
2 of 9 need review or an LLM
March 2025 expenses
====================================================
Uncategorized                 1,210.00   92.0%
Software & SaaS                  49.00    3.7%
Meals & Entertainment            38.55    2.9%
Travel                           18.00    1.4%
----------------------------------------------------
TOTAL                         1,315.55
[]
```

"UNITED HEALTHCARE" and "ACME LEGAL LLP" stay uncategorized until a rule is added or `categorize_with_llm(txs, ask)` is called with, for example, an `ask` that wraps your provider's chat call, returns the JSON string, and reads the model from `os.environ["CATEGORIZER_MODEL"]`. Anything the model returns outside `CATEGORIES` is ignored.

### Example 2: Reconcile an OFX statement

**User request:** "Check that march_checking.ofx adds up to the closing balance on the statement."

```python
from datetime import datetime
from decimal import Decimal
from parser import parse_ofx
from pipeline import drop_repeated_ids, reconcile

txs = drop_repeated_ids(parse_ofx("march_checking.ofx"))
print(reconcile(txs, opening=Decimal("12450.00"), closing=Decimal("19701.00"),
                start=datetime(2025, 3, 1), end=datetime(2025, 3, 31, 23, 59, 59)))
```

**Output:** `{'transactions': 3, 'computed_closing': Decimal('19701.00'), 'expected_closing': Decimal('19701.00'), 'difference': Decimal('0.00'), 'reconciled': True}`. With the wrong opening balance of 11450.00 it prints `difference: Decimal('-1000.00')` and `reconciled: False`, which points at a missing or extra transaction of that size.

## Guidelines

- Keep rules ordered from specific to general: "stripe payment" must come before "stripe", "uber eats" before "uber", or the wrong category wins silently.
- Never auto-delete rows that merely look alike. Delete only on proof (same bank id); list the rest for review.
- Parse OFX with ofxtools, not regular expressions: OFX 1.x is SGML and its leaf tags have no closing tag.
- Treat LLM output as untrusted input: validate ids and categories, keep failures as "Uncategorized", and spot-check a sample.
- Do not put bank statements, account numbers or API keys in prompts, logs or the repository; read keys from environment variables.
- A reconciliation that is off by exactly one transaction amount usually means a missing or duplicated row; off by a few cents means rounding or a float slipped in.
- For recurring imports, keep processed bank ids in SQLite so re-imports do not double count.
