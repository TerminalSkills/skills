---
name: image-to-text
description: >-
  Extract text and structured data from images using Vision AI (OCR). Use when: reading
  text from screenshots, extracting data from scanned documents, converting images of
  tables/forms/charts to structured text.
license: MIT
compatibility: "Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: [ocr, image-to-text, vision-ai, text-extraction, document]
---

# Image to Text

## Overview

Extract all readable text from an image using OCR (Tesseract). Returns the full text content along with word-level bounding boxes and confidence scores.

- Reading text content from a screenshot or design mockup
- Extracting UI copy (labels, buttons, headings) so you don't have to retype it
- Getting text positions and bounding boxes from a design image

## Instructions

1. The image is passed to Tesseract.js for optical character recognition
2. Tesseract segments the image into lines and words
3. Returns the full text plus word-level details (position, confidence)

Run the extraction script:

```bash
bash <skill-path>/scripts/image-to-text.sh <image-path> [language]
```

**Arguments:**
- `image-path` — Path to the image file (required)
- `language` — OCR language code (optional, defaults to `eng`). Common: `eng`, `fra`, `deu`, `spa`, `chi_sim`, `jpn`

The script outputs JSON with extracted text and metadata:

```json
{
  "text": "Request work\nSuggestions\nPlumbing\nHVAC\nCleaning\nElectrical",
  "confidence": 87.4,
  "words": [
    {
      "text": "Request",
      "confidence": 94.2,
      "bbox": { "x0": 142, "y0": 180, "x1": 268, "y1": 204 }
    }
  ],
  "lines": [
    {
      "text": "Request work",
      "confidence": 95.1,
      "bbox": { "x0": 142, "y0": 180, "x1": 332, "y1": 204 }
    }
  ]
}
```

After extracting text, present the content grouped by lines and use the extracted text directly when implementing UI copy from a design.

## Examples

### Example 1: Extract text from a mobile app screenshot

```bash
bash <skill-path>/scripts/image-to-text.sh ./screenshot.png
```

Output:

```
Extracted text (87.4% confidence):

  Request work
  Suggestions
  Plumbing
  HVAC
  Cleaning
  Electrical

Found 6 lines, 6 words.
```

### Example 2: Extract French text from a scanned invoice

```bash
bash <skill-path>/scripts/image-to-text.sh ./invoice-scan.png fra
```

Tesseract uses the French language model to correctly recognize accented characters and French-specific formatting. The extracted text can then be parsed for invoice fields like total, date, and line items.

## Guidelines

- Tesseract works best with clean, high-contrast text. Screenshots of rendered UI work well. Photos of text at angles or with noise may produce poor results.
- Pass the correct language code as the second argument when processing non-English text. Tesseract needs the right language model to recognize characters.
- First run is slow because Tesseract downloads language data (~4MB for English). Subsequent runs are faster.
- For structured documents (tables, forms), post-process the extracted text to parse it into JSON or CSV format.
