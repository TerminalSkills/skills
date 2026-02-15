---
name: powerpoint
description: >-
  Create, edit, and manipulate PowerPoint (.pptx) files programmatically using
  python-pptx. Use when a user asks to generate a PPTX, modify slides, extract
  text from a presentation, add charts or tables to PowerPoint, build slides
  from data, convert content to PPTX, or automate PowerPoint file creation.
license: Apache-2.0
compatibility: "Requires Python 3.7+ and python-pptx (`pip install python-pptx`)"
metadata:
  author: terminal-skills
  version: "1.0.0"
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

Common defaults: 0 = Title Slide, 1 = Title and Content, 5 = Title Only, 6 = Blank.

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
prs = Presentation("template.pptx")
for slide in prs.slides:
    for shape in slide.shapes:
        if shape.has_text_frame:
            for paragraph in shape.text_frame.paragraphs:
                for run in paragraph.runs:
                    if "{{COMPANY}}" in run.text:
                        run.text = run.text.replace("{{COMPANY}}", "Acme Corp")
prs.save("filled.pptx")
```

### Quick reference — adding elements

**Image:**
```python
slide.shapes.add_picture("photo.png", Inches(1), Inches(1.5), width=Inches(8))
```

**Table:**
```python
tbl = slide.shapes.add_table(rows, cols, Inches(1), Inches(2), Inches(8), Inches(3)).table
tbl.cell(0, 0).text = "Header"
```

**Chart:**
```python
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE

chart_data = CategoryChartData()
chart_data.categories = ["Q1", "Q2", "Q3", "Q4"]
chart_data.add_series("Revenue", (3.2, 3.8, 4.2, 5.1))
slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(1), Inches(2), Inches(8), Inches(4.5), chart_data)
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

### Extracting text

```python
prs = Presentation("input.pptx")
for i, slide in enumerate(prs.slides):
    for shape in slide.shapes:
        if shape.has_text_frame:
            print(f"Slide {i+1}: {shape.text_frame.text}")
```

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
slide.placeholders[1].text = f"Generated {data['generated_date']}"

# Summary slide
slide = prs.slides.add_slide(prs.slide_layouts[1])
slide.shapes.title.text = "Executive Summary"
tf = slide.placeholders[1].text_frame
tf.text = f"Total Revenue: ${data['total_revenue']:,.0f}"
p = tf.add_paragraph()
p.text = f"Units Sold: {data['units_sold']:,}"
p = tf.add_paragraph()
p.text = f"Top Region: {data['top_region']}"

# Chart slide — revenue by region
chart_data = CategoryChartData()
chart_data.categories = [r["name"] for r in data["regions"]]
chart_data.add_series("Revenue ($M)", [r["revenue"] for r in data["regions"]])
slide = prs.slides.add_slide(prs.slide_layouts[5])
slide.shapes.title.text = "Revenue by Region"
slide.shapes.add_chart(
    XL_CHART_TYPE.COLUMN_CLUSTERED,
    Inches(1), Inches(2), Inches(8), Inches(4.5), chart_data
)

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

### Example 2: Batch-update branding across PPTX templates

**User request:** "Update the company name and logo across all our PPTX templates"

```python
import glob
from pptx import Presentation
from pptx.util import Inches

old_name, new_name = "OldCorp Inc.", "NewBrand Technologies"
new_logo = "assets/newbrand_logo.png"

for filepath in glob.glob("templates/*.pptx"):
    prs = Presentation(filepath)
    for slide in prs.slides:
        to_remove = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    for run in para.runs:
                        if old_name in run.text:
                            run.text = run.text.replace(old_name, new_name)
            if shape.shape_type == 13 and shape.name.startswith("Logo"):
                to_remove.append((shape, shape.left, shape.top, shape.width, shape.height))
                slide.shapes.add_picture(new_logo, shape.left, shape.top, shape.width, shape.height)
        for shape, *_ in to_remove:
            shape._element.getparent().remove(shape._element)

    output = filepath.replace("templates/", "updated/")
    prs.save(output)
    print(f"Updated: {output}")
```

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
    if slide.has_notes_slide:
        notes = slide.notes_slide.notes_text_frame.text.strip()
        if notes:
            md_lines.append(f"\n> **Notes:** {notes}")

with open("extracted.md", "w") as f:
    f.write("\n".join(md_lines))
```

## Guidelines

- Always use `from pptx.util import Inches, Pt` for positioning — never raw EMU values unless doing precise math.
- When editing existing files, iterate `paragraph.runs` to preserve formatting. Setting `text_frame.text` directly destroys all existing font styles.
- Check available layouts with `enumerate(prs.slide_layouts)` before using hardcoded indices — they vary by template.
- For template-based generation, use placeholder shapes (`slide.placeholders[idx]`) rather than adding new shapes. This preserves the template's design.
- python-pptx does not support animations, transitions, or embedded video. Create the base PPTX and instruct the user to add those in PowerPoint.
- When building tables, set column widths explicitly — auto-sizing is not supported and defaults produce uneven columns.
- Save to a new filename when editing to avoid corrupting the source file during development.
