---
title: "Extract Data from Complex Documents with OCR"
slug: extract-data-from-complex-documents-with-ocr
description: >-
  Automate data extraction from complex documents — scanned forms with mixed
  printed and handwritten text, tables, checkboxes, and signatures — using
  Chandra OCR with confidence-based human review routing.
skills:
  - chandra-ocr
  - anthropic-sdk
category: documents
tags:
  - ocr
  - document-processing
  - forms
  - automation
  - data-extraction
---

# Extract Data from Complex Documents with OCR

## The Situation

Meridian Insurance receives 500 claim forms daily. Each form is a mix of printed text, handwritten entries, tables with dollar amounts, checkboxes, and signatures. Currently, 8 data entry clerks manually type every field into the claims processing system — a slow, error-prone process costing $400K/year in labor.

They want to automate extraction with OCR, routing only low-confidence fields to human reviewers.

**Goal:** 90% automation rate, reduce team from 8 clerks to 2.

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Document Intake Pipeline             │
├──────────┬───────────┬────────────┬───────────────┤
│ Scanner  │ Layout    │ OCR        │ Confidence    │
│ Import   │ Analyzer  │ Engine     │ Router        │
│ (PDF/IMG)│ (Chandra) │ (Chandra)  │               │
└────┬─────┴─────┬─────┴──────┬─────┴───────┬───────┘
     │           │            │             │
     ▼           ▼            ▼             ▼
┌──────────────────────────────────────────────────┐
│         Structured Data Output (JSON)             │
├──────────────────┬───────────────────────────────┤
│ Auto-approved    │ Human Review Queue             │
│ (conf > 0.85)    │ (conf ≤ 0.85)                  │
└────────┬─────────┴──────────┬────────────────────┘
         │                    │
         ▼                    ▼
┌──────────────────────────────────────────────────┐
│          Claims Processing System (API)           │
└──────────────────────────────────────────────────┘
```

## Step 1: Document Intake

```python
import os
import glob
from datetime import datetime

INTAKE_DIR = "./intake/"
PROCESSED_DIR = "./processed/"
REVIEW_DIR = "./review/"

def get_pending_documents():
    """Scan intake directory for new claim forms."""
    files = glob.glob(os.path.join(INTAKE_DIR, "*.pdf"))
    files += glob.glob(os.path.join(INTAKE_DIR, "*.jpg"))
    files += glob.glob(os.path.join(INTAKE_DIR, "*.png"))
    files += glob.glob(os.path.join(INTAKE_DIR, "*.tiff"))
    return sorted(files, key=os.path.getmtime)
```

## Step 2: Layout Detection

```python
from chandra import OCR

ocr = OCR(device="cuda")  # GPU for production throughput

def analyze_document(file_path: str):
    """Detect layout and classify document regions."""
    result = ocr.read(
        file_path,
        mode="mixed",           # Handle both print and handwriting
        preserve_layout=True,
        extract_tables=True,
        analyze_layout=True,
        dpi=300,
    )

    layout = {
        "pages": len(result.pages),
        "regions": [],
    }

    for page in result.pages:
        for element in page.layout:
            layout["regions"].append({
                "type": element.type,       # header, table, handwriting, checkbox, signature
                "bbox": element.bbox,
                "page": page.number,
                "confidence": element.confidence,
            })

    return result, layout
```

## Step 3: Extract Structured Fields

```python
CLAIM_FIELDS = [
    "claim_number", "policy_number", "claimant_name",
    "date_of_loss", "loss_type", "loss_description",
    "amount_claimed", "deductible", "provider_name",
    "provider_npi", "diagnosis_code", "procedure_code",
    "date_of_service", "billed_amount", "allowed_amount",
]

def extract_fields(result) -> dict:
    """Map OCR blocks to claim form fields."""
    extracted = {}

    for block in result.blocks:
        field_match = match_to_field(block.label, CLAIM_FIELDS)
        if field_match:
            extracted[field_match] = {
                "value": block.text.strip(),
                "confidence": block.confidence,
                "type": block.type,  # print or handwriting
                "bbox": block.bbox,
            }

    # Extract table data (itemized charges)
    for table in result.tables:
        extracted["line_items"] = {
            "value": table.to_dict(),
            "confidence": min(cell.confidence for cell in table.cells),
            "type": "table",
        }

    return extracted

def match_to_field(label: str, fields: list) -> str | None:
    """Fuzzy match OCR label to expected field name."""
    label_lower = label.lower().strip().replace(":", "")
    field_map = {
        "claim #": "claim_number",
        "claim no": "claim_number",
        "policy #": "policy_number",
        "policy no": "policy_number",
        "patient name": "claimant_name",
        "member name": "claimant_name",
        "date of loss": "date_of_loss",
        "date of incident": "date_of_loss",
        "total claimed": "amount_claimed",
        "amount": "amount_claimed",
        # ... more mappings
    }
    return field_map.get(label_lower)
```

## Step 4: Confidence-Based Routing

```python
CONFIDENCE_THRESHOLD = 0.85

def route_document(extracted: dict, file_path: str) -> dict:
    """Route to auto-approval or human review based on confidence."""

    low_confidence_fields = {
        k: v for k, v in extracted.items()
        if v["confidence"] < CONFIDENCE_THRESHOLD
    }

    needs_review = bool(low_confidence_fields)

    result = {
        "file": file_path,
        "timestamp": datetime.now().isoformat(),
        "fields": {k: v["value"] for k, v in extracted.items()},
        "needs_review": needs_review,
        "review_fields": list(low_confidence_fields.keys()),
        "avg_confidence": sum(v["confidence"] for v in extracted.values()) / len(extracted),
    }

    if needs_review:
        # Add context for reviewer
        result["review_context"] = {
            field: {
                "extracted_value": extracted[field]["value"],
                "confidence": extracted[field]["confidence"],
                "type": extracted[field]["type"],
            }
            for field in low_confidence_fields
        }

    return result
```

## Step 5: Submit to Claims System

```python
import requests
import json
import shutil

API_URL = "https://claims.meridian-insurance.com/api/v1/claims"
API_KEY = os.environ["CLAIMS_API_KEY"]

def submit_claim(data: dict):
    """Push extracted data to claims processing system."""
    response = requests.post(
        API_URL,
        json=data["fields"],
        headers={"Authorization": f"Bearer {API_KEY}"},
    )
    response.raise_for_status()
    return response.json()

def queue_for_review(data: dict, file_path: str):
    """Move document to human review queue with extracted data."""
    review_file = os.path.join(REVIEW_DIR, os.path.basename(file_path))
    shutil.copy2(file_path, review_file)

    meta_file = review_file.replace(os.path.splitext(review_file)[1], ".json")
    with open(meta_file, "w") as f:
        json.dump(data, f, indent=2)
```

## Step 6: Full Pipeline

```python
def process_daily_claims():
    """Process all pending claim forms."""
    documents = get_pending_documents()
    print(f"Processing {len(documents)} documents...")

    stats = {"total": 0, "auto": 0, "review": 0, "errors": 0}

    for file_path in documents:
        try:
            stats["total"] += 1

            # OCR + layout analysis
            result, layout = analyze_document(file_path)

            # Extract structured fields
            extracted = extract_fields(result)

            # Route based on confidence
            routed = route_document(extracted, file_path)

            if routed["needs_review"]:
                queue_for_review(routed, file_path)
                stats["review"] += 1
                print(f"📋 {os.path.basename(file_path)}: "
                      f"review ({len(routed['review_fields'])} fields, "
                      f"avg conf: {routed['avg_confidence']:.2f})")
            else:
                submit_claim(routed)
                stats["auto"] += 1
                print(f"✅ {os.path.basename(file_path)}: "
                      f"auto-submitted (conf: {routed['avg_confidence']:.2f})")

            # Archive processed document
            shutil.move(file_path, os.path.join(PROCESSED_DIR, os.path.basename(file_path)))

        except Exception as e:
            stats["errors"] += 1
            print(f"❌ {os.path.basename(file_path)}: {e}")

    auto_rate = stats["auto"] / stats["total"] * 100 if stats["total"] > 0 else 0
    print(f"\n=== Daily Summary ===")
    print(f"Total: {stats['total']}")
    print(f"Auto-submitted: {stats['auto']} ({auto_rate:.0f}%)")
    print(f"Sent to review: {stats['review']}")
    print(f"Errors: {stats['errors']}")

process_daily_claims()
```

## Results

| Metric | Before | After |
|--------|--------|-------|
| Documents per day | 500 | 500 |
| Staff required | 8 clerks | 2 reviewers |
| Processing time | 8 hours | 45 minutes |
| Automation rate | 0% | 90% |
| Error rate | 3.2% (human fatigue) | 1.1% (OCR + review) |
| Annual labor cost | $400K | $100K |

The 2 remaining clerks focus exclusively on the 10% of documents with low-confidence fields — typically poor-quality scans, unusual handwriting, or damaged forms. Their review takes about 2 hours per day instead of the full team working full shifts.

## Key Takeaways

- **Confidence thresholds are everything** — 0.85 is a good starting point, tune based on your error tolerance
- **GPU acceleration is critical** — CPU processing handles ~20 docs/hour vs ~200/hour on GPU
- **Mixed mode is essential** — most real-world forms have both printed and handwritten content
- **Pre-processing improves accuracy** — deskew, denoise, and normalize contrast before OCR
- **Start with a pilot** — run 100 documents through both OCR and manual entry, compare results to calibrate the threshold
- **Keep humans in the loop** — the goal is augmentation, not replacement. Reviewers catch the edge cases that build trust in the system
