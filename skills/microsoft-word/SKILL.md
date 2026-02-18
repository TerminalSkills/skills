---
name: microsoft-word
description: >-
  Create, edit, and manipulate Word documents (.docx) programmatically. Use when
  someone asks to "generate a Word document", "create a report in docx", "mail merge",
  "fill Word template", "extract text from Word", "convert markdown to Word",
  "add tables to Word", or "automate document generation". Covers python-docx for
  file manipulation, docxtpl for templates, and Microsoft Graph API for cloud documents.
license: Apache-2.0
compatibility: "python-docx (Python 3.8+), docxtpl for templates, Graph API for SharePoint/OneDrive docs."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["microsoft-word", "docx", "document-generation", "templates", "mail-merge", "api"]
---

# Microsoft Word

## Overview

This skill helps AI agents create and manipulate Word documents programmatically. It covers generating .docx files with python-docx, template-based document generation with docxtpl, mail merge, and managing Word documents in SharePoint/OneDrive via Microsoft Graph API.

## Instructions

### Step 1: Generate Documents with python-docx

```bash
pip install python-docx
```

```python
from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_ORIENT

doc = Document()

# --- Page setup ---
section = doc.sections[0]
section.page_width = Cm(21)      # A4
section.page_height = Cm(29.7)
section.top_margin = Cm(2.5)
section.bottom_margin = Cm(2.5)
section.left_margin = Cm(3)
section.right_margin = Cm(2)

# --- Title ---
title = doc.add_heading('Quarterly Business Report', level=0)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER

# --- Subtitle / metadata ---
meta = doc.add_paragraph()
meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = meta.add_run('Q1 2026 — Confidential')
run.font.size = Pt(12)
run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

doc.add_page_break()

# --- Table of Contents placeholder ---
doc.add_heading('Table of Contents', level=1)
doc.add_paragraph('(Update field after opening in Word: Ctrl+A → F9)')

doc.add_page_break()

# --- Section with paragraphs ---
doc.add_heading('Executive Summary', level=1)
p = doc.add_paragraph()
p.add_run('Revenue grew ').font.size = Pt(11)
p.add_run('23% year-over-year').bold = True
p.add_run(', reaching $4.2M in Q1 2026. ')

# Bullet list
doc.add_heading('Key Highlights', level=2)
for item in ['Revenue: $4.2M (+23% YoY)', 'New customers: 847', 'Churn rate: 2.1% (down from 3.4%)']:
    doc.add_paragraph(item, style='List Bullet')

# Numbered list
doc.add_heading('Priorities for Q2', level=2)
for i, item in enumerate(['Launch enterprise tier', 'Hire 3 senior engineers', 'Expand to EU market'], 1):
    doc.add_paragraph(item, style='List Number')

# --- Table ---
doc.add_heading('Financial Summary', level=1)
table = doc.add_table(rows=1, cols=4, style='Light Grid Accent 1')
table.alignment = WD_TABLE_ALIGNMENT.CENTER

# Header row
headers = ['Metric', 'Q1 2025', 'Q1 2026', 'Change']
for i, header in enumerate(headers):
    cell = table.rows[0].cells[i]
    cell.text = header
    for paragraph in cell.paragraphs:
        for run in paragraph.runs:
            run.bold = True

# Data rows
data = [
    ['Revenue', '$3.4M', '$4.2M', '+23%'],
    ['Customers', '2,140', '2,987', '+40%'],
    ['MRR', '$283K', '$350K', '+24%'],
    ['Churn', '3.4%', '2.1%', '-38%'],
]
for row_data in data:
    row = table.add_row()
    for i, value in enumerate(row_data):
        row.cells[i].text = value

# --- Image ---
doc.add_heading('Growth Chart', level=2)
doc.add_picture('/path/to/chart.png', width=Inches(5.5))
last_paragraph = doc.paragraphs[-1]
last_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER

# --- Header and Footer ---
header = section.header
header_para = header.paragraphs[0]
header_para.text = 'Company Inc. — Confidential'
header_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
header_para.runs[0].font.size = Pt(8)
header_para.runs[0].font.color.rgb = RGBColor(0x99, 0x99, 0x99)

footer = section.footer
footer_para = footer.paragraphs[0]
footer_para.text = 'Page '
footer_para.alignment = WD_ALIGN_PARAGRAPH.CENTER

# Save
doc.save('quarterly-report-q1-2026.docx')
```

### Step 2: Template-Based Generation with docxtpl

```bash
pip install docxtpl
```

Create a Word template (`template.docx`) with Jinja2 tags:
```
{{ company_name }}
Date: {{ report_date }}

Dear {{ client_name }},

Please find the summary of your account below:

{% for item in line_items %}
  - {{ item.description }}: ${{ item.amount }}
{% endfor %}

Total: ${{ total }}

{% if notes %}
Notes: {{ notes }}
{% endif %}
```

```python
from docxtpl import DocxTemplate

doc = DocxTemplate('template.docx')

context = {
    'company_name': 'Acme Corp',
    'report_date': 'March 1, 2026',
    'client_name': 'Sarah Chen',
    'line_items': [
        {'description': 'Web Development', 'amount': '12,500'},
        {'description': 'UI/UX Design', 'amount': '4,200'},
        {'description': 'Hosting (Annual)', 'amount': '1,800'},
    ],
    'total': '18,500',
    'notes': 'Payment due within 30 days.',
}

doc.render(context)
doc.save('invoice-sarah-chen.docx')
```

#### Mail Merge (Batch Documents)
```python
import csv
from docxtpl import DocxTemplate

# Generate personalized documents from CSV
with open('clients.csv') as f:
    clients = list(csv.DictReader(f))

for client in clients:
    doc = DocxTemplate('offer-letter-template.docx')
    doc.render({
        'name': client['name'],
        'position': client['position'],
        'salary': client['salary'],
        'start_date': client['start_date'],
        'manager': client['manager'],
    })
    doc.save(f"offers/offer-{client['name'].replace(' ', '-').lower()}.docx")
    print(f"Generated offer for {client['name']}")
```

### Step 3: Read and Extract from Word

```python
from docx import Document

doc = Document('report.docx')

# Extract all text
full_text = '\n'.join(para.text for para in doc.paragraphs)

# Extract with structure
for para in doc.paragraphs:
    if para.style.name.startswith('Heading'):
        level = para.style.name.replace('Heading ', '')
        print(f"{'#' * int(level)} {para.text}")
    elif para.text.strip():
        print(para.text)

# Extract tables
for table in doc.tables:
    for row in table.rows:
        row_data = [cell.text for cell in row.cells]
        print(' | '.join(row_data))

# Extract images
import io
from docx.opc.constants import RELATIONSHIP_TYPE as RT

for rel in doc.part.rels.values():
    if "image" in rel.reltype:
        image_data = rel.target_part.blob
        with open(f'extracted_{rel.target_ref}', 'wb') as f:
            f.write(image_data)
```

### Step 4: Convert Markdown to Word

```python
import markdown
from docx import Document
from docx.shared import Pt
from html.parser import HTMLParser

def markdown_to_docx(md_text, output_path):
    """Convert markdown text to a formatted Word document."""
    doc = Document()
    
    lines = md_text.strip().split('\n')
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        
        # Headings
        if stripped.startswith('# '):
            doc.add_heading(stripped[2:], level=1)
        elif stripped.startswith('## '):
            doc.add_heading(stripped[3:], level=2)
        elif stripped.startswith('### '):
            doc.add_heading(stripped[4:], level=3)
        # Bullet lists
        elif stripped.startswith('- ') or stripped.startswith('* '):
            doc.add_paragraph(stripped[2:], style='List Bullet')
        # Numbered lists
        elif stripped[0].isdigit() and '. ' in stripped[:4]:
            text = stripped.split('. ', 1)[1]
            doc.add_paragraph(text, style='List Number')
        # Regular paragraph
        else:
            p = doc.add_paragraph()
            # Handle **bold** and *italic*
            import re
            parts = re.split(r'(\*\*.*?\*\*|\*.*?\*)', stripped)
            for part in parts:
                if part.startswith('**') and part.endswith('**'):
                    p.add_run(part[2:-2]).bold = True
                elif part.startswith('*') and part.endswith('*'):
                    p.add_run(part[1:-1]).italic = True
                else:
                    p.add_run(part)
    
    doc.save(output_path)
```

### Step 5: Graph API (Cloud Documents)

```typescript
// Create Word document in OneDrive/SharePoint
const newDoc = await graphClient
  .api(`/drives/${driveId}/root:/Documents/report.docx:/content`)
  .put(fs.readFileSync('local-report.docx'));

// Convert Word to PDF
const pdfStream = await graphClient
  .api(`/drives/${driveId}/items/${itemId}/content?format=pdf`)
  .getStream();

// Co-authoring: get temporary edit link
const editLink = await graphClient
  .api(`/drives/${driveId}/items/${itemId}/createLink`)
  .post({ type: 'edit', scope: 'organization' });
// Opens in Word Online for collaborative editing
```

## Best Practices

- Use templates (docxtpl) for repetitive documents — don't generate structure in code every time
- Set explicit font sizes and styles — don't rely on Normal style defaults
- Always specify measurements (Pt, Cm, Inches) — never use bare numbers
- Table styles: use built-in Word styles (`Light Grid Accent 1`, etc.) for consistent look
- For mail merge, load template once per batch, render per record
- Add alt text to images for accessibility
- Use `doc.add_page_break()` before major sections
- Test output in both Word and LibreOffice — rendering can differ
- For PDF conversion, Graph API's `?format=pdf` is most reliable
- Keep templates in version control alongside code
