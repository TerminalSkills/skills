---
name: tesseract
description: >-
  Tesseract is an open-source OCR engine that reads printed text out of images
  (PNG, JPEG, TIFF) and writes plain text, searchable PDF, hOCR, TSV or ALTO
  XML. Use when someone asks to "extract text from an image", "OCR this scan",
  "make a scanned PDF searchable", "read a receipt or serial number from a
  photo", "get word bounding boxes and confidence", or names tesseract,
  pytesseract or tesseract.js. Covers the tesseract command line, language
  data, page segmentation modes, the pytesseract Python wrapper, OpenCV
  preprocessing and tesseract.js.
license: Apache-2.0
compatibility: "Tesseract 5.x command line on Linux, macOS or Windows (commands run on 5.3.4; latest release 5.5.3). pytesseract 0.3.13 needs Python 3.8+ and the tesseract binary on PATH; tesseract.js 7 needs Node.js 16+ or a browser."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags:
    - ocr
    - text-recognition
    - document-processing
    - image-to-text
    - open-source
  repository: https://github.com/tesseract-ocr/tesseract
---

# Tesseract — Open-Source OCR Engine

## Overview

Tesseract is a command-line OCR engine and C/C++ library (`libtesseract`). Since version 4 it recognizes text line by line with an LSTM neural network, supports more than 100 languages through `.traineddata` files, and writes plain text, searchable PDF, hOCR, TSV, ALTO and PAGE XML. It reads images only (PNG, JPEG, TIFF and other formats Leptonica opens), not PDF, and it does not clean up bad scans much: most accuracy problems are solved before Tesseract runs, by fixing resolution, skew and contrast, and by choosing the right page segmentation mode.

Wrappers call the same engine: `pytesseract` shells out to the `tesseract` binary from Python, and `tesseract.js` runs a WebAssembly build in Node.js and the browser.

## Instructions

### Install the engine and language data

```bash
sudo apt install tesseract-ocr                       # Debian/Ubuntu: engine + eng + osd
sudo apt install tesseract-ocr-deu tesseract-ocr-fra # one package per language (3-letter code)
brew install tesseract                                # macOS: engine + eng + osd
brew install tesseract-lang                           # macOS: all other languages

tesseract --version
tesseract --list-langs
```

On Windows use the installer published by UB Mannheim (linked from the Tesseract installation docs) and add its folder to `PATH`. Distributions ship the `tessdata_fast` models. The `tessdata_best` repository has slower, slightly more accurate models; put its `.traineddata` files in a directory and pass `--tessdata-dir`:

```bash
tesseract --tessdata-dir "$HOME/tessdata_best" --list-langs
```

`--tessdata-dir` (or the `TESSDATA_PREFIX` environment variable) must point at the directory that contains the `.traineddata` files themselves. Only the `tessdata` repository carries the legacy engine; with distribution models `--oem 0` fails with "Tesseract (legacy) engine requested, but components are not present".

### Command line

```bash
tesseract invoice.png -                         # text to stdout
tesseract invoice.png invoice                   # writes invoice.txt
tesseract brief.png brief -l deu+eng            # several languages, most likely one first
tesseract invoice.png out/invoice txt pdf tsv   # several formats in one pass
tesseract invoice.png invoice --dpi 300 --psm 6 -c preserve_interword_spaces=1
tesseract pages.txt contract pdf                # pages.txt lists one image per line -> one multi-page PDF
```

- Syntax is `tesseract IMAGE OUTPUTBASE [options] [configfile…]`. Options (`-l`, `--psm`, `--oem`, `--dpi`, `-c`) come before the output configs `txt`, `pdf`, `hocr`, `tsv`, `alto`; `page` (PAGE XML) exists from 5.4.0.
- Use `-` or `stdout` as the output base to print, and `stdin` as the image to read a pipe.
- The output directory must already exist; Tesseract does not create it.
- `pdf` produces the page image with an invisible text layer; add `-c textonly_pdf=1` for the text layer alone.
- Append `quiet` to hide messages such as "Estimating resolution as 380"; they appear when the image has no DPI metadata, which `--dpi 300` also fixes.
- `tesseract --print-parameters` lists every `-c` variable. Useful ones: `tessedit_char_whitelist`, `tessedit_char_blacklist`, `preserve_interword_spaces`, `user_defined_dpi`, `thresholding_method` (0 Otsu, 1 adaptive Otsu, 2 Sauvola), `load_system_dawg` and `load_freq_dawg` (set both to 0 for codes and part numbers that are not dictionary words).
- `OMP_THREAD_LIMIT=1 tesseract …` keeps one process on one core; set it when running many files in parallel.

### Page segmentation modes

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
```

The default expects a full page. A cropped line or word read with `--psm 3` often comes back empty; use 7 or 8, and leave about 10 px of white border around the text. `--psm 0` needs `osd.traineddata` and prints the rotation to apply.

### Python with pytesseract

```python
# pip install pytesseract Pillow
import pytesseract
from pytesseract import Output
from PIL import Image

# Simple text extraction
text = pytesseract.image_to_string(Image.open("document.png"))

# Languages and engine options go through lang= and config=
text_multi = pytesseract.image_to_string(Image.open("letter.png"), lang="eng+fra+deu", config="--psm 6")

# Word boxes and confidence (TSV as a dict); container rows have conf -1 and empty text
data = pytesseract.image_to_data(Image.open("invoice.png"), output_type=Output.DICT)
for word, conf, x, y, w, h in zip(data["text"], data["conf"], data["left"], data["top"], data["width"], data["height"]):
    if word.strip() and float(conf) >= 60:
        print(f"{word!r} at ({x},{y},{w},{h}) confidence {conf}")

# Searchable PDF as bytes, and a hard time limit in seconds (raises RuntimeError)
pdf_bytes = pytesseract.image_to_pdf_or_hocr("invoice.png", extension="pdf", timeout=30)

# Whitelist characters for serial numbers
serial = pytesseract.image_to_string("serial.png", config="--psm 7 -c tessedit_char_whitelist=0123456789ABCDEF-")
```

pytesseract starts one `tesseract` process per call. A missing language raises `pytesseract.TesseractError`; a missing binary raises `TesseractNotFoundError` (set `pytesseract.pytesseract.tesseract_cmd` to its full path on Windows). `Output` offers `STRING`, `BYTES`, `DICT` and `DATAFRAME` (needs pandas). NumPy arrays are accepted and treated as RGB or grayscale, so convert OpenCV BGR images first.

### Image preprocessing for better accuracy

```python
# prep.py — pip install opencv-python-headless numpy
import cv2
import numpy as np

def preprocess_for_ocr(image_path: str, upscale: float = 2.0) -> np.ndarray:
    """Grayscale -> upscale -> denoise -> deskew -> binarize a phone photo or low-resolution scan."""
    gray = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise FileNotFoundError(image_path)
    gray = cv2.resize(gray, None, fx=upscale, fy=upscale, interpolation=cv2.INTER_CUBIC)
    gray = cv2.fastNlMeansDenoising(gray, h=10)

    # Deskew: fit a rotated box around the text pixels (dark text becomes white after inversion)
    ink = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 15)
    angle = cv2.minAreaRect(cv2.findNonZero(ink))[-1]
    if angle < -45:      # the angle range differs between OpenCV versions; fold it into (-45, 45]
        angle += 90
    elif angle > 45:
        angle -= 90
    h, w = gray.shape
    matrix = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    gray = cv2.warpAffine(gray, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)

    # Adaptive threshold copes with shadows and uneven lighting; result is black text on white
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15)
```

Skip steps the input does not need: a clean 300 DPI scan is best passed to Tesseract untouched. To see what Tesseract itself made of the image, add the `get.images` config and inspect the processed TIFF it writes.

### Node.js and the browser with tesseract.js

```javascript
// npm install tesseract.js   (v7; ESM)
import { createWorker, PSM } from "tesseract.js";

const worker = await createWorker("eng");            // language (and OEM) are set here since v5
await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
const { data } = await worker.recognize("invoice.png");
console.log(data.text, data.confidence);
await worker.terminate();
```

Create one worker, call `recognize` for every image, then terminate. Since v6 only `text` is returned by default; request the rest with `worker.recognize(image, {}, { blocks: true, hocr: true })`. The first run downloads the language file and caches `eng.traineddata` in the working directory under Node.js. tesseract.js does not read PDF files.

## Examples

### Example 1: Make a scanned contract searchable

**User request:** "contract-scan.pdf is just page images. Make it searchable and give me the text too."

Tesseract cannot open PDFs, so render the pages first (`pdftoppm` comes with poppler-utils):

```bash
pdftoppm -r 300 -png contract-scan.pdf page          # page-1.png, page-2.png
ls page-*.png > pages.txt
tesseract pages.txt contract-searchable -l eng --dpi 300 pdf txt
pdftotext contract-searchable.pdf - | head -5
```

**Result:** Tesseract prints `Page 0 : page-1.png` and `Page 1 : page-2.png`, then writes `contract-searchable.pdf` (2 pages, original images with a selectable text layer) and `contract-searchable.txt`. `pdftotext` now returns "SERVICE AGREEMENT …" where the original PDF returned nothing.

### Example 2: Read totals from skewed receipt photos and flag doubtful words

**User request:** "I have phone photos of receipts in receipts/. Pull the total from each and tell me which ones you are unsure about."

```python
# extract_totals.py — uses preprocess_for_ocr from prep.py above
import re
import sys
from pathlib import Path

import pytesseract
from pytesseract import Output

from prep import preprocess_for_ocr

for path in sorted(Path(sys.argv[1]).glob("*.jpg")):
    image = preprocess_for_ocr(str(path))
    data = pytesseract.image_to_data(image, lang="eng", config="--psm 6", output_type=Output.DICT)
    words = [(w, float(c)) for w, c in zip(data["text"], data["conf"]) if w.strip()]
    text = " ".join(w for w, _ in words)
    total = re.search(r"Total\s+EUR\s+(\d+[.,]\d{2})", text)
    shaky = [w for w, c in words if c < 60]
    print(f"{path.name}: total={total.group(1) if total else 'NOT FOUND'} low-confidence={shaky}")
```

```bash
python extract_totals.py receipts
```

**Result:**

```
harbor-2026-09-14.jpg: total=71.40 low-confidence=[]
harbor-2026-09-21.jpg: total=71.40 low-confidence=[]
```

The same photos, half-resolution and rotated 4–6°, give unreadable fragments when passed to Tesseract without preprocessing.

## Guidelines

1. **Fix the image before tuning Tesseract** — aim for about 300 DPI, dark text on a light background, straight lines and no dark scanner borders; upscale small images and deskew rotated ones.
2. **PSM selection** — PSM 3 for full pages, 4 for a single column such as a receipt, 6 for one block, 7 for one line, 11 for scattered words. A wrong mode is the usual cause of empty output.
3. **Language data** — pass every language on the page (`-l eng+deu`); order matters for speed and results. An "Error opening data file …/deu.traineddata" means the language package is not installed.
4. **Whitelist characters** — for serial numbers and codes set `tessedit_char_whitelist` and disable the dictionaries; do not use a whitelist for prose.
5. **Confidence filtering** — use TSV or `image_to_data` to get per-word confidence (0–100) and send low-confidence fields to a human instead of trusting them.
6. **Tables and layout** — Tesseract returns reading-order text, not table structure. `preserve_interword_spaces=1` keeps column gaps; cropping cells and reading them one by one works better for real tables.
7. **Batch work** — give the CLI a text file of image paths, or run several processes with `OMP_THREAD_LIMIT=1`; with tesseract.js reuse one worker.
8. **Trusted models only** — install `.traineddata` files from your package manager or the official tesseract-ocr repositories; 5.5.3 fixed memory-safety bugs in model loading, so keep the engine updated when files come from elsewhere.
9. **When not to use Tesseract** — handwriting, heavily stylized fonts, dense forms and photos of scenes are outside what it does well; a vision model or a layout-aware OCR service is the better tool there. For PDF-centric workflows see the `pdf-ocr` skill.
