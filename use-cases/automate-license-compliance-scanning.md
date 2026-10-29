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

Sven is the CTO of a 20-person SaaS startup, two weeks from closing a $400K enterprise deal. The customer's procurement team just asked for a complete open-source license inventory. Sven has no idea what licenses his 847 transitive dependencies carry.

`npm update` checks semver, not licenses, so a package can change its license in a release and nobody notices. `npm ls` gives you the tree but not the licenses. Manual auditing at this scale is impractical, and the packages that matter are usually the ones three levels down that nobody chose on purpose.

## The Solution

Use the **security-audit** skill's dependency scanning habits to inventory the full lockfile tree, the **coding-agent** skill to hand the CI gate and the report script to a background coding agent, and the **report-generator** skill to turn the inventory into a document legal and procurement can read. The tool underneath is `license-checker-rseidelsohn`, the maintained fork of `license-checker` (current release 5.0.1). It reads installed packages in `node_modules`, so install from the lockfile first. This page is engineering guidance, not legal advice: have counsel decide what a flagged license means for your product.

## Step-by-Step Walkthrough

### Step 1: Scan the Full Dependency Tree

Install from the lockfile and add the checker as a dev dependency:

```bash
npm ci --ignore-scripts
npm install --save-dev license-checker-rseidelsohn
npx license-checker-rseidelsohn --production --excludePrivatePackages --summary
```

`--production` limits the scan to what ships; drop it to include build tooling. The summary looks like this (output from a small Express 4 project):

```console
├─ MIT: 65
├─ ISC: 3
└─ BSD-3-Clause: 1
```

Write the full inventory as JSON for later steps:

```bash
npx license-checker-rseidelsohn --production --excludePrivatePackages --json --out licenses.json
```

Each entry is keyed `name@version` and carries `licenses`, `repository`, `path` and `licenseFile`. Packages with no usable `license` field show up as `UNKNOWN` or with a trailing `*` meaning the license was guessed from a README or file; treat both as unassessed. Packages whose manifest says "SEE LICENSE IN ..." need a human to open the file.

For Sven's project the agent reports 847 packages: roughly 94% permissive (MIT, Apache-2.0, ISC, BSD), 4 LGPL-2.1, 2 GPL-3.0, 1 AGPL-3.0 and 10 unknown. Those are the cases that need a decision. For Python projects use `pip-licenses`; for mixed repositories ask the security-audit skill for the Trivy or osv-scanner route it documents.

### Step 2: Analyze Risk and Find Alternatives

Flagging is the easy part. Give the agent the flagged list with how the package is reached (`npm ls <name> --all` shows which direct dependency pulls it in) and how your product is delivered:

```text
For each flagged package: show the dependency path, say how we use it (runtime
in our SaaS backend, build-time only, or admin dashboard only), and propose
permissively licensed replacements. Check each replacement's license on
the npm registry (npm view <pkg> license) before recommending it.
```

What to expect in a case like Sven's:

- **AGPL-3.0, runtime dependency of the SaaS backend: replace.** AGPL section 13 obliges you to offer source to users who interact with a modified version over a network, and combining it with your own code can extend copyleft to that code. Whether unmodified use triggers anything is a question for counsel, but for a deal-critical review the cheap path is swapping it out.
- **GPL-3.0, used only in an internal admin dashboard: review.** GPL obligations attach to distribution; software that runs only on your servers is not distributed, but a replacement is often quicker than a legal opinion.
- **Build-time-only tools** (compilers, test runners) rarely ship in your product; confirm that with `--production` before spending time.
- **Unknown licenses:** open each `licenseFile`. Typically most are MIT text with a missing SPDX field. Anything custom (for example a "no commercial use" clause) is replaced, not interpreted.

### Step 3: Build the CI Compliance Gate

Have the agent write a workflow that fails a pull request when a production dependency carries a license outside your allow-list. `--onlyAllow` exits with code 1 on the first license not in the semicolon-separated list:

```yaml
name: license-check
on:
  pull_request:
    paths: [package.json, package-lock.json]
permissions:
  contents: read
jobs:
  licenses:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci --ignore-scripts
      - run: >
          npx --no-install license-checker-rseidelsohn --production --excludePrivatePackages
          --onlyAllow "MIT;Apache-2.0;ISC;BSD-2-Clause;BSD-3-Clause;0BSD;Unlicense;CC0-1.0;BlueOak-1.0.0"
```

Tested locally against a small project: with `--onlyAllow "MIT;ISC"` the run stopped with `Package "qs@6.16.2" is licensed under "BSD-3-Clause" which is not permitted by the --onlyAllow flag. Exiting.` and exit code 1. Things to know:

- Compound SPDX expressions such as `(MIT OR Apache-2.0)` must be listed exactly as the checker reports them, or they fail.
- `UNKNOWN` fails the gate, which is the point: someone has to look.
- There is no built-in "needs review" label. For weak-copyleft licenses (LGPL, MPL-2.0) keep them out of the allow-list and handle exceptions with `--excludePackages "name@1.2.3"` in the workflow, changed in a reviewed PR that explains why. That puts every exception in git history.
- The workflow only reads the repo (`contents: read`) and runs `npm ci --ignore-scripts`, so a malicious new dependency cannot run install scripts in the license job.

### Step 4: Generate the Compliance Report for Legal

Feed `licenses.json` to the report-generator approach: pandas for the tables, an HTML template, and WeasyPrint if procurement wants a PDF. A minimal version:

```python
import json
import pandas as pd

raw = json.load(open("licenses.json"))
df = pd.DataFrame(
    [{"package": k, "license": str(v.get("licenses")), "repository": v.get("repository", "")}
     for k, v in raw.items()]
)
summary = df["license"].value_counts().rename_axis("license").reset_index(name="packages")
summary["share"] = (summary["packages"] / len(df) * 100).round(1).astype(str) + "%"

html = f"""<!doctype html><meta charset="utf-8"><title>Third-party licenses</title>
<h1>Third-party license inventory</h1><p>{len(df)} production packages.</p>
{summary.to_html(index=False)}<h2>Inventory</h2>{df.sort_values("package").to_html(index=False)}"""
open("license-report.html", "w").write(html)
```

Extend it with the sections procurement usually asks for: executive summary, full inventory (name, version, license, repository), the flagged items and how each was resolved, and the full text of each distinct license. For attribution, run `npx license-checker-rseidelsohn --production --plainVertical --out THIRD-PARTY-LICENSES.txt`, which writes each package with its license text, and ship that file with the product (MIT, BSD and Apache-2.0 require preserving notices). Regenerate the report from CI on each release so it never goes stale.

## Real-World Example

Sven runs the scan on Monday and sees the list above. The AGPL package turns out to be pulled in by an analytics library two levels down; the agent proposes an MIT-licensed alternative, checks its license on the registry, and the swap touches two import paths. The test suite passes. The one package with a "no commercial use" clause is replaced the same afternoon. The GPL charting library is only used in the internal admin dashboard, so it goes to counsel after the deal-critical items.

By Thursday the HTML report is converted to PDF and sent through legal to procurement, who ask no follow-up questions. The CI gate goes live the same week. Two weeks later a developer adds a validation library under SSPL; the check fails with the package and license named, he picks an MIT alternative, and the PR merges the same day. The contract requires an annual license attestation, and a year later regenerating the inventory is a single command rather than a week of digging.

## Related Skills

- [coding-agent](/skills/coding-agent) - delegate the CI workflow and report script to a background agent
- [security-audit](/skills/security-audit) - dependency scanning for CVEs alongside licenses
- [report-generator](/skills/report-generator) - turn the inventory into a document for legal review
