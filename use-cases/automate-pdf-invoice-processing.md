---
title: "Automate PDF Invoice Processing"
slug: automate-pdf-invoice-processing
description: "Build an automated pipeline that extracts data from PDF invoices, validates and normalizes the information, exports to spreadsheets, and feeds into a billing system."
skills: [pdf-analyzer, data-extractor, excel-processor, billing-automation]
category: business
tags: [pdf, invoices, automation, data-extraction, billing, accounting]
---

# Automate PDF Invoice Processing

## The Problem

Marta manages accounts payable for a mid-size agency that receives 200+ vendor invoices per month as PDF attachments. Each vendor uses a different format — some are machine-generated PDFs, some are scanned paper invoices, and a few are just photos of receipts. She manually opens each one, types the amounts into a spreadsheet, cross-references with purchase orders, and enters everything into the billing system. It takes two full days every month and errors creep in regularly.

## The Solution

Use **pdf-analyzer** to parse and understand the structure of each invoice PDF, **data-extractor** to pull out the key fields (vendor, amount, date, line items), **excel-processor** to generate validated spreadsheet reports, and **billing-automation** to push approved invoices into the billing system. The pipeline handles different PDF formats automatically and flags anything it's uncertain about.

## Step-by-Step Walkthrough

### 1. Analyze and classify incoming invoice PDFs

```text
I have a folder of 50 sample invoice PDFs from our top vendors. They're
a mix of machine-generated PDFs, scanned documents, and a few image-only
PDFs. Analyze them and tell me what we're dealing with — which ones have
extractable text, which need OCR, and what the common layouts look like.
```

```text
Analyzed 50 PDF invoices from ./invoices/samples/:

Classification results:
  Machine-generated (extractable text): 32 PDFs (64%)
    Clean text layer, structured layouts
    Common generators: QuickBooks, Xero, FreshBooks, custom HTML-to-PDF

  Scanned documents (need OCR): 14 PDFs (28%)
    Image-only pages, no text layer
    Quality: 10 high-res (300+ DPI), 4 low-res (150 DPI or less)

  Image-based (photos/screenshots): 4 PDFs (8%)
    Phone photos embedded as single-page PDFs
    2 are rotated, 1 has poor lighting

Layout patterns identified:
  Pattern A (38%): Header with logo, invoice # top-right, table of line items,
    total at bottom-right — standard accounting software output
  Pattern B (26%): Letterhead style, amounts inline with descriptions,
    no table structure
  Pattern C (20%): European format — comma decimals, DD.MM.YYYY dates,
    VAT breakdown section
  Pattern D (16%): Minimal — just amounts and a reference number, no line items

Created invoice_pipeline/classifiers.py — Auto-detects PDF type and layout
```

### 2. Extract structured data from each invoice

```text
Build the extraction pipeline. For each invoice, I need: vendor name,
invoice number, invoice date, due date, currency, line items (description,
quantity, unit price, total), subtotal, tax, and grand total. Handle the
European date and number formats too.
```

```text
Created invoice_pipeline/extract.py — Multi-strategy extraction:

  Strategy 1 — Machine-generated PDFs:
    Uses pdfplumber for text extraction
    Regex patterns for invoice numbers: INV-\d+, #\d+, Invoice \d+
    Date detection: handles MM/DD/YYYY, DD.MM.YYYY, YYYY-MM-DD, "January 5, 2025"
    Table extraction: pdfplumber.extract_tables() for line items
    Currency detection: $, €, £, or ISO code in header

  Strategy 2 — Scanned/image PDFs:
    OCR via Tesseract (pytesseract)
    Pre-processing: deskew, contrast enhancement, binarization
    Same regex patterns applied to OCR output
    Confidence score per field based on OCR confidence values

  Strategy 3 — Low-quality images:
    Enhanced pre-processing: adaptive thresholding, noise removal
    Multiple OCR passes with different PSM modes
    Fields below 70% confidence flagged for manual review

  Output schema per invoice:
    {
      "vendor": "Bright Studio Design",
      "invoiceNumber": "INV-2025-0847",
      "invoiceDate": "2025-01-15",
      "dueDate": "2025-02-14",
      "currency": "EUR",
      "lineItems": [
        { "description": "Logo redesign", "qty": 1, "unitPrice": 2500.00, "total": 2500.00 },
        { "description": "Brand guidelines document", "qty": 1, "unitPrice": 1800.00, "total": 1800.00 }
      ],
      "subtotal": 4300.00,
      "tax": 817.00,
      "taxRate": 0.19,
      "grandTotal": 5117.00,
      "confidence": 0.94,
      "flags": []
    }
```

### 3. Validate extracted data and flag anomalies

```text
Add validation rules: line items should sum to subtotal, tax should match
the rate times subtotal, due date should be after invoice date, and no
required field should be empty. Also check for duplicate invoice numbers
across the batch.
```

```text
Created invoice_pipeline/validate.py — Validation engine:

  Rule 1 — Line item math:
    sum(lineItems.total) must equal subtotal (tolerance: ±0.02 for rounding)
    Each lineItem: qty × unitPrice must equal total (tolerance: ±0.01)
    Flag: "LINE_ITEM_MISMATCH" if off by more than tolerance

  Rule 2 — Tax calculation:
    tax must equal subtotal × taxRate (tolerance: ±0.05)
    Auto-detects common tax rates: 19%, 21%, 20%, 7%, 10%, 25%
    Flag: "TAX_MISMATCH" if rate doesn't match any known rate

  Rule 3 — Date logic:
    dueDate must be after invoiceDate
    invoiceDate must not be in the future (more than 1 day tolerance)
    Flag: "DATE_ANOMALY" if violated

  Rule 4 — Required fields:
    vendor, invoiceNumber, invoiceDate, grandTotal must not be empty
    Flag: "MISSING_REQUIRED" with field name

  Rule 5 — Duplicate detection:
    Check invoiceNumber + vendor combination across all invoices in batch
    Also check across historical data in processed_invoices.json
    Flag: "POSSIBLE_DUPLICATE"

  Validation report on 50 samples:
    Clean (no flags): 39 invoices (78%)
    Minor flags (rounding): 6 invoices (12%)
    Needs review: 5 invoices (10%) — 3 OCR issues, 2 missing fields
```

### 4. Export to structured Excel report

```text
Generate an Excel report with three sheets: a summary of all invoices,
a detailed line-items sheet, and a flagged-for-review sheet. Add
conditional formatting — highlight overdue invoices in red, flag
amounts over $10,000 in yellow.
```

```text
Created invoice_pipeline/export.py — Excel report generator:

  Sheet 1 — "Invoice Summary":
    Columns: Vendor, Invoice #, Date, Due Date, Currency, Subtotal, Tax, Total, Status
    Sorted by due date ascending
    Conditional formatting:
      Red fill: due date < today AND status != 'paid'
      Yellow fill: grandTotal > 10,000
      Green text: status = 'paid'
    Auto-filter on all columns
    Freeze top row

  Sheet 2 — "Line Items":
    Columns: Invoice #, Vendor, Description, Qty, Unit Price, Line Total
    Grouped by invoice number
    Subtotals per invoice (Excel SUBTOTAL formula)

  Sheet 3 — "Needs Review":
    Columns: Invoice #, Vendor, Flag Type, Flag Detail, Confidence Score, PDF Path
    Only invoices with validation flags
    Hyperlinks in PDF Path column to open the original file

  Footer on each sheet: "Generated {timestamp} — {count} invoices processed"
  Output: reports/invoices_{YYYY-MM}.xlsx

  File size for 200 invoices: ~350KB
```

### 5. Push approved invoices into the billing system

```text
After I review the flagged invoices and fix any issues, push all approved
invoices into our billing system. We use a REST API — I'll give you the
endpoint. Create payment schedules based on due dates and send a summary
notification.
```

```text
Created invoice_pipeline/sync_billing.py — Billing system integration:

  Input: reads validated invoices from invoice_data/approved.json
  (After manual review, move fixed invoices from flagged → approved)

  API integration:
    POST /api/v1/payables — create payable record
    Payload maps extracted fields to billing system schema:
      vendor_id: looked up from vendor name mapping (vendor_map.json)
      amount, currency, due_date, reference (invoice number)
      line_items: array of { description, amount }

    New vendors auto-created: POST /api/v1/vendors
    Logs all API responses for audit trail

  Payment scheduling:
    Groups invoices by due date week
    Creates payment batches: batch_{YYYY}_{week}.json
    Priority: overdue first, then by amount descending

  Summary notification (stdout + optional webhook):
    "February 2025 Invoice Processing Complete
     Processed: 207 invoices
     Total value: €148,392.00
     Approved & synced: 198
     Flagged for review: 9
     New vendors created: 3
     Next payment batch: €42,100 due Feb 21"

  Audit log: invoice_pipeline/logs/sync_{timestamp}.json
    Every API call, response code, and mapped data recorded
```

## Real-World Example

Kai handles procurement for a growing design studio with 40 freelance contractors. Monthly invoice processing was eating three days of admin time and payment delays were straining contractor relationships. After setting up this pipeline, the PDF folder gets batch-processed in under 10 minutes. The Excel report goes to the finance lead for a quick review of flagged items, and approved invoices sync to the billing system automatically. Processing time dropped from three days to two hours (mostly spent reviewing the 8-12% that get flagged), and late payments dropped to near zero.
