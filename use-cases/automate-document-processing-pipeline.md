---
title: "Automate Document Processing Pipeline"
slug: automate-document-processing-pipeline
description: "Build an automated pipeline that parses, splits, merges, and reorganizes large document collections based on content type and metadata extraction."
skills:
  - doc-parser
  - pdf-merge-split
category: documents
tags:
  - document-processing
  - pdf
  - automation
  - file-management
---

# Automate Document Processing Pipeline

## The Problem

An accounting firm receives 200-300 documents per week from clients during tax season: bank statements, W-2 forms, 1099s, receipts, mortgage interest statements, and charitable donation letters. Clients dump everything into a shared folder as multi-page PDFs, sometimes combining 15 different document types into a single scan.

Staff spend 12 hours per week just sorting, splitting, and renaming files before any actual accounting work begins. Last year, a missing 1099-DIV was not caught until April 10th, forcing an extension filing and an unhappy client conversation.

## The Solution

Use the **doc-parser** skill (Docling) to turn every page into text with layout, so the agent can identify the document type and pull out the key fields. Use the **pdf-merge-split** skill (pypdf) to split combined scans at the detected boundaries, rename files from their content, and merge related documents into bookmarked packages in organized client folders.

Tax documents hold Social Security numbers and account numbers. Run the whole pipeline on a machine the firm controls: Docling and pypdf both work locally, so nothing has to leave the building. Treat client PDFs as untrusted input and keep the working folders private to the staff who need them.

## Step-by-Step Walkthrough

### 1. Parse and classify incoming documents

Docling does not name document types itself; it returns the text, tables and reading order of each page, and OCRs scanned pages. The agent classifies each page from that text (a W-2 prints "Form W-2 Wage and Tax Statement", a 1099-INT prints "Form 1099-INT", and so on). Set up once:

```console
$ python -m venv .venv && .venv/bin/pip install docling pypdf
```

Then ask:

> Process every PDF in /incoming/2027-02/. Convert each file with Docling, then for each page (use `doc.export_to_markdown(page_no=n)` for n from 1 to `doc.num_pages()`) classify it as one of: W-2, 1099-INT, 1099-DIV, 1099-MISC, 1099-NEC, bank-statement, mortgage-interest-1098, charitable-donation, medical-receipt, business-expense, property-tax, or unknown. Extract document date, payer or institution, recipient name and dollar amounts. Write a classification report: file name, page ranges per document type, extracted metadata, and a confidence note for every page you were unsure about.

Clients scan documents in arbitrary order, so one PDF might hold a W-2, three receipts, two pages of a bank statement, and then another W-2 from a different employer. A page with no readable text or form title is classified `unknown` and goes to a person; do not let the agent guess. Scanned pages go through OCR, so check dollar amounts against the page image before relying on them.

### 2. Split combined scans into individual documents

Separate multi-document PDFs at the boundaries from the classification report:

> Using the classification report, split each multi-document PDF into individual files with pypdf. The file "johnson_family_docs.pdf" contains pages 1-2 (W-2 from Medtronic), pages 3-4 (1099-INT from Chase Bank), pages 5-7 (mortgage statement from Wells Fargo), and pages 8-15 (receipts). Split into 4 separate files named [client-name]_[doc-type]_[institution]_[year].pdf, for example johnson_w2_medtronic_2026.pdf. Never modify the originals, and report the page count of every output file.

The core of the split is a few lines of pypdf (page numbers are 0-based in code, 1-based in the report):

```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("johnson_family_docs.pdf")
writer = PdfWriter()
for page_index in range(0, 2):          # report pages 1-2
    writer.add_page(reader.pages[page_index])
with open("johnson_w2_medtronic_2026.pdf", "wb") as f:
    writer.write(f)
```

Consistent naming answers "which file has the Chase 1099?" at a glance, and makes a missing document visible when scanning a folder.

### 3. Validate received documents against the client's checklist

Cross-reference the parsed documents with the client's tax checklist to find what is missing:

> Compare the documents received from the Johnson family against their checklist: 2 W-2s (both spouses), 1099-INT from Chase Bank, 1099-DIV from Vanguard, mortgage interest statement from Wells Fargo, property tax receipt from Franklin County, and charitable donation receipts totaling at least $3,200. Report what was received, what is missing, and any unexpected documents not on the checklist.

Missing-document detection is the highest-value part of the pipeline. Catching a missing 1099-DIV in February avoids a scramble in April when the preparer finds the gap mid-filing. The output is a list for the preparer to confirm; a person decides what to send to the client.

### 4. Merge related documents into client packages

Combine the classified files into one package per category, in a fixed order, with a bookmark per source document:

> For each client folder in /clients/, merge the files into [client]_income_documents.pdf (all W-2s and 1099s), [client]_deductions.pdf (mortgage interest, property tax, charitable donations, medical receipts) and [client]_business.pdf (business expenses and 1099-NECs). Use `PdfWriter.append(path, outline_item=...)` so each source file gets a bookmark named after it. Put the results in /ready-for-review/[client-name]/ and list each package with its page count.

```python
import os
from pypdf import PdfWriter

def merge_pdfs(input_paths, output_path):
    writer = PdfWriter()
    for path in input_paths:
        writer.append(path, outline_item=os.path.splitext(os.path.basename(path))[0])
    writer.write(output_path)
    writer.close()
```

The bookmarks appear in the PDF viewer's sidebar, so a preparer can jump between the W-2 and the 1099-INT inside a 40-page package instead of paging through it.

### 5. Generate a weekly intake summary

> Generate the weekly intake report for February 8-12, 2027. Show: documents received (count and pages), documents classified versus flagged `unknown`, documents per client, clients with a complete document set, clients with missing required documents, the five clients with the most documents, and every file that failed parsing and needs manual review.

Clients with complete sets move into the preparation queue. For clients with missing items, the agent drafts a reminder listing exactly what is needed, and a staff member reviews and sends it.

## Real-World Example

On a Monday morning, 47 new files arrive from 12 clients. The pipeline classifies 189 pages across them and identifies 67 individual documents: 14 W-2s, 23 1099 variants, 8 mortgage statements, and 22 receipt scans. Three clients uploaded everything as one combined scan; those are split into 31 files. The checklist comparison shows that 8 of the 12 clients are still missing at least one required document, and drafts the reminders for the staff to send. The 11 `unknown` pages go to a staff member for a quick look.

The merged packages go into the review queue. The firm's senior accountant reports that the organized, bookmarked packages cut her per-client review time because she no longer hunts for specific documents. What used to take a staff member all of Monday and half of Tuesday is done before the first coffee break.

## Related Skills

- [doc-parser](../skills/doc-parser/SKILL.md) — Docling parsing of PDFs and scans into Markdown and structured data
- [pdf-merge-split](../skills/pdf-merge-split/SKILL.md) — pypdf merging, splitting and page extraction
