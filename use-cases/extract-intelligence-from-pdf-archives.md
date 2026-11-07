---
title: "Extract Intelligence from PDF Archives"
slug: extract-intelligence-from-pdf-archives
description: "Process large collections of scanned and digital PDFs to extract structured data, answer questions across documents, and build searchable knowledge bases."
skills:
  - pdf-analyzer
  - pdf-ocr
  - markitdown
  - mineru
category: documents
tags:
  - pdf
  - ocr
  - document-intelligence
  - data-extraction
---

# Extract Intelligence from PDF Archives

## The Problem

A real estate investment firm has about 2,400 PDF documents accumulated over eight years: property appraisals, lease agreements, inspection reports and financial statements. Roughly half are scanned paper with no searchable text.

When an analyst needs to compare cap rates across 15 properties or find every lease expiring in the next six months, they open documents one by one. A due diligence review means reading 40-60 documents to find the relevant figures, and last year the firm missed a renewal deadline because the expiration clause sat on page 14 of a scanned agreement.

## The Solution

Four skills split the job by document type. **pdf-analyzer** checks which files have a text layer and pulls text and tables from the digital ones. **pdf-ocr** (with OCRmyPDF) adds a text layer to the scans and reports per-page OCR confidence. **mineru** parses the hard layouts (multi-column pages, scanned tables) into Markdown. **markitdown** converts everything else in the archive (Word leases, Excel rent rolls) so the whole collection ends up as one folder of Markdown the agent can search and cite.

## Step-by-Step Walkthrough

### 1. Sort the archive into digital and scanned

> Go through /property-docs/ recursively. For each PDF, open it with pdfplumber and check the first three pages: a file with no extractable text on a page that has images is scanned. Write `inventory.csv` with path, page count, `digital` or `scanned`, and whether it is password-protected. Do not modify any file.

Running OCR over files that already have text wastes hours and can degrade them, so the sort comes first. Encrypted files show up as errors here; ask for the password rather than guessing.

### 2. OCR the scanned backlog

> For every `scanned` file in `inventory.csv`, run OCRmyPDF into /property-docs-ocr/, mirroring the folder structure: `ocrmypdf -l eng --deskew --rotate-pages --skip-text --sidecar <name>.txt -j 4 in.pdf out.pdf`. Then OCR each page's image with pytesseract and record the mean word confidence per page. List every page below 85% in `review.csv` for manual checking.

OCRmyPDF keeps the original page images and adds an invisible text layer, so the output is a searchable PDF that still looks like the original, plus the `--sidecar` plain text. `--skip-text` leaves pages that already have text alone; without it OCRmyPDF stops with `PriorOcrFoundError` on mixed files. Early-year scans are the worst, and a misread "3" versus "8" in an appraisal is the dangerous kind of error, which is why low-confidence pages go to a person instead of into the dataset.

### 3. Convert the archive to citable Markdown

> Convert every PDF to Markdown, one `.md` per document in /property-docs-md/, with the source path in a header line. Use `mineru-kit parse <dir> -o <outdir> --tier basic` for the scanned PDFs and any file with tables or two columns; use `markitdown` for the Word and Excel files. Log failures to `failed.txt` and carry on.

```console
$ mineru-kit parse ./scanned-appraisals -o ./md/appraisals --tier basic
$ markitdown leases/harbour-street-lease.docx -o md/leases/harbour-street-lease.md || echo leases/harbour-street-lease.docx >> failed.txt
```

`mineru-kit parse` writes plain Markdown with no page markers, so to get page numbers for citations also run it with `--format middle_json` (every page entry in the JSON carries a `page_idx`; check whether it counts from 0 in your release) or parse in `--pages` ranges. `mineru-kit parse` on a directory handles one level (not recursive) and fails the whole batch if two inputs share a base name, so run it per folder. The `basic` tier downloads its models first (`mineru-kit models download --tier basic`) and works on CPU. MinerU parses locally unless you pass `--remote`; do not use that flag on confidential leases and appraisals. For documents too long to read in one pass, the `mineru` document library (`mineru parse`, `mineru read`) gives stable page and block locators, but it needs a one-time managed parse-server setup described in the mineru skill.

### 4. Extract structured records

> From each appraisal Markdown file extract: property address, appraisal date, appraised value, cap rate, net operating income, gross rental income, vacancy rate, square footage, year built and appraiser. Write one CSV row per property plus `source_file` and `source_page` columns. If a field is not in the document, write `NOT_FOUND`; never infer it. Then run checks: cap rate = NOI / value within one percentage point, dates parse, and no value is negative. Send failing rows to `review.csv`.

Lease agreements work the same way with a different field list (tenant, unit, start and end date, monthly rent, escalation, deposit, renewal option, termination clauses) and JSON output. For digital PDFs with clean ruled tables, pdf-analyzer's pdfplumber extraction is faster than a model-based parse, and gives you exact cell text. The `NOT_FOUND` rule matters: a system that guesses creates false confidence, and the arithmetic checks catch OCR and extraction mistakes before they reach a spreadsheet.

### 5. Ask questions across the archive

> Search /property-docs-md/ and the CSVs to answer: the average cap rate of properties appraised in 2025; the five properties with the highest vacancy rate; any inspection report mentioning structural concerns or deferred maintenance; every lease with escalation below 3% that ends within 18 months. Quote the source file and page for every figure, and say when an answer rests on a page that is in `review.csv`.

Compute the numbers from the CSV rather than asking the model to do the arithmetic, and use text search (`grep`, `ripgrep`) over the Markdown for clause questions such as "structural". For a full due diligence summary on one address, search every document for that address and organize the result as Property Overview, Financial Summary, Tenant Roster, Physical Condition and Risk Factors, each figure with its citation so the analyst can open the page and verify it.

## Real-World Example

An analyst preparing a sale of a 12-property industrial portfolio ran the pipeline over the 180 PDFs for those properties. The scans went through OCRmyPDF overnight; a few dozen pages were flagged for a manual read and corrected. The extraction produced one appraisal row per property and one lease record per active tenant. The cross-document query then listed the leases ending within 14 months and the properties below the target cap rate, and the summary cited a page for every number. Reading the flagged pages also turned up an inspection report with six figures of deferred roof maintenance missing from the operating budget, which the team used in pricing. The saving is the analyst's time spent verifying figures instead of finding them; the checks in step 4 are what make the output trustworthy enough to rely on.

## Related Skills

- [pdf-analyzer](/skills/pdf-analyzer) — detects scanned versus digital PDFs and extracts text and tables with pdfplumber
- [pdf-ocr](/skills/pdf-ocr) — OCRmyPDF searchable-PDF output, sidecar text and per-page confidence for the scanned backlog
- [markitdown](/skills/markitdown) — converts Word, Excel and mixed office files to Markdown so the whole archive is searchable in one format
- [mineru](/skills/mineru) — layout-aware local parsing of multi-column and table-heavy PDFs into Markdown with page locators
