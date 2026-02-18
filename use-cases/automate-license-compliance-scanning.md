---
title: "Automate License Compliance Scanning for Dependencies"
slug: automate-license-compliance-scanning
description: "Scan your dependency tree for license risks, generate compliance reports, and prevent problematic licenses from entering your codebase."
skills: [coding-agent, security-audit, report-generator]
category: development
tags: [license, compliance, dependencies, open-source, legal]
---

# Automate License Compliance Scanning for Dependencies

## The Problem

Your Node.js application has 847 transitive dependencies. Somewhere in that tree, a package switched from MIT to AGPL in a minor version bump. Your legal team needs a license inventory before the enterprise deal closes, and you have no idea what licenses you're actually shipping. A competitor just got sued for GPL violation — it was a 4-level-deep transitive dependency nobody knew about.

Manual license auditing is impractical at scale. Running `npm ls` gives you the tree, but not the licenses. License checkers exist, but they miss dual-licensed packages, don't catch license changes between versions, and can't tell you which licenses conflict with your commercial use case. You need a system that catches problems before they ship, not after legal sends a panicked Slack message.

## The Solution

Use **security-audit** to scan the full dependency tree for license risks, **coding-agent** to build automated CI checks that block problematic licenses, and **report-generator** to produce compliance reports for legal review.

## Step-by-Step Walkthrough

### 1. Scan the full dependency tree

```text
Scan all dependencies in our project (package.json + lockfile). For each package, identify the license. Flag any that are AGPL, GPL, SSPL, or unknown.
```

```text
LICENSE SCAN — 847 packages analyzed

BY LICENSE:
  MIT: 612 (72.3%)
  Apache-2.0: 98 (11.6%)
  ISC: 67 (7.9%)
  BSD-2-Clause: 31 (3.7%)
  BSD-3-Clause: 22 (2.6%)
  LGPL-2.1: 4 (0.5%)
  GPL-3.0: 2 (0.2%) ⚠️
  AGPL-3.0: 1 (0.1%) 🚨
  Unknown/Custom: 10 (1.2%) ⚠️

CRITICAL:
  🚨 @some-org/data-processor@2.1.0 — AGPL-3.0 (copyleft, viral)
     Required by: analytics-lib → data-processor
     Risk: AGPL requires releasing your entire application source code

  ⚠️ chart-renderer@4.2.1 — GPL-3.0
     Required by: dashboard-components → chart-renderer
     Risk: GPL may require releasing linked code under GPL

UNKNOWN (manual review needed):
  custom-parser@1.0.3 — "SEE LICENSE IN LICENSE.txt" (no SPDX identifier)
  legacy-util@0.9.8 — No license field in package.json
```

### 2. Analyze risk and find alternatives

```text
For each flagged package, assess the actual risk for our commercial SaaS product. Suggest MIT/Apache alternatives where we need to replace.
```

```text
RISK ASSESSMENT:

🚨 REPLACE: @some-org/data-processor@2.1.0 (AGPL-3.0)
  Risk: High — AGPL requires source disclosure for network use (your SaaS)
  Alternative: data-transform@3.4.0 (MIT, 2.1K stars, active maintenance)
  Migration effort: Low — same API surface, swap import paths

⚠️ REVIEW: chart-renderer@4.2.1 (GPL-3.0)
  Risk: Medium — used only in admin dashboard, not distributed to users
  Option A: Replace with chart-lib@5.0.0 (Apache-2.0, widely used)
  Option B: Legal review — GPL may not apply to SaaS (no distribution)

⚠️ REVIEW: 10 unknown licenses
  7 of 10: LICENSE.txt contains MIT-equivalent text (just missing SPDX)
  2 of 10: Public domain declarations
  1 of 10: Custom restrictive license — recommend replacement
```

### 3. Build the CI compliance gate

```text
Create a CI pipeline step that blocks PRs adding dependencies with prohibited licenses. Allow-list our approved licenses.
```

```text
Created .github/workflows/license-check.yml:

  Triggers: on PR when package.json or lockfile changes
  Allowed licenses: MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Unlicense
  Review-required: LGPL-2.1, LGPL-3.0, MPL-2.0
  Blocked: GPL-2.0, GPL-3.0, AGPL-3.0, SSPL-1.0, EUPL

  On violation:
    - PR check fails with clear message naming the package and license
    - Posts comment with alternatives and escalation path
    - Labels PR with "license-review-needed"

  Override: add package to .license-allowlist.json with justification
```

### 4. Generate the compliance report for legal

```text
Generate a full license compliance report suitable for enterprise customer due diligence. Include license texts and attribution notices.
```

```text
Generated: compliance-report-2026-02.pdf (34 pages)

Contents:
  Executive summary: 847 dependencies, 98.6% permissive licenses
  Full inventory: package name, version, license, author, URL
  License texts: all unique licenses included (8 distinct)
  Attribution notice: NOTICES.md generated for distribution
  Risk items: 3 flagged, 2 resolved, 1 under legal review

Also generated:
  NOTICES.md — Combined attribution file for product distribution
  .license-allowlist.json — Approved packages with justifications
  THIRD-PARTY-LICENSES.txt — Machine-readable license inventory
```

## Real-World Example

Sven, the CTO of a 20-person SaaS startup, was 2 weeks from closing a $400K enterprise deal. The customer's procurement team sent a vendor assessment requiring a complete open-source license inventory. Sven had no idea what licenses his 847 dependencies carried.

He ran the scanning workflow on a Tuesday morning. The security-audit found an AGPL-licensed package buried 3 levels deep in the dependency tree — a data processing library that had switched from MIT to AGPL six months ago in a minor version bump. If the enterprise customer had discovered this, the deal would have died.

The coding-agent identified a MIT-licensed drop-in replacement. Sven swapped the dependency in 20 minutes. The report-generator produced a 34-page compliance report that his legal team formatted and sent to the customer by Thursday. The CI gate now catches license issues on every PR — it's already blocked 2 problematic packages that engineers tried to add in the weeks since.
