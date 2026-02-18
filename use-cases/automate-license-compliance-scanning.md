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

Sven is the CTO of a 20-person SaaS startup, two weeks from closing a $400K enterprise deal. The customer's procurement team just sent a vendor assessment requiring a complete open-source license inventory. Sven has no idea what licenses his 847 transitive dependencies carry.

Here is why that matters: somewhere in that dependency tree, a package quietly switched from MIT to AGPL in a minor version bump six months ago. Nobody noticed because `npm update` does not check licenses — it checks semver. A competitor just got sued for GPL violation, and the offending package was buried 4 levels deep in the transitive dependency chain. Nobody on the team had ever heard of it, let alone checked its license.

Manual license auditing is impractical at this scale. Running `npm ls` gives you the tree but not the licenses. Existing license checkers miss dual-licensed packages, do not detect license changes between versions, and cannot tell you which licenses actually conflict with commercial SaaS distribution. The enterprise deal closes in two weeks. If the customer's legal team discovers an AGPL dependency in the inventory, the deal dies.

## The Solution

Using the **security-audit** skill to scan the full dependency tree, the **coding-agent** to build CI checks that prevent problematic licenses from entering the codebase, and the **report-generator** to produce compliance reports for legal review, the agent handles the entire pipeline from audit to ongoing enforcement.

## Step-by-Step Walkthrough

### Step 1: Scan the Full Dependency Tree

Start with the complete picture — not just direct dependencies, but every transitive package pulled in by the lockfile:

```text
Scan all dependencies in our project (package.json + lockfile). For each package, identify the license. Flag any that are AGPL, GPL, SSPL, or unknown.
```

847 packages analyzed. The breakdown:

| License | Count | Percentage | Risk Level |
|---|---|---|---|
| MIT | 612 | 72.3% | Permissive |
| Apache-2.0 | 98 | 11.6% | Permissive |
| ISC | 67 | 7.9% | Permissive |
| BSD-2-Clause | 31 | 3.7% | Permissive |
| BSD-3-Clause | 22 | 2.6% | Permissive |
| LGPL-2.1 | 4 | 0.5% | Weak copyleft |
| GPL-3.0 | 2 | 0.2% | Strong copyleft |
| AGPL-3.0 | 1 | 0.1% | Network copyleft |
| Unknown/Custom | 10 | 1.2% | Unassessed |

Three items need immediate attention:

**Critical:** `@some-org/data-processor@2.1.0` is AGPL-3.0. It is a transitive dependency pulled in through `analytics-lib` — two levels deep, invisible unless you specifically look. AGPL requires releasing the entire application source code for network use, which is exactly what a SaaS product does. If this ships to an enterprise customer's security review, the deal is over.

**Warning:** `chart-renderer@4.2.1` is GPL-3.0, used only in the admin dashboard via `dashboard-components`. GPL may require releasing linked code under GPL terms, though the SaaS distribution question is legally murky.

**Unknown:** 10 packages have no SPDX identifier. Their `package.json` files say things like "SEE LICENSE IN LICENSE.txt" or have no license field at all. These are the wildcards — most will turn out to be MIT or public domain with sloppy metadata, but any one of them could be hiding a restrictive license that makes the entire inventory unreliable.

The 98.6% permissive rate looks good at first glance. But in license compliance, the problem is always the 1.4%.

### Step 2: Analyze Risk and Find Alternatives

Flagging packages is the easy part. Each issue needs a risk assessment specific to Sven's commercial SaaS use case and a concrete path to resolution:

```text
For each flagged package, assess the actual risk for our commercial SaaS product. Suggest MIT/Apache alternatives where we need to replace.
```

**`@some-org/data-processor` (AGPL-3.0) — REPLACE immediately:**
Risk is high and unambiguous. AGPL requires source code disclosure for software accessed over a network, which is the definition of SaaS. There is no gray area here — if this dependency ships, the entire application source code must be made available to anyone who accesses the service. Drop-in replacement: `data-transform@3.4.0` (MIT, 2.1K GitHub stars, actively maintained, same API surface). The migration is mechanical — swap import paths in 2 files, run the test suite to confirm behavioral equivalence.

**`chart-renderer` (GPL-3.0) — REVIEW:**
Risk is medium. The package is only used in the internal admin dashboard, which is not distributed to end users. Two options: replace with `chart-lib@5.0.0` (Apache-2.0, widely used in commercial projects), or get a legal opinion on whether GPL applies when the code runs on your own servers and is never distributed. The safer and faster path is replacement.

**10 unknown licenses — REVIEW:**
Manual inspection of each `LICENSE.txt` reveals that 7 contain MIT-equivalent text but simply lack the SPDX identifier in `package.json`. Two are public domain declarations. One has a custom restrictive license that prohibits commercial use in a non-standard clause buried in paragraph 4 — this package needs to be replaced immediately.

### Step 3: Build the CI Compliance Gate

The one-time cleanup addresses the current state. But without ongoing enforcement, the problem comes back the next time a developer runs `npm install some-cool-library` without checking its license — which happens roughly once a week. Manual vigilance does not scale. Automated gates do.

```text
Create a CI pipeline step that blocks PRs adding dependencies with prohibited licenses. Allow-list our approved licenses.
```

The workflow `.github/workflows/license-check.yml` triggers on any PR that modifies `package.json` or the lockfile. It scans every new or updated dependency and its entire transitive tree — because the problem is rarely the direct dependency, it is the transitive one three levels deep that nobody checked:

- **Allowed (auto-approve):** MIT, Apache-2.0, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Unlicense
- **Review required (PR labeled, not blocked):** LGPL-2.1, LGPL-3.0, MPL-2.0
- **Blocked (PR fails):** GPL-2.0, GPL-3.0, AGPL-3.0, SSPL-1.0, EUPL

When a developer adds a dependency with a blocked license, three things happen:

1. The PR check fails with a clear message naming the problematic package, its license, and which dependency pulled it in (direct or transitive)
2. A comment is posted on the PR suggesting permissively-licensed alternatives that provide similar functionality
3. The PR gets labeled `license-review-needed` so it shows up in the legal team's dashboard

An override path exists for edge cases via `.license-allowlist.json`. Adding a package to the allowlist requires a written justification explaining why the license risk is acceptable — and that justification gets committed to the repo and reviewed as part of the PR. No silent exceptions.

### Step 4: Generate the Compliance Report for Legal

The enterprise customer needs a formal document suitable for their legal and procurement teams, not a terminal output:

```text
Generate a full license compliance report suitable for enterprise customer due diligence. Include license texts and attribution notices.
```

The report comes as a 34-page PDF with five sections:

- **Executive summary** — 847 dependencies, 98.6% permissive licenses, 1 critical issue resolved, 1 under legal review
- **Full inventory** — package name, version, license, author, and repository URL for every dependency, sorted alphabetically
- **License texts** — all 8 distinct license types included in full, as required for attribution
- **Attribution notice** — a combined `NOTICES.md` file ready for product distribution
- **Risk items** — 3 flagged, 2 resolved with details, 1 under legal review with expected timeline

Alongside the PDF, three machine-readable files are generated: `NOTICES.md` for attribution (required by Apache-2.0 and BSD licenses), `.license-allowlist.json` for the CI gate, and `THIRD-PARTY-LICENSES.txt` as a machine-readable inventory that can be programmatically audited.

## Real-World Example

Sven swaps the AGPL dependency on Tuesday morning. The `data-transform` package has the same API surface, so the change is 4 lines of import path updates across 2 files. He runs the full test suite — everything passes, no behavior changes. The custom restrictive license package (the one with the prohibition buried in paragraph 4) gets replaced with a well-known MIT alternative in 15 minutes. The GPL chart renderer gets a legal review scheduled, but since it is only used in the internal admin dashboard and is never distributed to customers, it is deprioritized behind the deal-critical items.

The report generator produces the 34-page compliance report by Thursday morning. Sven's legal team reviews it, adds a cover letter with the company's standard vendor questionnaire responses, and sends it to the customer's procurement team. The report is thorough enough that procurement does not come back with follow-up questions — a rarity in enterprise sales.

The CI gate goes live the same week, and its value becomes obvious almost immediately. Two weeks later, a developer tries to add a data validation library that carries an SSPL license — MongoDB's custom copyleft license that prohibits offering the software as a service without releasing all management and orchestration code. The PR check fails with a clear explanation of why SSPL is incompatible with commercial SaaS and suggests three MIT-licensed alternatives. The developer picks one, swaps the import, and the PR ships the same day. No legal review needed, no Slack thread asking "is this license OK?", no delay.

The enterprise deal closes on schedule. The $400K contract includes a clause requiring annual license compliance attestation. The next time procurement asks for an updated inventory — twelve months later, with 200 more dependencies added during the year — it takes 5 minutes to regenerate the report instead of a week of panic.
