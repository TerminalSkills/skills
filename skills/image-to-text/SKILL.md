---
name: image-to-text
description: >-
  Extracts text and its structure from an image by the route that fits the
  picture: an OCR engine for clean printed text, the agent's own vision for
  photos, tables, forms and handwriting, or both, and then checks the result
  before handing it over. Use when someone asks to "read the text in this
  screenshot", "transcribe this photo", "turn this table image into CSV", "pull
  the fields from this receipt", "what does this label say", or needs amounts,
  dates and codes copied exactly. For engine options see the tesseract skill;
  for scanned PDFs see pdf-ocr.
license: Apache-2.0
compatibility: "Python 3.8+ and the Tesseract 5 command line on PATH (run on 5.3.4); the crop helper needs Pillow. The vision route needs an agent whose model accepts images."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: data-ai
  tags: ["ocr", "text-extraction", "vision-model", "data-extraction", "verification"]
---

# Image to Text

## Overview

There are two ways to get text out of a picture, and they fail differently. An OCR engine recognizes characters: it is local, repeatable and reports a confidence per word, but it does not understand layout and it swaps look-alike characters. A vision model reads the way a person does: it follows tables, forms, angles and handwriting, but it gives no confidence and can quietly tidy, skip or invent text. Neither failure announces itself. In the runs behind this skill Tesseract returned a wrong date digit at confidence 83 and a wrong card digit at confidence 80. So the job has three parts: pick the route from what is in the image, read, then verify with a signal that does not depend on the route.

## Instructions

### 1. Look first, then choose the route

Open the image with the agent's file-reading tool so the model sees the picture. Note the kind of content, the layout, the quality (blur, angle, lighting, text height) and the language. Ask what the text is for, which values must be exact (amounts, dates, codes, names), and whether the image may be sent to a hosted model at all: identity documents, medical and financial papers often may not.

| What the image shows | Route |
|---|---|
| Screenshot or clean scan, text in lines or blocks | OCR, then compare with what is seen |
| Photo of a document: angle, shadow, soft focus | Vision for the whole text, OCR to cross-check every number |
| Table or form where the position of a value matters | Vision for the structure, OCR to cross-check the cell values |
| Handwriting, text over artwork, stylized type | Vision; mark unsure words; an OCR engine for print will not help |
| Chart or diagram | Vision for labels and printed values; values read off an axis are estimates and are labeled so |
| Codes, serials, reference numbers | Both routes, enlarged, character by character |
| Hundreds of similar images | OCR for all; send only low-confidence or failed-check images to vision |
| Image that must stay on the machine | OCR only, or a vision model that runs locally; a person reviews the doubtful words |

### 2. OCR route

Save as `ocr_words.py`:

```python
#!/usr/bin/env python3
"""OCR one image with Tesseract and show how sure the engine was.
ocr_words.py IMAGE [--psm 6] [--lang eng] [--below 80] [--text out.txt]"""
import argparse, csv, io, json, subprocess, sys

p = argparse.ArgumentParser()
p.add_argument('image')
p.add_argument('--psm', default='6', help='page segmentation mode: 6 one block, 4 one column, 11 scattered text, 7 one line')
p.add_argument('--lang', default='eng')
p.add_argument('--below', type=float, default=80, help='list words whose confidence is under this value')
p.add_argument('--text', help='also write the plain text to this file')
args = p.parse_args()

run = subprocess.run(['tesseract', args.image, 'stdout', '--psm', args.psm, '-l', args.lang, 'tsv'],
                     capture_output=True, text=True)
if run.returncode:
    sys.exit(run.stderr.strip())
lines, words = {}, []
for row in csv.DictReader(io.StringIO(run.stdout), delimiter='\t', quoting=csv.QUOTE_NONE):
    if row['level'] != '5' or not row['text'].strip():      # level 5 = word; the other rows are containers
        continue
    lines.setdefault((int(row['block_num']), int(row['par_num']), int(row['line_num'])), []).append(row['text'])
    words.append({'text': row['text'], 'conf': round(float(row['conf'])),
                  'box': [int(row[k]) for k in ('left', 'top', 'width', 'height')]})
confs = [w['conf'] for w in words]
text = '\n'.join(' '.join(v) for _, v in sorted(lines.items()))
if args.text:
    open(args.text, 'w', encoding='utf-8').write(text + '\n')
print(json.dumps({
    'text': text,
    'words': len(words),
    'mean_confidence': round(sum(confs) / len(confs), 1) if confs else None,
    'doubtful': [w for w in words if w['conf'] < args.below]}, indent=2, ensure_ascii=False))
```

Pick `--psm` from the layout seen in step 1: `3` (Tesseract's own default) for a page or screen made of separate blocks, `6` when each line must stay together across a gap (receipts, price lists, table rows), `11` for scattered words, `7` for a single cropped line. On the receipt in Example 1, mode 3 returned 57 words and lost the price column; mode 6 returned 67 and kept each price on its line. Installing the engine, language data and image clean-up are covered by the `tesseract` skill.

`doubtful` lists the words under the confidence limit with their boxes. Treat it as a list of places to look, not as the list of errors: a word above the limit can still be wrong.

### 3. Vision route

Transcribe from the image under these rules:

- Copy, do not improve. Keep spelling, capitals, punctuation, currency signs and line breaks as printed. Do not expand abbreviations or fix typos.
- Follow the visual order: top to bottom, and for a table row by row with an empty cell left empty.
- Write `[?]` for anything unreadable instead of the likely word. Never complete a number from context.
- Read values that must be exact a second time on their own, from an enlarged crop (step 4).
- State what was not transcribed: logos, stamps, signatures, a barcode.

### 4. Verify

Use at least one check that is independent of the route that produced the text.

**Compare the two routes.** Save each transcription to a file (`--text` writes the OCR one) and run `reconcile.py`:

```python
#!/usr/bin/env python3
"""Compare two transcriptions of the same image token by token: reconcile.py ocr.txt vision.txt"""
import difflib, re, sys

def tokens(path):   # words in reading order; Markdown table pipes and rule lines are dropped
    return [t for t in re.findall(r'[^\s|]+', open(path, encoding='utf-8').read()) if t.strip('-:')]

a, b = tokens(sys.argv[1]), tokens(sys.argv[2])
count = 0
for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
    if tag == 'equal':
        continue
    left, right = ' '.join(a[i1:i2]), ' '.join(b[j1:j2])
    kind = 'NUMBER/CODE' if re.search(r'\d', left + right) else 'word'
    print(f'{kind:12}{left!r:42}{right!r}')
    count += 1
print(f'{count} disagreement(s) across {max(len(a), len(b))} tokens')
sys.exit(1 if count else 0)
```

Every line it prints is a place where one reader is wrong. Lines tagged `NUMBER/CODE` are settled before anything else.

**Enlarge and re-read.** Cut the disputed word out with `zoom.py`, using the box from `doubtful` or coordinates estimated from the image, then view the crop and run `tesseract crop.png - --psm 7` on it. This script needs Pillow: `python3 -m venv .venv && .venv/bin/pip install pillow`, then run it as `.venv/bin/python zoom.py`.

```python
#!/usr/bin/env python3
"""Cut one word or field out of an image and enlarge it: zoom.py IMAGE X,Y,W,H OUT.png [SCALE]"""
import sys
from PIL import Image, ImageOps

image, box, out = sys.argv[1:4]
scale = int(sys.argv[4]) if len(sys.argv) > 4 else 4
x, y, w, h = (int(v) for v in box.split(','))
pad = max(8, h // 2)
im = ImageOps.exif_transpose(Image.open(image)).convert('L')
crop = im.crop((max(x - pad, 0), max(y - pad, 0), min(x + w + pad, im.width), min(y + h + pad, im.height)))
crop = ImageOps.autocontrast(crop.resize((crop.width * scale, crop.height * scale), Image.Resampling.LANCZOS))
ImageOps.expand(crop, border=20, fill=255).save(out)
```

**Check the content against itself.** Line items add up to the subtotal; quantity times unit price equals the line total; tax is the stated rate; dates exist; a table has the same number of cells in every row; identifiers with a check digit pass their checksum. A transcription that fails arithmetic is wrong somewhere even when both routes agree.

**Leave the rest open.** A disputed token is settled when the enlarged crop is plainly legible and one more signal agrees with it: the other route, the number of characters visible, or the arithmetic. If an amount, date or code is still disputed after enlarging, or a character is ambiguous in the typeface itself (O and 0, I and l), report it as unverified with both readings. Do not pick one.

### 5. Deliver

Return the text in the shape asked for (plain text, Markdown table, CSV, JSON fields), followed by:

```
Route: vision for layout, Tesseract 5.3.4 --psm 6 as cross-check
Checks: 7 disagreements between routes, 5 settled from enlarged crops; items sum to subtotal; subtotal + VAT = total
Unverified: auth code "08B15Z" (OCR "086152"), reference "RF7Q-08B1-Z5S2" (OCR "RF7Q-0881-25S2")
Not transcribed: none
```

## Examples

### Example 1: Fields from a photographed receipt

Priya Raman sends `receipt-photo.jpg`, a phone photo of a till receipt taken at an angle in poor light, and needs the lines and totals for an expense claim. The image shows one column with prices on the right, so OCR runs in mode 6 and the agent also transcribes it by eye.

```bash
python3 ocr_words.py receipt-photo.jpg --psm 6 --text receipt.ocr.txt
python3 reconcile.py receipt.ocr.txt receipt.vision.txt
```

OCR reports 67 words at a mean confidence of 77.1. `reconcile.py` prints:

```
NUMBER/CODE '75™'                                     '75mm'
NUMBER/CODE 'p1se'                                    'P180'
word        'Subtotel'                                'Subtotal'
NUMBER/CODE '4472'                                    '4471'
NUMBER/CODE '086152 Ihaturns wanin'                   '08B15Z Returns within'
word        'cays wien ts recelPs'                    'days with this receipt'
NUMBER/CODE 'RF7Q-0881-25S2'                          'RF7Q-08B1-Z5S2'
7 disagreement(s) across 67 tokens
```

All eight prices agree between the routes, and 7.90 + 6.45 + 4.35 + 5.80 + 3.15 = 27.65, 20% of that is 5.53, and the total is 33.18, so the amounts are confirmed twice. The card digits were read by OCR as `4472` with confidence 80, above the doubtful limit; `.venv/bin/python zoom.py receipt-photo.jpg 244,528,31,11 card.png` followed by `tesseract card.png - --psm 7` returns `4471`, matching the vision reading. The misread words (`75mm`, `P180`, `Subtotal`, the returns line) are plainly legible in their crops. The authorization code stays `086152` for OCR even when enlarged, and B and 8 look alike in the blurred crop, so both codes are delivered as unverified:

```json
{
  "merchant": "KESTREL HARDWARE",
  "date": "2026-09-18",
  "items": [
    {"description": "2 x Brass hinge 75mm", "amount": 7.90},
    {"description": "1 x Wood glue 500ml", "amount": 6.45},
    {"description": "3 x Sandpaper P180", "amount": 4.35},
    {"description": "1 x Masonry bit 8mm", "amount": 5.80},
    {"description": "1 x Cable ties (100)", "amount": 3.15}
  ],
  "subtotal": 27.65, "vat": 5.53, "total": 33.18, "currency": "GBP",
  "card_ending": "4471",
  "unverified": {"auth_code": ["08B15Z", "086152"], "reference": ["RF7Q-08B1-Z5S2", "RF7Q-0881-25S2"]}
}
```

### Example 2: A table screenshot to CSV

Marek Dvorak has `rates-table.png`, a screenshot of a shipping-rates table with five columns, and wants a CSV. OCR in mode 6 reads every value correctly, but an empty cell leaves no trace in its output:

```
Ireland 6.80 11.40 2-3 days
Rest of world 18.40 7-12 days
```

Nothing in those lines says which weight band is missing. The agent therefore takes the structure from the image and writes the table itself, then uses the OCR text only to confirm the values: `reconcile.py` reports one disagreement across 48 tokens, the header `Upto2kg` against `Up to 2 kg`, and no difference in any of the 22 filled cells.

```csv
Zone,Up to 2 kg,Up to 10 kg,Up to 30 kg,Transit
United Kingdom,4.20,7.95,14.60,1-2 days
Ireland,6.80,11.40,,2-3 days
EU zone 1,9.15,16.30,31.75,3-5 days
EU zone 2,11.60,19.85,38.20,4-6 days
Rest of world,18.40,,,7-12 days
```

The agent adds: "5 rows, 5 columns; Ireland has no 30 kg rate and Rest of world has rates up to 2 kg only, as in the image."

## Guidelines

- Confidence is a hint, not a verdict. On a soft 520 px photo of a shipping label, Tesseract read the date `29/09/2026` as `20/09/2026` with confidence 83; the enlarged crop read correctly.
- A vision reading that looks fluent proves nothing: a wrong reading is fluent too. Model vendors document mistakes on low-quality, rotated and very small images. That is why numbers are re-read from crops and checked by arithmetic.
- Some characters cannot be settled from the picture: O and 0, I, l and 1 in many sans-serif typefaces. Ask for the source record or a sharper image instead of choosing.
- Small text is where the errors were: most misread words in these runs had letters about 10 to 13 px tall. Enlarge the crop three or four times before reading; enlarging a whole page only spreads the blur.
- Models downscale large images, so a full-page photo can lose its small print before the model sees it. Crop sections and read them one at a time.
- Do not use OCR in mode 3 on a receipt or price list and then pair names with amounts by position: the columns come back as separate blocks.
- Handwriting was not part of the test runs for this skill. Expect a vision model to be the only workable route, and return doubtful words as `[?]`.
- For many files, engine tuning, other languages or searchable PDFs use the `tesseract` and `pdf-ocr` skills; for complex documents with handwriting and forms see `chandra-ocr`.
