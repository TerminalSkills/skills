---
name: powerpoint
description: >-
  Creates, edits, and reads PowerPoint (.pptx) files programmatically with the
  python-pptx library. Use when a user asks to generate a PPTX, modify slides, extract
  text from a presentation, add charts or tables to PowerPoint, build slides
  from data, convert content to PPTX, or automate PowerPoint file creation.
license: Apache-2.0
compatibility: "Requires Python 3.8+ and python-pptx 1.0 or later (`pip install python-pptx`)"
metadata:
  author: terminal-skills
  version: "1.2.0"
  repository: https://github.com/scanny/python-pptx
  category: documents
  tags: ["powerpoint", "pptx", "presentations", "slides", "python-pptx"]
  use-cases:
    - "Generate PowerPoint reports from database queries or JSON data"
    - "Edit existing PPTX files — update text, swap images, modify layouts"
    - "Extract text, images, and metadata from PowerPoint presentations"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# PowerPoint

## Overview

Create, read, and edit PowerPoint (.pptx) files programmatically using the python-pptx library. Handles slide creation, text formatting, images, tables, charts, shapes, slide layouts, and speaker notes. Works without PowerPoint installed — reads and writes the Open XML format directly.

## Instructions

### Setup

```bash
pip install python-pptx
```

The current release is 1.0.2 (August 2024). The 1.x line needs Python 3.8 or later and ships type annotations. Only `.pptx` files open — convert a legacy `.ppt` first (`soffice --headless --convert-to pptx quarterly.ppt`).

### Object model

```
Presentation
├── slide_layouts[]    # Layout variants (title, content, blank, etc.)
├── slides[]           # Actual slides
│   ├── shapes[]       # Text boxes, images, charts, tables
│   │   ├── text_frame → paragraphs[] → runs[]  # Text with formatting
│   │   └── table      # Table object (if table shape)
│   └── notes_slide    # Speaker notes
└── core_properties    # Title, author, subject
```

Layout indices vary by template. Always verify first:
```python
for i, layout in enumerate(prs.slide_layouts):
    print(i, layout.name)
```

In the built-in template: 0 = Title Slide, 1 = Title and Content, 5 = Title Only, 6 = Blank. `prs.slide_layouts.get_by_name("Title Only")` looks a layout up by name and returns `None` when it is missing.

### Slide size

`Presentation()` opens a built-in 4:3 template (10 × 7.5 in). For 16:9, load a widescreen `.pptx` saved from PowerPoint, or resize the blank deck before adding slides:

```python
prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
# Layout placeholders keep their 4:3 positions (9 in wide): after a resize use Blank or Title Only and place your own shapes.
```

### Creating a presentation

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

prs = Presentation()

# Title slide
slide = prs.slides.add_slide(prs.slide_layouts[0])
slide.shapes.title.text = "Q4 Revenue Report"
slide.placeholders[1].text = "Finance Team — January 2025"

# Content slide with bullets
slide = prs.slides.add_slide(prs.slide_layouts[1])
slide.shapes.title.text = "Key Highlights"
tf = slide.placeholders[1].text_frame
tf.text = "Revenue up 23% year-over-year"
p = tf.add_paragraph()
p.text = "New enterprise clients: 14"
p.level = 1

prs.save("report.pptx")
```

### Editing existing files (template fill)

```python
from pptx import Presentation

def replace_text(paragraph, old, new):
    """Replace across runs: PowerPoint often splits one phrase ({{COM + PANY}}) into several runs."""
    runs = paragraph.runs
    if old not in "".join(r.text for r in runs):
        return False
    for r in runs:                          # phrase inside one run: every run keeps its formatting
        r.text = r.text.replace(old, new)
    if old in "".join(r.text for r in runs):    # split across runs: merge into the first run (its formatting wins)
        runs[0].text = "".join(r.text for r in runs).replace(old, new)
        for r in runs[1:]:
            r.text = ""
    return True

prs = Presentation("template.pptx")
for slide in prs.slides:
    for shape in slide.shapes:
        if shape.has_text_frame:
            for paragraph in shape.text_frame.paragraphs:
                replace_text(paragraph, "{{COMPANY}}", "Northwind Logistics")
prs.save("filled.pptx")
```

### Quick reference — adding elements

**Image:**
```python
slide.shapes.add_picture("photo.png", Inches(1), Inches(1.5), width=Inches(8))
```

**Table:**
```python
tbl = slide.shapes.add_table(4, 3, Inches(1), Inches(2), Inches(8), Inches(3)).table
tbl.cell(0, 0).text = "Product"
tbl.columns[0].width = Inches(4)   # widths are never auto-sized
```

**Chart:**
```python
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE

chart_data = CategoryChartData()
chart_data.categories = ["Q1", "Q2", "Q3", "Q4"]
chart_data.add_series("Revenue", (3.2, 3.8, 4.2, 5.1))
frame = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(1), Inches(2), Inches(8), Inches(4.5), chart_data)
frame.chart.replace_data(chart_data)   # later: refresh an existing chart (shape.has_chart) in place
```

**Speaker notes:**
```python
slide.notes_slide.notes_text_frame.text = "Key talking point here."
```

**Text formatting:**
```python
run = paragraph.runs[0]
run.font.size = Pt(28)
run.font.bold = True
run.font.color.rgb = RGBColor(0x1A, 0x73, 0xE8)
run.font.name = "Calibri"
paragraph.alignment = PP_ALIGN.CENTER
```

### Design principles for generated slides

**Typography:** One font family per presentation. Titles minimum 36pt, body minimum 24pt. Set `paragraph.line_spacing` to 1.2–1.3 for body text, 0.8–0.9 for large display text.

**Layout:** Left-align body text (center only for short titles). Use generous margins — `Inches(1)` minimum on all sides, at least `Inches(0.3)` of padding inside boxes and shapes. One idea per slide. Maximum 6 lines of text, 6 words per line. Split dense content across multiple slides (~30 seconds each).

**Visuals:** One hero image or chart per slide. Use high-contrast text on backgrounds. For professional templates as starting points, download PPTX files from Slidesgo (slidesgo.com) and load them with `Presentation("template.pptx")`.

## Examples

### Example 1: Generate a sales report from JSON data

**User request:** "Create a PowerPoint report from this sales data JSON file"

```python
import json
from pptx import Presentation
from pptx.util import Inches
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE

with open("sales_data.json") as f:
    data = json.load(f)

prs = Presentation()

# Title slide
slide = prs.slides.add_slide(prs.slide_layouts[0])
slide.shapes.title.text = f"Sales Report — {data['period']}"
slide.placeholders[1].text = f"Total revenue ${data['total_revenue']:,.0f} · generated {data['generated_date']}"

# Chart slide — revenue by region
chart_data = CategoryChartData()
chart_data.categories = [r["name"] for r in data["regions"]]
chart_data.add_series("Revenue ($M)", [r["revenue"] for r in data["regions"]])
slide = prs.slides.add_slide(prs.slide_layouts[5])
slide.shapes.title.text = "Revenue by Region"
slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(1), Inches(2), Inches(8), Inches(4.5), chart_data)

# Table slide — product breakdown
products = data["products"]
slide = prs.slides.add_slide(prs.slide_layouts[5])
slide.shapes.title.text = "Product Performance"
tbl = slide.shapes.add_table(len(products) + 1, 3, Inches(1), Inches(2), Inches(8), Inches(3)).table
for j, h in enumerate(["Product", "Units", "Revenue"]):
    tbl.cell(0, j).text = h
for i, prod in enumerate(products):
    tbl.cell(i + 1, 0).text = prod["name"]
    tbl.cell(i + 1, 1).text = f"{prod['units']:,}"
    tbl.cell(i + 1, 2).text = f"${prod['revenue']:,.0f}"

prs.save("sales_report.pptx")
```

Result: `sales_report.pptx` with three slides — title, a clustered column chart that stays editable in PowerPoint (the data is embedded as a worksheet), and a product table.

### Example 2: Batch-update branding across PPTX templates

**User request:** "Update the company name and logo across all our PPTX templates"

```python
import glob, os
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

old_name, new_name = "Brightpath Consulting", "Northwind Logistics"
new_logo = "assets/northwind_logo.png"
os.makedirs("updated", exist_ok=True)

for filepath in glob.glob("templates/*.pptx"):
    prs = Presentation(filepath)
    for slide in prs.slides:
        for shape in list(slide.shapes):          # copy: the loop adds and removes shapes
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    replace_text(para, old_name, new_name)   # helper from "Editing existing files"
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE and shape.name.startswith("Logo"):
                slide.shapes.add_picture(new_logo, shape.left, shape.top, shape.width, shape.height)
                shape._element.getparent().remove(shape._element)   # no public delete API

    output = os.path.join("updated", os.path.basename(filepath))
    prs.save(output)
    print(f"Updated: {output}")
```

Result: one `Updated: updated/onboarding.pptx` line per file; the originals in `templates/` are untouched. A logo that sits on the slide master or a layout is not in `slide.shapes` — run the same loop over `prs.slide_master.shapes` and each `layout.shapes` in `prs.slide_layouts`. Text in table cells is not reached either (`shape.has_text_frame` is false for a table): loop over `shape.table.iter_cells()` and each `cell.text_frame.paragraphs`.

### Example 3: Extract presentation content to markdown

**User request:** "Extract all content from this PowerPoint into a markdown file"

```python
from pptx import Presentation

prs = Presentation("presentation.pptx")
md_lines = [f"# {prs.core_properties.title or 'Presentation'}\n"]

for i, slide in enumerate(prs.slides):
    md_lines.append(f"\n## Slide {i + 1}")
    for shape in slide.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                text = para.text.strip()
                if not text:
                    continue
                if para.level == 0 and shape == slide.shapes.title:
                    md_lines.append(f"\n### {text}")
                else:
                    md_lines.append(f"{'  ' * para.level}- {text}")
        elif shape.has_table:
            for row in shape.table.rows:
                md_lines.append("| " + " | ".join(c.text for c in row.cells) + " |")
    if slide.has_notes_slide:
        notes = slide.notes_slide.notes_text_frame.text.strip()
        if notes:
            md_lines.append(f"\n> **Notes:** {notes}")

with open("extracted.md", "w", encoding="utf-8") as f:
    f.write("\n".join(md_lines))
```

Result: `extracted.md` with a `## Slide N` heading per slide, the title as `###`, body text as nested bullets, table rows as pipe-separated lines and speaker notes as a quote. Text inside grouped shapes needs a recursive walk over `shape.shapes` when `shape.shape_type == MSO_SHAPE_TYPE.GROUP`.

## Guidelines

- Always use `from pptx.util import Inches, Pt` for positioning — never raw EMU values unless doing precise math.
- When editing existing files, change text through `paragraph.runs` to preserve formatting. Setting `text_frame.text` directly destroys all existing font styles.
- Check available layouts with `enumerate(prs.slide_layouts)` before using hardcoded indices — they vary by template. `slide.shapes.title` is `None` on layouts without a title placeholder (Blank).
- For template-based generation, use placeholder shapes (`slide.placeholders[idx]`) rather than adding new shapes. This preserves the template's design.
- Animations and slide transitions are not supported. Video can be embedded with `shapes.add_movie()`, which the library marks experimental: the size must be given, the MIME type should be (`mime_type="video/mp4"`), and without `poster_frame_image` a generic speaker icon is shown.
- There is no public API to delete, duplicate or reorder slides, or to delete a shape; removing the underlying XML element (as in Example 2) is the usual workaround. Charts and tables are built from the data you pass in — nothing is auto-sized, so set column widths explicitly.
- Text does not shrink to fit. `MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE` only writes the autofit flag; the library calculates no font size. `text_frame.fit_text(font_family="DejaVu Sans", max_size=18, font_file="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")` computes one at generation time — on Linux `font_file` is required, without it the call raises `OSError: unsupported operating system`.
- The file stores a font name, not the font. A deck set in Inter, Poppins or Montserrat falls back to a default on a machine without that font — stay with fonts the audience has, or confirm the font is installed where the deck is shown.
- Check the output before sending it: `soffice --headless --convert-to pdf sales_report.pptx` (LibreOffice) renders the deck so overflowing text and misplaced shapes are visible.
- Save to a new filename when editing to avoid corrupting the source file during development.
