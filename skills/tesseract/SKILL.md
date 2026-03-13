---
name: tesseract
description: >-
   You are an expert in Tesseract OCR, the most popular open-source optical
  character recognition engine. You help developers extract text from images,
  PDFs, and scanned documents using Tesseract's LSTM neural network engine,
  multi-language support (100+ languages), page segmentation modes, and
  integration with image preprocessing for maximum accuracy.
category: AI & Machine Learning
tags: [ocr, text-recognition, document-processing, image-to-text, open-source]
version: 1.0.0
author: terminal-skills
---

# Tesseract — Open-Source OCR Engine

You are an expert in Tesseract OCR, the most popular open-source optical character recognition engine. You help developers extract text from images, PDFs, and scanned documents using Tesseract's LSTM neural network engine, multi-language support (100+ languages), page segmentation modes, and integration with image preprocessing for maximum accuracy.

## Core Capabilities

### Basic Usage

```python
# pip install pytesseract Pillow
import pytesseract
from PIL import Image
import cv2

# Simple text extraction
text = pytesseract.image_to_string(Image.open("document.png"))
print(text)

# With language specification
text_de = pytesseract.image_to_string(Image.open("german_doc.png"), lang="deu")

# Multiple languages
text_multi = pytesseract.image_to_string(Image.open("mixed.png"), lang="eng+fra+deu")

# Get bounding boxes for each word
data = pytesseract.image_to_data(Image.open("invoice.png"), output_type=pytesseract.Output.DICT)
for i, word in enumerate(data["text"]):
    if word.strip():
        x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
        conf = int(data["conf"][i])
        print(f"'{word}' at ({x},{y},{w},{h}) confidence: {conf}%")

# PDF to text
from pdf2image import convert_from_path
pages = convert_from_path("document.pdf", dpi=300)
full_text = ""
for page in pages:
    full_text += pytesseract.image_to_string(page) + "\n\n"
```

### Image Preprocessing for Better Accuracy

```python
import cv2
import numpy as np

def preprocess_for_ocr(image_path: str) -> np.ndarray:
    """Preprocess image for optimal OCR accuracy.

    Steps: grayscale → denoise → threshold → deskew → resize
    """
    img = cv2.imread(image_path)

    # Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Denoise
    denoised = cv2.fastNlMeansDenoising(gray, h=10)

    # Adaptive threshold (handles uneven lighting)
    thresh = cv2.adaptiveThreshold(
        denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 11, 2,
    )

    # Deskew (fix rotated scans)
    coords = np.column_stack(np.where(thresh > 0))
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    (h, w) = thresh.shape
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(thresh, M, (w, h), flags=cv2.INTER_CUBIC,
                              borderMode=cv2.BORDER_REPLICATE)

    # Scale up if too small (Tesseract works best at 300+ DPI)
    if w < 1000:
        scale = 2.0
        rotated = cv2.resize(rotated, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    return rotated

# Use preprocessed image
processed = preprocess_for_ocr("scan.jpg")
text = pytesseract.image_to_string(processed, config="--psm 6")
```

### Page Segmentation Modes

```python
# PSM modes control how Tesseract analyzes page layout
# --psm 0: Orientation and script detection only
# --psm 1: Automatic with OSD
# --psm 3: Fully automatic (default)
# --psm 4: Assume single column
# --psm 6: Assume single uniform block of text
# --psm 7: Treat image as single text line
# --psm 8: Treat image as single word
# --psm 11: Sparse text, no order
# --psm 13: Raw line (no layout analysis)

# For receipts/invoices (structured single column)
text = pytesseract.image_to_string(img, config="--psm 4")

# For single line (serial numbers, license plates)
text = pytesseract.image_to_string(img, config="--psm 7")

# For scattered text (signs in a photo)
text = pytesseract.image_to_string(img, config="--psm 11")

# Whitelist specific characters
text = pytesseract.image_to_string(img, config="--psm 7 -c tessedit_char_whitelist=0123456789ABCDEF")
```

## Installation

```bash
# System package
brew install tesseract                     # macOS
apt install tesseract-ocr                 # Ubuntu/Debian
apt install tesseract-ocr-deu tesseract-ocr-fra  # Additional languages

# Python binding
pip install pytesseract Pillow

# Node.js
npm install tesseract.js                  # Pure JS (runs in browser too)
```

## Best Practices

1. **Preprocess images** — Grayscale → denoise → threshold → deskew before OCR; preprocessing improves accuracy 30-50%
2. **300 DPI minimum** — Tesseract works best at 300+ DPI; scale up small images before processing
3. **PSM selection** — Choose the right page segmentation mode; PSM 6 for documents, PSM 7 for single lines, PSM 11 for sparse
4. **Language data** — Install language-specific traineddata files; use `lang="eng+deu"` for multilingual documents
5. **Whitelist characters** — For known formats (serial numbers, dates), restrict character set for higher accuracy
6. **Confidence filtering** — Use `image_to_data` to get per-word confidence; filter out low-confidence results
7. **Tesseract.js for browser** — Use the JavaScript version for client-side OCR; no server needed, runs in Web Workers
8. **LSTM engine** — Tesseract 4+ uses LSTM neural networks by default; much more accurate than Tesseract 3's pattern matching
