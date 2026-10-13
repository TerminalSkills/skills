---
name: contract-review
description: >-
  Analyze contracts for risks, check completeness, and provide actionable
  recommendations. Use when a user asks to review a contract, check an agreement
  for red flags, analyze contract terms, find risky clauses, review an NDA,
  evaluate a service agreement, or audit employment contract terms. Supports
  employment contracts, NDAs, service agreements, and vendor contracts.
license: Apache-2.0
compatibility: "Requires Python 3.9+ with pdfplumber (or PyMuPDF) for PDFs and python-docx for DOCX"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: documents
  tags: ["contract", "legal", "review", "risk-analysis", "compliance"]
  use-cases:
    - "Review employment contracts before signing to identify unfavorable terms"
    - "Audit vendor agreements for missing clauses and liability risks"
    - "Compare contract versions to detect changes in key terms"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Contract Review

## Overview

Analyze legal contracts and agreements to identify risks, missing clauses, unfavorable terms, and compliance issues. This skill reads contract documents, categorizes clauses, flags potential problems, and produces a structured risk report with actionable recommendations.

## Instructions

When a user asks you to review, analyze, or check a contract, follow these steps:

### Step 1: Load and parse the contract

Read the contract file. Supported formats include PDF, DOCX, TXT, and Markdown.

For PDF files, extract text using pdfplumber:

```python
import pdfplumber

def load_contract(pdf_path):
    full_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n\n"
    return full_text
```

For DOCX files, use python-docx:

```python
from docx import Document

def load_docx(docx_path):
    doc = Document(docx_path)
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    # Fee schedules, SLAs and signature blocks often live in tables
    for table in doc.tables:
        for row in table.rows:
            parts.append(" | ".join(cell.text.strip() for cell in row.cells))
    return "\n\n".join(parts)
```

Legacy `.doc` files are not supported by python-docx: convert them to DOCX or PDF first. If `extract_text()` returns nothing, the PDF is a scan and needs OCR (Tesseract) before review; tell the user the OCR text may contain errors in numbers and dates.

### Step 2: Identify the contract type

Determine the contract type from the content:
- **Employment contract**: Look for salary, benefits, termination, non-compete clauses
- **NDA / Confidentiality agreement**: Look for confidential information definitions, duration, exceptions
- **Service agreement / SaaS**: Look for SLA, liability caps, data handling, termination for convenience
- **Vendor / Supplier agreement**: Look for delivery terms, payment terms, warranties, indemnification

### Step 3: Extract and categorize key clauses

Identify and extract these critical sections:
1. **Parties**: Who is involved, are they correctly identified
2. **Term and termination**: Duration, renewal terms, termination conditions, notice periods
3. **Payment terms**: Amounts, schedule, late payment penalties, currency
4. **Liability and indemnification**: Liability caps, mutual vs one-sided indemnification
5. **Confidentiality**: Scope of confidential information, duration, exceptions
6. **Non-compete / Non-solicitation**: Geographic scope, duration, reasonableness
7. **Intellectual property**: Ownership, assignment, licensing rights
8. **Dispute resolution**: Jurisdiction, arbitration vs litigation, governing law
9. **Force majeure**: Events covered, notice requirements
10. **Data protection**: GDPR compliance, data processing terms, breach notification

### Step 4: Perform risk analysis

For each clause, assess:
- **Risk level**: High, Medium, or Low
- **Issue**: What is problematic or missing
- **Recommendation**: Specific change or addition to suggest

Flag these common red flags:
- One-sided indemnification without caps
- Automatic renewal without opt-out notice period
- Non-compete clauses exceeding 12 months or unreasonable geographic scope
- Missing limitation of liability
- Vague termination conditions
- No data protection or breach notification terms
- Missing force majeure clause
- Unclear IP ownership assignment

### Step 5: Generate the review report

Produce a structured report with:
1. Contract summary (type, parties, effective date, term)
2. Clause-by-clause analysis with risk ratings
3. Missing clauses that should be added
4. Top recommendations ranked by priority
5. Overall risk score (Low / Medium / High / Critical)

## Examples

### Example 1: Review an employment contract

**User request:** "Review my employment contract at ~/contracts/offer.pdf for any red flags"

**Actions taken:**
1. Extract text from offer.pdf
2. Identify as employment contract
3. Analyze each clause for risks
4. Flag issues found

**Output:**
```
CONTRACT REVIEW REPORT
======================
Type: Employment Contract
Parties: Maria Alvarez (Employee) <-> Brightwave Logistics LLC (Employer)
Term: Indefinite, starting March 1, 2027

RISK ANALYSIS:
-------------------------------------------------
| Clause              | Risk   | Issue                                    |
|---------------------|--------|------------------------------------------|
| Non-compete         | HIGH   | 24-month duration, nationwide scope       |
| Termination         | MEDIUM | No severance terms specified              |
| IP Assignment       | HIGH   | Covers all work, including personal projects |
| Benefits            | LOW    | Standard package, clearly defined         |
| Confidentiality     | LOW    | Reasonable scope and 2-year duration      |

MISSING CLAUSES:
- No remote work policy or location flexibility terms
- No bonus or equity vesting schedule details

TOP RECOMMENDATIONS:
1. Negotiate non-compete down to 6-12 months with limited geography
2. Add carve-out for personal projects in IP assignment clause
3. Request explicit severance terms (e.g., 2 weeks per year of service)

OVERALL RISK: HIGH - Address non-compete and IP clauses before signing
```

### Example 2: Audit a SaaS service agreement

**User request:** "Check this vendor agreement for our SaaS tool. Flag anything we should push back on."

**Actions taken:**
1. Parse the service agreement
2. Check for standard SaaS contract terms
3. Compare against best practices for data protection and SLAs

**Output:**
```
CONTRACT REVIEW REPORT
======================
Type: SaaS Service Agreement
Parties: Fernhill Design Studio (Customer) <-> Cloudlane Software Inc. (Vendor)
Term: 12 months, auto-renews

RISK ANALYSIS:
-------------------------------------------------
| Clause              | Risk     | Issue                                  |
|---------------------|----------|----------------------------------------|
| SLA / Uptime        | HIGH     | No uptime guarantee or credits defined |
| Data Processing     | HIGH     | No DPA or GDPR compliance language     |
| Liability Cap       | MEDIUM   | Capped at 1 month of fees (very low)   |
| Termination         | MEDIUM   | 90-day notice required to cancel        |
| Auto-renewal        | LOW      | 30-day opt-out window before renewal    |

TOP RECOMMENDATIONS:
1. Require a 99.9% uptime SLA with service credits
2. Add a Data Processing Agreement as an appendix
3. Negotiate liability cap to at least 12 months of fees
4. Reduce cancellation notice to 30 days
```

## Guidelines

- Always specify that this is an AI-assisted review and not legal advice. Recommend the user consult a lawyer for final decisions.
- Present risks in order of severity (High first) so the most important issues are seen immediately.
- When clauses are ambiguous, flag them as risks rather than assuming favorable interpretation.
- For multi-party contracts, analyze obligations and risks from the perspective of the user's party.
- If the contract references external documents (exhibits, schedules, addenda), note which ones are missing from the review.
- Enforceability depends on jurisdiction and governing law (for example, non-competes are void or heavily restricted in some US states and countries). State which law the contract names and flag that local counsel must confirm enforceability rather than asserting it.
- Compare terms against standard market practices for the contract type when assessing reasonableness.
- Keep the report concise. Use tables for clause analysis and bullet points for recommendations.
