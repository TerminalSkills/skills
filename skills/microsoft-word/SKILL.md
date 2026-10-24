---
name: microsoft-word
description: >-
  Create, edit, and manipulate Word documents (.docx) programmatically. Use when
  someone asks to "generate a Word document", "create a report in docx", "mail
  merge", "fill Word template", "extract text from Word", "convert markdown to
  Word", "add tables to Word", or "automate document generation". Covers
  python-docx for file manipulation, docxtpl for templates, and Microsoft Graph
  API for cloud documents.
license: Apache-2.0
compatibility: >-
  python-docx 1.2 (Python 3.9+), docxtpl 0.20 for templates, Microsoft Graph
  for SharePoint/OneDrive docs.
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/python-openxml/python-docx
  category: development
  tags:
    - microsoft-word
    - docx
    - document-generation
    - templates
    - mail-merge
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
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


def add_field(paragraph, instruction):
    """Insert a Word field (PAGE, TOC ...). Word fills it in when the file opens."""
    run = paragraph.add_run()
    for kind in ('begin', None, 'separate', 'end'):
        if kind:
            el = OxmlElement('w:fldChar')
            el.set(qn('w:fldCharType'), kind)
            if kind == 'begin':
                el.set(qn('w:dirty'), 'true')   # ask Word to refresh on open
        else:
            el = OxmlElement('w:instrText')
            el.set(qn('xml:space'), 'preserve')
            el.text = instruction
        run._r.append(el)

doc = Document()

section = doc.sections[0]
section.page_width = Cm(21)      # A4
section.page_height = Cm(29.7)
section.top_margin = Cm(2.5)
section.bottom_margin = Cm(2.5)
section.left_margin = Cm(3)
section.right_margin = Cm(2)

title = doc.add_heading('Quarterly Business Report', level=0)
title.alignment = WD_ALIGN_PARAGRAPH.CENTER

meta = doc.add_paragraph()
meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = meta.add_run('Q1 2026 — Confidential')
run.font.size = Pt(12)
run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)


doc.add_heading('Table of Contents', level=1)
add_field(doc.add_paragraph(), 'TOC \\o "1-3" \\h \\z \\u')  # Word asks to update fields on open


doc.add_heading('Executive Summary', level=1)
p = doc.add_paragraph()
p.add_run('Revenue grew ').font.size = Pt(11)
p.add_run('23% year-over-year').bold = True
p.add_run(', reaching $4.2M in Q1 2026. ')

doc.add_heading('Key Highlights', level=2)
for item in ['Revenue: $4.2M (+23% YoY)', 'New customers: 847', 'Churn rate: 2.1% (down from 3.4%)']:
    doc.add_paragraph(item, style='List Bullet')

doc.add_heading('Priorities for Q2', level=2)
for i, item in enumerate(['Launch enterprise tier', 'Hire 3 senior engineers', 'Expand to EU market'], 1):
    doc.add_paragraph(item, style='List Number')

doc.add_heading('Financial Summary', level=1)
table = doc.add_table(rows=1, cols=4, style='Light Grid Accent 1')
table.alignment = WD_TABLE_ALIGNMENT.CENTER

headers = ['Metric', 'Q1 2025', 'Q1 2026', 'Change']
for i, header in enumerate(headers):
    cell = table.rows[0].cells[i]
    cell.text = header
    for paragraph in cell.paragraphs:
        for run in paragraph.runs:
            run.bold = True

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

doc.add_heading('Growth Chart', level=2)
doc.add_picture('charts/revenue-q1-2026.png', width=Inches(5.5))
last_paragraph = doc.paragraphs[-1]
last_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER

header = section.header
header_para = header.paragraphs[0]
header_para.text = 'Northwind Analytics — Confidential'
header_para.alignment = WD_ALIGN_PARAGRAPH.RIGHT
header_para.runs[0].font.size = Pt(8)
header_para.runs[0].font.color.rgb = RGBColor(0x99, 0x99, 0x99)

footer = section.footer
footer_para = footer.paragraphs[0]
footer_para.text = 'Page '
footer_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
add_field(footer_para, 'PAGE')

doc.save('quarterly-report-q1-2026.docx')
```

### Step 2: Template-Based Generation with docxtpl

```bash
pip install docxtpl
```

Create a Word template (`template.docx`) with Jinja2 tags. Put loop and condition tags in their own paragraph and write them `{%p ... %}`: the `p` makes docxtpl remove the whole paragraph. With plain `{% ... %}` each tag leaves an empty paragraph behind (checked with docxtpl 0.20.2). Use `{%tr ... %}` for table rows.
```
{{ company_name }}
Date: {{ report_date }}

Dear {{ client_name }},

Please find the summary of your account below:

{%p for item in line_items %}
{{ item.description }}: ${{ item.amount }}
{%p endfor %}

Total: ${{ total }}

{%p if notes %}
Notes: {{ notes }}
{%p endif %}
```
Type each tag with one uniform format; Word splits text into runs when formatting changes inside a tag, and docxtpl cannot read a tag it has to join.

```python
from docxtpl import DocxTemplate

doc = DocxTemplate('template.docx')

context = {
    'company_name': 'Northwind Analytics',
    'report_date': 'October 1, 2026',
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
import os
from docxtpl import DocxTemplate

os.makedirs('offers', exist_ok=True)

# Generate personalized documents from CSV
with open('clients.csv', newline='', encoding='utf-8') as f:
    clients = list(csv.DictReader(f))

for client in clients:
    doc = DocxTemplate('offer-letter-template.docx')  # a fresh object per document
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

# Extract with structure (style names: 'Heading 1', 'Heading 2', ...)
for para in doc.paragraphs:
    if para.style.name.startswith('Heading '):
        print(f"{'#' * int(para.style.name[8:])} {para.text}")
    elif para.text.strip():
        print(para.text)

# Extract tables
for table in doc.tables:
    for row in table.rows:
        row_data = [cell.text for cell in row.cells]
        print(' | '.join(row_data))

# Extract images (rel.target_ref looks like 'media/image1.png')
import os

for rel in doc.part.rels.values():
    if "image" in rel.reltype:
        with open(f'extracted_{os.path.basename(rel.target_ref)}', 'wb') as f:
            f.write(rel.target_part.blob)

# doc.paragraphs and doc.tables are listed separately: body order is lost.
# Text in headers, footers, text boxes and tracked changes is not in doc.paragraphs.
```

### Step 4: Graph API (Cloud Documents)

Needs a Graph client with an access token (delegated `Files.ReadWrite`, or `Files.ReadWrite.All` for other drives). Simple upload takes files up to 250 MB; larger ones need an upload session.

```typescript
// Create Word document in OneDrive/SharePoint
const newDoc = await graphClient
  .api(`/drives/${driveId}/root:/Documents/report.docx:/content`)
  .put(fs.readFileSync('local-report.docx'));

// Convert Word to PDF
const pdfStream = await graphClient
  .api(`/drives/${driveId}/items/${itemId}/content?format=pdf`)
  .getStream();

// Sharing: create an edit link for people signed in to your tenant
const editLink = await graphClient
  .api(`/drives/${driveId}/items/${itemId}/createLink`)
  .post({ type: 'edit', scope: 'organization' });
// editLink.link.webUrl opens in Word on the web (organization scope: OneDrive for Business/SharePoint only)
```

## Examples

### Example 1: Generate a quarterly business report as a Word document
**User prompt:** "Create a Q4 2025 quarterly report for Athena SaaS. Revenue was $3.8M (up 18% YoY), 2,400 active customers, churn dropped to 1.9%. Include an executive summary, financial table, and priorities for Q1 2026."

The agent will write a Python script using `python-docx` that creates an A4 document with 2.5cm margins, a centered title "Quarterly Business Report — Q4 2025", a subtitle "Athena SaaS — Confidential" in gray, then a page break. The Executive Summary section uses bold runs for key figures ("Revenue grew 18% year-over-year, reaching $3.8M"). A Financial Summary table with the `Light Grid Accent 1` style has columns for Metric, Q4 2024, Q4 2025, and Change, populated with Revenue ($3.22M / $3.8M / +18%), Customers (1,980 / 2,400 / +21%), and Churn (2.6% / 1.9% / -27%). A Priorities section uses numbered list style with items like "Launch enterprise SSO by February" and "Expand sales team to cover EMEA." The header says "Athena SaaS — Confidential" and the footer carries a PAGE field, so Word shows the real page number. The file saves as `athena-q4-2025-report.docx`.

### Example 2: Generate personalized offer letters from a CSV using mail merge
**User prompt:** "I have an offer letter template at ./templates/offer-letter.docx and a CSV at ./data/new-hires.csv with columns name, position, salary, start_date, and manager. Generate individual offer letters for each person."

The agent will write a `docxtpl` script that reads the CSV with `csv.DictReader` and, for each row, renders the template with the context `{'name': 'Elena Vasquez', 'position': 'Senior Backend Engineer', 'salary': '$165,000', 'start_date': 'March 17, 2026', 'manager': 'David Park'}` (and so on for each hire). Each rendered document saves to `./offers/offer-elena-vasquez.docx` with the filename derived from the name field. For each hire the script prints a line such as "Generated offer for Elena Vasquez".

## Guidelines

- Use templates (docxtpl) for repetitive documents — don't generate structure in code every time
- Set explicit font sizes and styles — don't rely on Normal style defaults
- Use `doc.add_page_break()` before major sections
- python-docx cannot compute a table of contents, page numbers or page count: insert fields (`add_field`) and let Word fill them in; LibreOffice shows them after a field update
- python-docx reads and writes .docx only, not legacy .doc
- Test output in both Word and LibreOffice — rendering can differ
- For PDF conversion, Graph's `content?format=pdf` converts a file already in OneDrive/SharePoint
- Keep templates in version control
