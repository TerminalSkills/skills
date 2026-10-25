---
name: proposal-writer
description: >-
  Create compelling business proposals that win deals and partnerships. Use when
  a user asks to write a proposal, draft a business proposal, create a project
  proposal, prepare a bid, write a pitch document, or generate a partnership
  proposal. Produces structured, persuasive documents ready for client delivery.
license: Apache-2.0
compatibility: "Python 3.9+ with python-docx (pip install python-docx; imported as docx); LibreOffice for DOCX-to-PDF conversion"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: "proposal, business, writing, sales, pitch"
  use-cases: "Write a project proposal for a potential client engagement, Create a partnership proposal for a strategic business alliance, Draft a bid response for an RFP with structured sections and pricing"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Proposal Writer

## Overview

Create professional, persuasive business proposals structured to win deals. This skill generates complete proposal documents with executive summaries, scope of work, timelines, pricing, team qualifications, and terms. The script writes an editable DOCX; a LibreOffice conversion produces the PDF for delivery.

## Instructions

When a user asks to write or create a business proposal, follow these steps:

### Step 1: Gather proposal requirements

Collect key information from the user:
- **Client/Recipient**: Company name, contact person, industry
- **Project/Opportunity**: What is being proposed
- **Problem statement**: What challenge the client faces
- **Proposed solution**: What you are offering
- **Scope of work**: Deliverables and activities
- **Timeline**: Key milestones and delivery dates
- **Pricing**: Budget, pricing model (fixed, hourly, retainer)
- **Team**: Key people and their qualifications
- **Differentiators**: Why you over competitors

If the user provides partial information, fill in sensible structure and mark items with [TO BE COMPLETED] placeholders.

### Step 2: Structure the proposal

Build the proposal with these standard sections:

1. **Cover Page**: Title, client name, your company, date, confidentiality notice
2. **Executive Summary**: 1-page overview of the opportunity and your solution (write this last but place it first)
3. **Understanding of Needs**: Demonstrate you understand the client's problem and goals
4. **Proposed Solution**: Detailed description of your approach and methodology
5. **Scope of Work**: Specific deliverables, activities, and what is included/excluded
6. **Timeline and Milestones**: Phased plan with dates and checkpoints
7. **Team and Qualifications**: Key personnel, relevant experience, case studies
8. **Investment / Pricing**: Cost breakdown, payment schedule, pricing model
9. **Terms and Conditions**: Payment terms, validity period, assumptions
10. **Next Steps**: Clear call to action

### Step 3: Write compelling content

For each section, follow these writing principles:

**Executive Summary:**
- Lead with the client's problem, not your company
- State the proposed solution in one clear sentence
- Highlight the key benefit and expected outcome
- Keep to one page maximum

**Understanding of Needs:**
- Mirror the client's own language and priorities
- Show research and understanding of their industry
- Connect their challenges to your expertise

**Proposed Solution:**
- Be specific about what you will do, not vague promises
- Explain your methodology step by step
- Tie each element back to a client benefit

**Pricing:**
- Present pricing clearly in a table format
- Break down by phase or deliverable
- Include what is and is not included
- Offer options when appropriate (basic/standard/premium)

### Step 4: Generate the document

```python
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

def generate_proposal(data, output_path="proposal.docx"):
    doc = Document()

    # Cover page
    doc.add_paragraph("\n" * 6)
    title = doc.add_heading(data['title'], level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle = doc.add_paragraph(f"Prepared for: {data['client_name']}")
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    date_line = doc.add_paragraph(f"Date: {data['date']}")
    date_line.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.add_paragraph(f"Prepared by: {data['company_name']}")
    doc.add_page_break()

    # Add each section
    for section in data['sections']:
        doc.add_heading(section['title'], level=1)
        for paragraph in section['paragraphs']:
            doc.add_paragraph(paragraph)

        # Add tables if present (for pricing, timeline)
        if 'table' in section:
            table = doc.add_table(rows=1, cols=len(section['table']['headers']))
            table.style = 'Table Grid'
            for i, header in enumerate(section['table']['headers']):
                table.rows[0].cells[i].text = header
            for row_data in section['table']['rows']:
                row = table.add_row()
                for i, cell_val in enumerate(row_data):
                    row.cells[i].text = str(cell_val)

    doc.save(output_path)
    return output_path
```

Run it from a script file, for example `python make_proposal.py`, then check the result with `python -c "from docx import Document; print(len(Document('proposal_greenleaf_redesign.docx').paragraphs))"`. The `Table Grid` style exists in python-docx's default template, so no template file is needed.

To produce the PDF for delivery, convert the DOCX with LibreOffice. This needs `soffice` on the PATH; install LibreOffice with your system package manager:

```bash
soffice --headless --convert-to pdf --outdir ./delivery proposal_greenleaf_redesign.docx
```

Open the PDF and check the page count and the pricing table before sending, because the PDF is what the client sees.

### Step 5: Review and finalize

After generating:
1. Display a table of contents with page estimates
2. Highlight any [TO BE COMPLETED] placeholders
3. Suggest improvements or missing elements

## Examples

### Example 1: Web development project proposal

**User request:** "Write a proposal for redesigning the website for GreenLeaf Organics. Budget around $25K, 8-week timeline."

**Actions taken:**
1. Structure a web redesign proposal
2. Create phased timeline across 8 weeks
3. Build pricing breakdown totaling $25K

**Output:**
```
Generated: proposal_greenleaf_redesign.docx (12 pages)

Sections:
  1. Cover Page
  2. Executive Summary
  3. Understanding of Needs - GreenLeaf's e-commerce growth challenges
  4. Proposed Solution - Modern responsive redesign with e-commerce focus
  5. Scope of Work - Discovery, Design, Development, Launch
  6. Timeline:
     Week 1-2: Discovery & wireframes
     Week 3-4: Visual design & approval
     Week 5-7: Development & content migration
     Week 8: Testing & launch
  7. Team - Lead designer, senior developer, project manager
  8. Investment:
     Discovery & Strategy:    $3,500
     UX/UI Design:            $7,000
     Frontend Development:    $8,500
     Backend & CMS:           $4,000
     QA & Launch:             $2,000
     Total:                  $25,000
  9. Terms & Conditions
  10. Next Steps

Placeholders to complete: [GreenLeaf contact name], [your portfolio URLs]
```

### Example 2: Consulting engagement proposal

**User request:** "Draft a proposal for a 3-month data strategy consulting engagement with a mid-size fintech company"

**Output:**
```
Generated: proposal_data_strategy.docx (15 pages)

Sections included:
  1. Cover Page
  2. Executive Summary - Data strategy to accelerate fintech growth
  3. Understanding of Needs - Common fintech data challenges
  4. Proposed Approach:
     Phase 1: Data Audit & Assessment (Weeks 1-3)
     Phase 2: Strategy Development (Weeks 4-8)
     Phase 3: Implementation Roadmap (Weeks 9-12)
  5. Deliverables - Audit report, strategy document, implementation plan,
     executive presentation
  6. Team & Qualifications
  7. Investment:
     Option A (Advisory):     $45,000
     Option B (Hands-on):     $72,000
     Option C (Full program):  $95,000
  8. Case Studies - 2 relevant fintech engagements
  9. Terms
  10. Next Steps
```

### Example 3: Partnership proposal

**User request:** "Create a partnership proposal to pitch our AI analytics tool to a large retail chain"

**Output:**
```
Generated: proposal_retail_partnership.docx (10 pages)

Key sections:
  - Value proposition: How AI analytics drives retail revenue
  - Partnership model: Revenue share vs licensing options
  - Implementation plan: Pilot program in 3 stores, then rollout
  - Expected ROI: Projected 15-25% improvement in inventory efficiency
  - Mutual commitments and success metrics
```

## Guidelines

- Always write from the client's perspective. Lead with their problems and goals, not your company history.
- Use concrete numbers and specifics wherever possible. Avoid vague language like "we will improve your business."
- Include a pricing table, not just a total number. Clients want to see the breakdown.
- Offer pricing options (2-3 tiers) when the budget is flexible. This increases win rates.
- Mark all incomplete information with [TO BE COMPLETED] placeholders clearly.
- Keep proposals concise. 8-15 pages is ideal for most engagements. Avoid filler content.
- Generate DOCX by default for easy editing. Offer PDF for final delivery versions.
- Include a clear "Next Steps" section with a specific call to action and contact information.
- Add a validity period to pricing (e.g., "This proposal is valid for 30 days").
