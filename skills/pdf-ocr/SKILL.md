---
name: pdf-ocr
description: >-
  Extract text from scanned PDFs using optical character recognition. Use when a
  user asks to OCR a PDF, read a scanned document, extract text from an image
  PDF, digitize a scanned file, convert a scanned PDF to text, or read text from
  a photograph of a document. Supports multiple languages and handles low-quality
  scans.
license: Apache-2.0
compatibility: "Requires Tesseract 5 and poppler-utils; Python 3.9+ with pytesseract, pdf2image, Pillow; optional OCRmyPDF"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: documents
  repository: https://github.com/tesseract-ocr/tesseract
  tags: ["ocr", "pdf", "scanned", "text-extraction", "tesseract"]
  use-cases:
    - "Extract text from scanned paper documents saved as PDFs"
    - "Digitize old contracts or records that are image-only PDFs"
    - "Read text from PDFs in multiple languages including CJK scripts"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# PDF OCR

## Overview

Extract readable text from scanned or image-based PDF documents using optical character recognition (OCR). This skill converts PDF pages to images, runs OCR to detect text, and outputs clean structured text. Handles multi-page documents, multiple languages, and low-quality scans with preprocessing. To keep the original pages and add an invisible text layer (a searchable PDF) use OCRmyPDF instead of extracting text yourself.

## Instructions

When a user asks to OCR a scanned PDF or extract text from an image-based PDF, follow these steps:

### Step 1: Check if OCR is actually needed

First, attempt normal text extraction. If the PDF already contains selectable text, OCR is unnecessary:

```python
import pdfplumber

def check_text_content(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[:3]:
            text = page.extract_text()
            if text and len(text.strip()) > 50:
                return True  # Has extractable text, OCR not needed
    return False  # Image-only PDF, needs OCR
```

### Step 2: Install and verify dependencies

Ensure the required tools are available:

```bash
# Tesseract engine and poppler (pdf2image needs pdftoppm from poppler)
# Ubuntu/Debian:
sudo apt-get install tesseract-ocr poppler-utils
# macOS:
brew install tesseract poppler

# Python packages (pdfplumber is used for the text-layer check)
pip install pytesseract pdf2image Pillow pdfplumber

# Language packs: the Debian package name is tesseract-ocr-<code>
sudo apt-get install tesseract-ocr-deu tesseract-ocr-fra tesseract-ocr-jpn
tesseract --list-langs   # confirm the packs are installed (eng is included by default)
```

For a searchable PDF, OCRmyPDF does the whole job (`pip install ocrmypdf` or the distribution package, plus tesseract and ghostscript):

```bash
ocrmypdf -l eng+deu --deskew --rotate-pages scan_contract.pdf scan_contract_searchable.pdf
ocrmypdf --skip-text mixed.pdf mixed_searchable.pdf        # leave pages that already have text
ocrmypdf --sidecar scan_contract.txt scan_contract.pdf out.pdf   # also write the plain text
```

By default it stops with `PriorOcrFoundError` on a page that already has text; choose `--skip-text`, `--redo-ocr`, or `--force-ocr` (rasterizes the page).

### Step 3: Convert PDF pages to images

```python
from pdf2image import convert_from_path

def pdf_to_images(pdf_path, dpi=300):
    images = convert_from_path(pdf_path, dpi=dpi)
    return images
```

Use 300 DPI for standard documents. Increase to 400-600 DPI for small text or low-quality scans.

### Step 4: Preprocess images for better accuracy

Tesseract already binarizes internally (Otsu), so clean scans need no preprocessing at all. Try the raw image first and add steps only for poor scans (shadows, noise, faint print):

```python
from PIL import Image, ImageFilter, ImageEnhance

def preprocess_image(image):
    # Convert to grayscale
    gray = image.convert('L')
    # Increase contrast
    enhancer = ImageEnhance.Contrast(gray)
    enhanced = enhancer.enhance(2.0)
    # Sharpen
    sharpened = enhanced.filter(ImageFilter.SHARPEN)
    # Binarize only if the background is even; a fixed threshold erases faint
    # text on shadowed or yellowed pages (Tesseract 5 also offers Sauvola/adaptive Otsu)
    threshold = 150
    binary = sharpened.point(lambda x: 255 if x > threshold else 0)
    return binary
```

### Step 5: Run OCR on each page

```python
import pytesseract

def ocr_pages(images, lang='eng'):
    results = []
    for i, image in enumerate(images):
        processed = preprocess_image(image)
        text = pytesseract.image_to_string(processed, lang=lang)
        results.append({
            "page": i + 1,
            "text": text.strip(),
            "confidence": get_confidence(processed, lang)
        })
    return results

def get_confidence(image, lang='eng'):
    data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
    confidences = [int(c) for c in data['conf'] if int(c) > 0]
    return sum(confidences) / len(confidences) if confidences else 0
```

### Step 6: Output the results

Combine and format the extracted text. Save as a text file or return directly:

```python
def save_results(results, output_path):
    with open(output_path, 'w', encoding='utf-8') as f:
        for page in results:
            f.write(f"--- Page {page['page']} (confidence: {page['confidence']:.0f}%) ---\n")
            f.write(page['text'] + "\n\n")
    return output_path
```

## Examples

### Example 1: OCR a scanned contract

**User request:** "Extract text from this scanned contract scan_contract.pdf"

**Actions taken:**
1. Check for existing text layer - none found, OCR needed
2. Convert 5 pages to images at 300 DPI
3. Preprocess and run OCR in English

**Output:**
```
OCR completed for scan_contract.pdf (5 pages)

Page-by-page confidence:
  Page 1: 96% confidence
  Page 2: 94% confidence
  Page 3: 91% confidence
  Page 4: 95% confidence
  Page 5: 88% confidence (lower quality scan detected)

Output saved to: scan_contract_text.txt (4,230 words extracted)

Note: Page 5 had lower image quality. Review that page for accuracy.
```

### Example 2: OCR a multi-language document

**User request:** "Read this scanned document, it's in German: rechnung.pdf"

**Actions taken:**
1. Verify tesseract-ocr-deu language pack is installed
2. Convert pages to images at 300 DPI
3. Run OCR with `lang='deu'`

**Output:**
```
OCR completed for rechnung.pdf (2 pages) using German language model

  Page 1: 93% confidence
  Page 2: 95% confidence

Extracted 812 words. Output saved to: rechnung_text.txt
```

### Example 3: Batch OCR multiple scanned files

**User request:** "OCR all the scanned PDFs in the ./receipts/ folder"

**Actions taken:**
1. Find all PDF files in ./receipts/ (found 12 files)
2. Check each for existing text layer
3. Run OCR on the 10 files that need it

**Output:**
```
Batch OCR complete: 12 files processed

  Already had text: 2 files (skipped)
  OCR completed:    10 files
  Average confidence: 92%

Output files saved to ./receipts/ocr_output/
  receipt_001_text.txt (97% confidence)
  receipt_002_text.txt (94% confidence)
  ...
  receipt_010_text.txt (85% confidence - review recommended)
```

## Guidelines

- Always check for existing text content before running OCR. Many PDFs already have a text layer.
- Use 300 DPI as the default resolution. Increase for small fonts or poor quality scans.
- Report confidence scores per page so users know which pages may need manual review.
- For multi-language documents, specify the correct Tesseract language code. Multiple languages can be combined: `lang='eng+deu'`.
- Compare raw and preprocessed output on one page before processing a whole file: for clean scans preprocessing gives no gain, and a hard threshold can lose text on uneven pages.
- For forms, receipts or single lines, set the page segmentation mode: `pytesseract.image_to_string(img, config="--psm 6")` (6 = one block of text, 4 = columns, 7 = one line). Text must be dark on a light background.
- For rotated or skewed scans, use `ocrmypdf --deskew --rotate-pages`, or deskew the image before OCR.
- OCR output is a recognition guess: check amounts, dates and names by eye before relying on them, and keep scans of sensitive documents on the local machine (Tesseract runs offline).
- Large PDFs should be processed page by page to manage memory usage.
- Common Tesseract language codes: eng (English), deu (German), fra (French), spa (Spanish), jpn (Japanese), chi_sim (Chinese Simplified), kor (Korean).
