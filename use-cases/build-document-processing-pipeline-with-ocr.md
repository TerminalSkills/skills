---
title: Build a Document Processing Pipeline with OCR
slug: build-document-processing-pipeline-with-ocr
description: Build an automated document processing system using Tesseract for OCR text extraction, OpenCV for image preprocessing, and AWS Lambda for serverless scaling — processing invoices, receipts, and contracts uploaded by users, extracting structured data, and routing to the appropriate business system.
skills: [tesseract, opencv, aws-lambda]
category: data-ai
tags: [ocr, document-processing, automation, serverless, data-extraction]
---

# Build a Document Processing Pipeline with OCR

Kenji manages accounts payable at a logistics company that receives 500+ invoices per month via email — PDFs, photos of paper invoices, and scanned documents. A team of 3 data entry clerks manually types invoice data (vendor, amount, date, line items) into the ERP system. Error rate is 4%, and processing takes 3-5 days per batch.

Kenji builds an automated pipeline: documents are uploaded to S3, Lambda triggers OCR processing with Tesseract, OpenCV preprocesses poor-quality scans, and structured data is extracted and validated before entering the ERP.

## Step 1: Image Preprocessing with OpenCV

Scanned invoices are often skewed, low-contrast, or noisy. Preprocessing dramatically improves OCR accuracy.

```python
# src/preprocessing.py — Image optimization for OCR
import cv2
import numpy as np
from typing import Tuple

def preprocess_document(image_bytes: bytes) -> Tuple[np.ndarray, dict]:
    """Preprocess a document image for optimal OCR accuracy.

    Args:
        image_bytes: Raw image bytes from S3

    Returns:
        Tuple of (processed image, preprocessing metadata)
    """
    # Decode image
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    meta = {"original_size": img.shape[:2]}

    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Detect and fix skew
    angle = detect_skew(gray)
    if abs(angle) > 0.5:                  # Only deskew if >0.5 degrees
        gray = rotate_image(gray, angle)
        meta["skew_corrected"] = round(angle, 2)

    # Denoise (removes scanner artifacts)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)

    # Adaptive thresholding (handles uneven lighting from phone photos)
    binary = cv2.adaptiveThreshold(
        denoised, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=15,
        C=8,
    )

    # Remove small noise blobs
    kernel = np.ones((2, 2), np.uint8)
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

    # Ensure minimum 300 DPI equivalent
    h, w = cleaned.shape
    if w < 2000:                          # Upscale small images
        scale = 2500 / w
        cleaned = cv2.resize(cleaned, None, fx=scale, fy=scale,
                             interpolation=cv2.INTER_CUBIC)
        meta["upscaled"] = round(scale, 2)

    meta["final_size"] = cleaned.shape[:2]
    return cleaned, meta


def detect_skew(gray: np.ndarray) -> float:
    """Detect document skew angle using Hough transform."""
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 100,
                             minLineLength=100, maxLineGap=10)
    if lines is None:
        return 0.0

    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(angle) < 45:               # Only near-horizontal lines
            angles.append(angle)

    return float(np.median(angles)) if angles else 0.0


def rotate_image(image: np.ndarray, angle: float) -> np.ndarray:
    """Rotate image to correct skew."""
    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(image, M, (w, h),
                           flags=cv2.INTER_CUBIC,
                           borderMode=cv2.BORDER_REPLICATE)
```

## Step 2: OCR and Data Extraction with Tesseract

```python
# src/extractor.py — Extract structured data from documents
import pytesseract
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

@dataclass
class InvoiceData:
    vendor_name: str
    invoice_number: str
    invoice_date: date | None
    due_date: date | None
    subtotal: Decimal | None
    tax: Decimal | None
    total: Decimal
    currency: str
    line_items: list[dict]
    confidence: float

def extract_invoice_data(processed_image) -> InvoiceData:
    """Extract structured invoice data from preprocessed image.

    Args:
        processed_image: OpenCV preprocessed image (numpy array)

    Returns:
        InvoiceData with extracted fields and confidence score
    """
    # Full page OCR
    text = pytesseract.image_to_string(processed_image, config="--psm 6")

    # Get word-level data with confidence scores
    word_data = pytesseract.image_to_data(
        processed_image,
        config="--psm 6",
        output_type=pytesseract.Output.DICT,
    )

    # Calculate overall confidence
    confidences = [int(c) for c in word_data["conf"] if int(c) > 0]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0

    # Extract fields using regex patterns
    invoice_number = extract_pattern(
        text, [
            r"Invoice\s*#?\s*[:.]?\s*(\w[\w-]+)",
            r"Inv\s*No\s*[:.]?\s*(\w[\w-]+)",
            r"Number\s*[:.]?\s*(\w[\w-]+)",
        ]
    )

    total = extract_amount(text, [
        r"Total\s*(?:Due)?\s*[:.]?\s*\$?([\d,]+\.?\d*)",
        r"Amount\s*Due\s*[:.]?\s*\$?([\d,]+\.?\d*)",
        r"Balance\s*Due\s*[:.]?\s*\$?([\d,]+\.?\d*)",
    ])

    invoice_date = extract_date(text, [
        r"(?:Invoice\s+)?Date\s*[:.]?\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})",
        r"(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4})",
    ])

    return InvoiceData(
        vendor_name=extract_vendor_name(text),
        invoice_number=invoice_number or "UNKNOWN",
        invoice_date=invoice_date,
        due_date=extract_date(text, [r"Due\s*(?:Date)?\s*[:.]?\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})"]),
        subtotal=extract_amount(text, [r"Subtotal\s*[:.]?\s*\$?([\d,]+\.?\d*)"]),
        tax=extract_amount(text, [r"Tax\s*[:.]?\s*\$?([\d,]+\.?\d*)"]),
        total=total or Decimal("0"),
        currency="USD",
        line_items=extract_line_items(text),
        confidence=round(avg_confidence, 1),
    )

def extract_pattern(text: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None
```

## Step 3: Serverless Pipeline with AWS Lambda

```python
# src/handler.py — Lambda function triggered by S3 upload
import json
import boto3
from preprocessing import preprocess_document
from extractor import extract_invoice_data

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("processed_invoices")

def handler(event, context):
    for record in event["Records"]:
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]

        # Download document
        response = s3.get_object(Bucket=bucket, Key=key)
        image_bytes = response["Body"].read()

        # Preprocess
        processed_image, meta = preprocess_document(image_bytes)

        # Extract data
        invoice = extract_invoice_data(processed_image)

        # Store results
        table.put_item(Item={
            "document_key": key,
            "vendor": invoice.vendor_name,
            "invoice_number": invoice.invoice_number,
            "total": str(invoice.total),
            "confidence": str(invoice.confidence),
            "status": "review" if invoice.confidence < 80 else "approved",
            "raw_text_s3": f"ocr-results/{key}.txt",
        })

        # Flag low-confidence results for human review
        if invoice.confidence < 80:
            send_review_notification(key, invoice)

    return {"processed": len(event["Records"])}
```

## Results

After 60 days, the pipeline processes 95% of invoices automatically. The 3 data entry clerks are reassigned to exception handling and vendor management.

- **Processing time**: 3-5 days → 45 seconds (upload to structured data)
- **Error rate**: 4% (manual) → 0.8% (OCR + validation rules)
- **Automation rate**: 78% fully automated, 17% flagged for quick review, 5% manual
- **OCR accuracy**: 94% average confidence (after preprocessing improves raw 71% to 94%)
- **Cost**: $0.003 per document (Lambda + S3) vs $4.20 per document (manual labor)
- **Monthly savings**: $2,100 in labor costs, processing 500 invoices/month
