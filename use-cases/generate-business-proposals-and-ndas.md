---
title: "Generate Business Proposals and NDAs for Client Engagements"
slug: generate-business-proposals-and-ndas
description: "Draft professional project proposals with scope, timeline, and pricing alongside tailored NDAs for new client engagements using structured templates and client context."
skills:
  - proposal-writer
  - nda-generator
category: business
tags:
  - proposals
  - legal-documents
  - client-management
  - contracts
---

# Generate Business Proposals and NDAs for Client Engagements

## The Problem

A consulting agency handles 8-12 new client engagements per month. Each engagement requires a custom proposal detailing scope, deliverables, timeline, and pricing, plus a mutual NDA before any technical discussions begin. The founding partners spend 6-8 hours per proposal because they start from a blank document every time, and the NDA process involves emailing a generic template that often needs manual edits for jurisdiction, confidentiality period, and carve-outs.

Two deals stalled last quarter because proposals took over a week to deliver, and a third deal required an NDA revision when the client's legal team flagged that the governing law clause did not match their jurisdiction requirements.

## The Solution

Use the **proposal-writer** skill to generate structured proposals from engagement parameters and the **nda-generator** skill to produce jurisdiction-appropriate NDAs with custom terms, cutting document preparation from hours to minutes.

## Step-by-Step Walkthrough

### 1. Generate a mutual NDA for the initial engagement

Create a tailored NDA before the first technical call with the prospective client:

> Generate a mutual NDA between Meridian Consulting LLC (Delaware) and Nakamura Industries Ltd (Tokyo, Japan). Set the confidentiality period to 3 years. Include the standard carve-outs (information that is or becomes public without breach, already known to the recipient, independently developed, or lawfully received from a third party) and a separate clause allowing disclosure that a court or authority legally requires. Use New York governing law. Include a clause permitting disclosure to subcontractors who sign equivalent NDAs. Generate it as an editable DOCX with signature blocks for both parties, and leave bracketed placeholders for anything not given.

For cross-border engagements, the NDA should specify which country's courts have jurisdiction and whether disputes go to arbitration or litigation. A 3-year confidentiality period is a common choice for technology consulting. Trade secrets such as source code are better covered "for as long as they remain trade secrets" than by a fixed term. Keep the NDA about confidentiality only; put any non-compete or non-solicit in a separate agreement.

> **Not legal advice.** The generated NDA, proposal terms and SOW are drafting templates, not legal advice. Enforceability of duration, governing law and scope varies by country and state, so have a qualified lawyer in the relevant jurisdictions review the NDA and contract terms before anyone signs.

### 2. Draft the project proposal from engagement details

Build a complete proposal based on the discovery call notes and client requirements:

> Write a project proposal for Nakamura Industries. Project: migrate their on-premise inventory management system to a cloud-native architecture on AWS. Scope includes architecture assessment (2 weeks), migration planning (3 weeks), implementation (8 weeks), and post-migration support (4 weeks). Team: 1 solution architect at $275/hour, 2 senior engineers at $225/hour, 1 project manager at $175/hour. Include sections for executive summary, technical approach, deliverables with acceptance criteria, timeline with milestones, pricing breakdown, assumptions, and terms.

The executive summary should be written last but placed first. It must convey the business value in language the client's leadership understands, not just the technical approach.

### 3. Add risk assessment and mitigation section

Strengthen the proposal with a realistic risk analysis specific to the project type:

> Add a risk assessment section to the Nakamura Industries proposal. Identify 4-5 risks specific to on-premise-to-cloud migrations: data migration integrity, legacy system dependencies, downtime during cutover, staff training gaps, and vendor lock-in concerns. For each risk, provide likelihood (low/medium/high), impact, and a specific mitigation strategy. Include a contingency budget recommendation of 15% of the base project cost.

Clients trust proposals that acknowledge risks over ones that promise everything will go smoothly. A contingency budget recommendation shows maturity and protects both parties from scope disputes later.

### 4. Generate a statement of work appendix

Create the detailed SOW that maps to the proposal milestones:

> Generate a Statement of Work appendix for the Nakamura Industries proposal. Break down each phase into specific tasks with estimated hours. Phase 1 Assessment: infrastructure audit (40 hrs), dependency mapping (24 hrs), performance benchmarking (16 hrs). Phase 2 Planning: architecture design (60 hrs), migration runbook (40 hrs), rollback procedures (20 hrs). Include acceptance criteria for each deliverable and payment milestones tied to phase completion: 25% at kickoff, 25% after planning approval, 25% at migration completion, 25% after support period ends.

Tying payments to milestone completion aligns incentives. The client does not pay the final 25% until the support period confirms the migration is stable, which gives them confidence in the outcome.

### 5. Review and finalize both documents

Validate consistency between the proposal, SOW, and NDA before sending. The proposal skill writes the editable DOCX; convert it to PDF with LibreOffice (`soffice --headless --convert-to pdf`) and open the PDF to check the pricing table, because the PDF is what the client sees.

> Review the Nakamura Industries proposal, SOW and NDA for consistency. Verify that the pricing in the proposal matches the SOW hour estimates multiplied by the hourly rates. Check that the NDA confidentiality period covers the full project duration plus 2 years (3 years from signing does for a 17-week project). Confirm the proposal terms reference the NDA by document title and date. Flag any missing sections or inconsistencies between the documents.

Cross-referencing prevents embarrassing errors like the SOW totaling a different number than the proposal summary. Check that all dates, party names, and financial figures are consistent across every document in the package.

## Real-World Example

On Tuesday morning, the agency gets an inquiry from Nakamura Industries about a cloud migration. By Tuesday afternoon, the NDA is generated, reviewed by the agency's lawyer, and sent for electronic signature. The client signs Wednesday morning after their own legal review, and the discovery call happens Wednesday afternoon. Using notes from the call, the proposal is drafted Thursday morning: 14 pages covering executive summary, technical approach, 17-week timeline, a $322,500 base price (plus the recommended 15% contingency, $48,375) with milestone-based billing, and a risk assessment that addresses the client's specific concerns about data residency requirements in Japan. The SOW appendix details 1,420 billable hours across four team members: 340 for the architect ($93,500), 800 for the two engineers ($180,000) and 280 for the project manager ($49,000).

The client receives the complete package Thursday evening. Previously, this would have arrived the following Wednesday at the earliest. The VP of Operations at Nakamura responds Friday with two questions about the rollback procedure, which the team addresses in a 15-minute call. The contract is signed the following Monday, a full week faster than the agency's historical average for engagements of this size.

## Related Skills

- **proposal-writer**: builds the proposal and SOW as an editable DOCX with pricing tables, then a PDF for delivery.
- **nda-generator**: drafts the mutual NDA with standard exclusions, compelled-disclosure clause and signature blocks.
