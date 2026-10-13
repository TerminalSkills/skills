---
name: template-engine
description: >-
  Auto-fill document templates with data. Use when a user asks to create a
  mail merge, fill templates with data, generate documents from a template,
  populate placeholders, bulk generate letters or invoices, or auto-fill
  forms from a spreadsheet. Supports any document format including DOCX,
  PDF, HTML, and plain text.
license: Apache-2.0
compatibility: "Requires Python 3.9+ with docxtpl (python-docx-template) and Jinja2; weasyprint for PDF output (needs Pango system libraries)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/elapouya/python-docx-template
  category: automation
  tags: ["template", "mail-merge", "documents", "automation", "generation"]
  use-cases:
    - "Generate hundreds of personalized letters from a CSV and template"
    - "Auto-fill contract templates with client data"
    - "Create invoices from a spreadsheet of line items"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Template Engine

## Overview

Auto-fill document templates with data from spreadsheets, databases, or JSON. Supports mail merge for any format: DOCX, PDF, HTML, Markdown, and plain text. Generate hundreds of personalized documents from a single template and data source.

## Instructions

When a user needs template-based document generation, determine the format and approach:

### Task A: DOCX template filling with python-docx-template

1. Install the library:

```bash
pip install docxtpl openpyxl
```

2. Create a DOCX template with Jinja2 placeholders:
   - Use `{{ variable }}` for simple values
   - Use `{% for item in items %}...{% endfor %}` for loops
   - Use `{% if condition %}...{% endif %}` for conditionals
   - To repeat or hide a whole paragraph or table row, put the tag alone in it with a `p` or `tr` prefix: `{%p for item in items %}` ... `{%p endfor %}`, `{%tr for row in rows %}` ... `{%tr endfor %}`. Plain `{% %}` inside a paragraph leaves empty paragraphs behind
   - Write each tag in one go in Word (type or paste as plain text); Word splits formatted text into runs and can break a tag in half

3. Fill the template:

```python
from docxtpl import DocxTemplate
import json

def fill_docx_template(template_path: str, data: dict, output_path: str):
    doc = DocxTemplate(template_path)
    doc.render(data, autoescape=True)  # escapes &, <, > so "Smith & Sons" does not corrupt the XML
    doc.save(output_path)

# Single document
data = {
    "client_name": "Northwind Traders",
    "date": "2026-10-13",
    "items": [
        {"description": "Consulting", "amount": 5000},
        {"description": "Development", "amount": 12000},
    ],
    "total": 17000
}
fill_docx_template("invoice_template.docx", data, "invoice_northwind.docx")
```

4. Bulk generation from CSV:

```python
import csv
import re
from docxtpl import DocxTemplate

def mail_merge_docx(template_path: str, csv_path: str, output_dir: str):
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    for i, row in enumerate(rows):
        doc = DocxTemplate(template_path)
        doc.render(row, autoescape=True)
        safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", row.get("name") or str(i))
        filename = f"{output_dir}/{safe_name}.docx"
        doc.save(filename)
        print(f"Generated: {filename}")

    print(f"Created {len(rows)} documents")

mail_merge_docx("letter_template.docx", "contacts.csv", "./output")
```

### Task B: HTML/Markdown templates with Jinja2

```python
from jinja2 import Environment, FileSystemLoader, select_autoescape
import csv

env = Environment(
    loader=FileSystemLoader("./templates"),
    autoescape=select_autoescape(["html", "xml"]),  # off by default in Jinja2
)
template = env.get_template("report.html")

with open("data.csv") as f:
    rows = list(csv.DictReader(f))

for row in rows:
    html = template.render(**row)
    output_file = f"./output/{row['id']}_report.html"
    with open(output_file, "w") as out:
        out.write(html)
```

Example Jinja2 template (`templates/report.html`):

```html
<!DOCTYPE html>
<html>
<head><title>Report for {{ company_name }}</title></head>
<body>
  <h1>Monthly Report: {{ company_name }}</h1>
  <p>Period: {{ start_date }} to {{ end_date }}</p>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    {% for metric in metrics %}
    <tr><td>{{ metric.name }}</td><td>{{ metric.value }}</td></tr>
    {% endfor %}
  </table>
</body>
</html>
```

### Task C: PDF generation from templates

Render HTML with Jinja2, then convert it with WeasyPrint (`pip install weasyprint`; it needs the Pango library, which is a system package on Linux and macOS; see the WeasyPrint install docs):

```python
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

env = Environment(loader=FileSystemLoader("./templates"),
                  autoescape=select_autoescape(["html", "xml"]))

def generate_pdf(template_name: str, data: dict, output: str):
    html = env.get_template(template_name).render(**data)
    HTML(string=html, base_url="./templates").write_pdf(output)
```

Set page size and margins in the template's CSS (`@page { size: A4; margin: 2cm; }`). WeasyPrint does not run JavaScript; if the page needs a real browser (charts, JS layout), render with a headless Chromium tool such as Playwright's `page.pdf()` instead. Avoid `pdfkit`/wkhtmltopdf: the wkhtmltopdf project was archived in 2023.

### Task D: Plain text templates (emails, notifications)

```python
from string import Template
import csv

def text_mail_merge(template_str: str, csv_path: str) -> list[str]:
    template = Template(template_str)
    results = []
    with open(csv_path) as f:
        for row in csv.DictReader(f):
            results.append(template.safe_substitute(row))
    return results

# Usage
email_template = """Dear $name,

Thank you for your order #$order_id placed on $date.
Your total is $$amount.

Best regards,
The Team"""

messages = text_mail_merge(email_template, "orders.csv")
for msg in messages:
    print(msg)
    print("---")
```

## Examples

### Example 1: Generate personalized offer letters

**User request:** "Create 50 offer letters from a template and employee spreadsheet"

```python
from docxtpl import DocxTemplate
import csv

with open("new_hires.csv") as f:
    hires = list(csv.DictReader(f))

for hire in hires:
    doc = DocxTemplate("offer_letter_template.docx")
    doc.render({
        "candidate_name": hire["name"],
        "position": hire["role"],
        "salary": f"${int(hire['salary']):,}",
        "start_date": hire["start_date"],
        "manager": hire["manager"]
    }, autoescape=True)
    doc.save(f"./offers/offer_{hire['name'].replace(' ', '_')}.docx")

print(f"Generated {len(hires)} offer letters in ./offers/")
```

### Example 2: Invoice generation from JSON data

**User request:** "Generate PDF invoices for all clients in our billing data"

```python
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML
import json

with open("billing.json") as f:
    clients = json.load(f)

env = Environment(loader=FileSystemLoader("./templates"),
                  autoescape=select_autoescape(["html", "xml"]))
template = env.get_template("invoice.html")

for client in clients:
    client["total"] = sum(item["amount"] for item in client["line_items"])
    html = template.render(**client)
    HTML(string=html).write_pdf(f"./invoices/invoice_{client['id']}.pdf")

print(f"Generated {len(clients)} invoices")
```

### Example 3: Bulk email content from a spreadsheet

**User request:** "Create personalized email bodies for 200 contacts from a CSV"

```python
from jinja2 import Environment, BaseLoader
import csv

template_str = """Hi {{ first_name }},

I noticed {{ company }} recently {{ trigger_event }}. We help companies
like yours with {{ pain_point }}.

Would you have 15 minutes this week to discuss?

Best,
{{ sender_name }}"""

env = Environment(loader=BaseLoader())
template = env.from_string(template_str)

with open("contacts.csv") as f:
    contacts = list(csv.DictReader(f))

for contact in contacts:
    email_body = template.render(**contact)
    with open(f"./emails/{contact['email'].replace('/', '_')}.txt", "w") as out:
        out.write(email_body)

print(f"Generated {len(contacts)} email drafts")
```

## Guidelines

- Always validate data before rendering templates. Check for missing required fields.
- Use `safe_substitute` or Jinja2's `default` filter to handle missing values gracefully: `{{ name | default("Valued Customer") }}`.
- Preview the first 2-3 generated documents before running a full batch.
- Keep templates in version control separate from data files.
- For DOCX templates, test with complex formatting (tables, images, headers) early since not all features are supported.
- Jinja2 does not escape HTML unless you enable `autoescape` (shown above). Never build templates from untrusted strings (`from_string`) or use untrusted input as a filename; for untrusted templates use `jinja2.sandbox.SandboxedEnvironment`.
- `string.Template` and Jinja2 use different syntax (`$name` vs `{{ name }}`); do not mix them in one template.
- Use consistent naming for output files that includes a unique identifier.
- For large batches (1000+ documents), process in chunks and report progress.
