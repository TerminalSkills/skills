---
title: "Automate Vendor Contract Comparison and Renewal Tracking with AI"
slug: automate-vendor-contract-comparison
description: "Compare vendor contracts side-by-side and track renewal deadlines to avoid costly auto-renewals."
skills: [contract-review, pdf-analyzer, report-generator]
category: business
tags: [contracts, vendor-management, procurement, compliance, automation]
---

# Automate Vendor Contract Comparison and Renewal Tracking with AI

## The Problem

A 40-person e-commerce company uses 28 SaaS vendors: cloud hosting, email marketing, payment processing, monitoring, analytics. Each contract has different renewal dates, auto-renewal clauses, price escalation terms, and cancellation windows. Last quarter the team missed a 30-day cancellation window on a monitoring tool they had already replaced, and paid $14,000 for a year nobody needed.

The worst part is the blindness. Nobody has a consolidated view of what renews when, which contracts have unfavorable terms, or where there is room to negotiate. The contracts live in a shared Drive folder as PDFs, Word files and a few email confirmations. Some were signed by people who no longer work there.

## The Solution

Three skills split the work:

- **pdf-analyzer** pulls text and tables out of PDFs (pdfplumber or PyMuPDF) and tells you when a file is encrypted or a scan.
- **contract-review** reads each agreement (PDF, DOCX or text), finds the term, renewal, payment, liability and data clauses, and rates the risks.
- **report-generator** turns the comparison into an HTML or PDF report for the decision makers.

The agent produces one structured row per contract. A short script you keep in the repo turns those rows into a renewal calendar and the 90/60/30-day alerts. A scheduler runs that script, because an agent only works when it is started.

## Step-by-Step Walkthrough

### Step 1: Extract Terms from Every Contract

Point the agent at the contracts folder:

```text
Analyze all vendor contracts in ./contracts/. For each one extract: vendor name, annual value, start date, renewal date, auto-renewal clause, cancellation notice period in days, price escalation terms (check addenda too), and SLA guarantees. Quote the clause for every date and notice period. Write one row per contract to contracts.csv with the columns vendor, annual_value, renewal_date, cancel_notice_days, auto_renew. List files you could not read.
```

The agent reads DOCX files with python-docx (including tables, where fee schedules often hide) and PDFs with pdfplumber. Three things need a human or extra tooling:

- **Scanned PDFs** return no text. The agent falls back to OCR (PyMuPDF with the Tesseract system binary installed); check those rows by hand.
- **Legacy `.doc` files** (and `.docx` files with the wrong extension, which are worth renaming) must be converted first.
- **Email agreements** must be saved as PDF or text before they can be read.

Treat the extraction as a draft. Spot-check the dates and notice periods against the quoted clauses for the contracts that matter, because a wrong cancellation window is exactly the failure you are trying to prevent. Price escalation clauses in addenda are the usual surprise: a main agreement that says "$2,800/month" may be followed by an addendum signed six months later with a 5% annual increase.

The extracted fields look like this for each vendor:

| Field | Example Value |
|-------|---------------|
| Vendor | Acme Cloud Hosting |
| Annual Value | $33,600 |
| Auto-Renewal | Yes, 12-month term |
| Cancel Window | 30 days before renewal |
| Price Escalation | 5%/year (addendum) |
| SLA Guarantee | 99.95% uptime |
| Next Renewal | 2027-04-22 |
| Cancel By | 2027-03-23 |

### Step 2: Compare Competing Vendors Side by Side

The company pays three cloud hosting vendors because each team chose its own two years ago. Ask whether to consolidate:

```text
Compare our three cloud hosting contracts side by side: pricing, SLA uptime, SLA credit terms, support response times, data residency, term and price escalation. Which one meets a 99.9% uptime requirement for the least money? Quote the contract section for each cell and mark any cell the contract does not state.
```

The comparison, for example:

|                     | Vendor A       | Vendor B       | Vendor C         |
|---------------------|----------------|----------------|------------------|
| Monthly cost (50TB) | $3,200         | $2,800         | $3,600           |
| Uptime SLA          | 99.95%         | 99.9%          | 99.99%           |
| SLA credit trigger  | 10% below 99.9% | 25% below 99.5% | 10% below 99.95% |
| Support response    | 4h (critical)  | 1h (critical)  | 30min (critical) |
| Data residency      | US, EU         | US only        | US, EU, APAC     |
| Contract term       | Annual         | Monthly        | Annual           |
| Price escalation    | 3%/year        | None           | 5%/year          |

Vendor B meets the 99.9% requirement at the lowest cost with no escalation. If EU data residency is mandatory, Vendor A costs $400/month more and includes it. Vendor C is $9,600/year more than B, which only pays off if the company needs 99.99% for compliance.

The credit terms matter as much as the headline numbers. In a month with 99.8% uptime, Vendor A owes a credit (10% of $3,200, or $320) because 99.8% is below its 99.9% trigger, while Vendor B owes nothing because its credit only starts below 99.5%. The "weaker" 99.9% SLA is not the worse deal in every month.

Ask `report-generator` for the version the finance lead will read:

```text
Turn this comparison into a one-page HTML report with the table, the recommendation and the cost over three years including each vendor's escalation, and also export it as PDF.
```

The skill builds the HTML with Jinja2 and writes the PDF with WeasyPrint (which needs the Pango system library installed). The three-year cost is computed by the agent's code, not estimated by the model, so ask it to show the arithmetic.

### Step 3: Build the Renewal Calendar

Save this script as `renewals.py` next to `contracts.csv`. It computes the cancel-by date (renewal date minus notice days), writes the calendar sorted by urgency, and prints the 90, 60 and 30-day alerts:

```python
import csv
import sys
from datetime import date, timedelta

ALERT_DAYS = (90, 60, 30)


def load(path):
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            renewal = date.fromisoformat(row["renewal_date"])
            notice = int(row["cancel_notice_days"])
            yield {
                "vendor": row["vendor"],
                "annual_value": int(row["annual_value"]),
                "renewal_date": renewal,
                "cancel_by": renewal - timedelta(days=notice),
                "auto_renew": row["auto_renew"].strip().lower() == "yes",
            }


def main(path, today):
    rows = sorted(load(path), key=lambda r: r["cancel_by"])
    with open("vendor_renewal_calendar.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["vendor", "renews", "cancel_by", "annual_value", "auto_renew"])
        for r in rows:
            w.writerow([r["vendor"], r["renewal_date"], r["cancel_by"],
                        r["annual_value"], "yes" if r["auto_renew"] else "no"])
    for r in rows:
        if not r["auto_renew"]:
            continue
        left = (r["cancel_by"] - today).days
        if left < 0:
            print(f"MISSED  {r['vendor']}: cancel window closed {-left} days ago")
        elif any(left <= d for d in ALERT_DAYS):
            stage = min(d for d in ALERT_DAYS if left <= d)
            print(f"{stage}-DAY  {r['vendor']}: cancel by {r['cancel_by']} "
                  f"({left} days), ${r['annual_value']:,}/yr")


if __name__ == "__main__":
    main(sys.argv[1], date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else date.today())
```

Run it with an explicit date to see what is due:

```console
$ python3 renewals.py contracts.csv 2026-11-05
30-DAY  Email Platform: cancel by 2026-12-03 (28 days), $6,200/yr
60-DAY  Acme Monitoring: cancel by 2026-12-16 (41 days), $8,400/yr
60-DAY  CI/CD Suite: cancel by 2026-12-29 (54 days), $12,000/yr
```

`vendor_renewal_calendar.csv` imports into Linear, Asana or any tracker that accepts CSV, one ticket per cancel-by date. The calendar also shows clustering: if eight contracts renew in April, start those evaluations in January.

### Step 4: Run the Alerts on a Schedule

A calendar nobody opens does not prevent a missed window. Run the script daily from cron or a CI schedule and send its output to the channel the team reads:

```console
$ crontab -l
0 8 * * 1-5  cd /srv/vendor-renewals && python3 renewals.py contracts.csv | mail -s "Vendor renewals" ops@example.com
```

When a contract shows up at the 90-day mark, hand it back to the agent for the decision memo:

```text
Acme Monitoring renews 2027-01-15 and the cancel-by date is 2026-12-16. Summarize its terms from contracts/acme-monitoring.pdf, list what we have used it for in the last year (I will paste the usage numbers), and recommend renew, renegotiate or cancel. Give the last date to act without penalty.
```

The agent can only compare against alternatives you give it or can look up with a search tool; ask it to cite where each competing price came from, and verify it before you use it as leverage in a negotiation. The 90/60/30 cadence leaves time to evaluate at 90 days, negotiate at 60 and decide at 30.

## Real-World Example

Soren, the operations lead at the company, has to cut SaaS spend by 15% before next fiscal year, with a plan due to the CEO in two weeks. He drops all 28 contracts into a folder and runs the extraction. The scanned ones take extra time and he corrects four wrong notice periods by hand.

The first calendar surfaces two urgent items: a $12,000 CI/CD contract that auto-renews in three weeks (the team moved to GitHub Actions six months ago and nobody cancelled the old one), and a monitoring tool they already replaced that renews for $8,400. That is $20,400 from contracts that should have been cancelled months ago.

The comparison finds three overlapping analytics tools, one per team, and consolidating to one saves $22,000 a year. Soren imports the calendar into Linear with a ticket per cancellation window and puts `renewals.py` on a weekday schedule. The plan reaches the CEO with a savings timeline and a calendar that runs 12 months ahead, and the next person who inherits the vendor stack gets the warning 90 days before a window closes.
