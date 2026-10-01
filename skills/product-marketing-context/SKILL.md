---
name: product-marketing-context
description: >-
  Creates and maintains `.claude/product-marketing-context.md`, one sourced file that records what
  the product is, who buys it, what they use instead, the proof behind each claim, customer
  wording, pricing and goals, so later marketing tasks read facts instead of asking again or
  guessing. Drafts it from the repository and site, interviews the user for the gaps, tags every
  statement with its source, and checks the file with a script. Use when someone says "set up
  marketing context", "product context", "positioning document", "write down our messaging", "we
  repositioned, update the context", or before the first copywriting, CRO, SEO or email task in a
  project.
license: Apache-2.0
compatibility: >-
  Any repository. The file is plain Markdown read by Claude Code, Codex, Gemini CLI and Cursor.
  The check script needs Python 3.8+.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["positioning", "messaging", "product-marketing", "context", "documentation"]
---

# Product Marketing Context

## Overview

Marketing work goes wrong in a predictable way when an agent starts cold: it invents an audience,
borrows claims from the category, and writes in a voice nobody at the company uses. This skill
fixes the inputs once. It produces a single file, `.claude/product-marketing-context.md`, that
other skills in this catalog (copywriting, page and form optimisation, pricing, email, SEO, ads)
look for before they ask questions.

The file is a record of facts, not a piece of copy. Three properties make it useful:

- **Sourced.** Each statement says where it comes from, so a reader can tell a measured number
  from a founder's belief.
- **Honest about gaps.** What is unknown is written down as an open question with an owner.
- **Short and current.** Under 200 lines, with a review date; superseded facts are removed, since
  version control keeps the history.

## Instructions

### 1. Check what exists

```bash
ls -l .claude/product-marketing-context.md 2>/dev/null
grep -nE "^## |^Last reviewed|TODO\(" .claude/product-marketing-context.md 2>/dev/null
```

If the file exists, go to step 6 (update). If not, continue.

### 2. Read the project before asking anything

| Evidence | Where to look | Feeds section |
|---|---|---|
| What the product is and does | `README.md`, `docs/` introduction, `package.json` description | Product |
| Claims made in public | Landing page source, `title` and meta description, Open Graph tags | Product, Differentiators |
| Plans, prices, trial | Billing or plan configuration in code, the pricing page | Offers and pricing |
| What shipped recently | `CHANGELOG.md`, release notes | Differentiators |
| Named alternatives | Comparison or "alternatives" pages, migration guides, importers | Problem and alternatives |
| Worries buyers raise | FAQ, help centre articles, security page | Objections |
| Quotes and results | Testimonial and case-study content, with who said it | Differentiators and proof |
| The action that counts | Analytics event names, signup and checkout routes | Goals and measures |

```bash
grep -rnoiE "<title>[^<]+|name=\"description\" content=\"[^\"]+|og:(title|description)\" content=\"[^\"]+" \
  --include=*.html --include=*.tsx --include=*.jsx --include=*.astro --include=*.vue . 2>/dev/null | head -20
grep -rnEil "testimonial|case stud|compared to|alternative to| vs " --include=*.md --include=*.mdx --include=*.tsx . 2>/dev/null | head -20
grep -rnE "price|amount|interval|trial" --include=*plan*.ts --include=*pricing*.ts --include=*billing*.ts . 2>/dev/null | head -20
```

Write down contradictions as you find them (the README says freelancers, the landing page says
agencies). They are the most valuable output of this step.

### 3. Ask for what the repository cannot show

Ask in two short rounds, never as one long form. Offer to read material instead of asking:
call notes, interview transcripts, reviews, support tickets, a sales deck.

Round one:

1. Who pays, who uses it day to day, and what happened in their work just before they went looking?
2. What were they using before, and what would they go back to if the product vanished?
3. When a customer recommends it to a peer, what do they say? Exact words, if you have them.
4. What can you prove: a number, a named customer, a permission to quote?

Round two, after showing the draft:

5. The last three deals lost or accounts cancelled: what was the stated reason?
6. Which words do customers use for the problem, and which words should never appear?
7. The one action marketing should drive, and the current numbers for it.

### 4. Write the file

Fixed headings, in this order, so other skills and the check script can find them:

| Section | Holds | Limit |
|---|---|---|
| Header | Product name, `Last reviewed: YYYY-MM-DD`, owner, sources used | 4 lines |
| Product | What it is, what form it takes, the category a buyer would name | 3 to 5 statements |
| Audience | Who buys, who uses, company type, the event that starts the search | One group per bullet |
| Problem and alternatives | The problem in customer words; what they use instead and why it falls short | Alternatives include "nothing" and "a spreadsheet" |
| Differentiators and proof | What the product does that the alternatives do not, each with evidence | No evidence means `[assumption]` |
| Objections | Each worry with the true answer | Top three to five |
| Language | Words customers use; words to avoid; product terms | Quotes verbatim |
| Voice | How the company writes: two or three sentences | No source tags needed |
| Offers and pricing | Plans, prices, trial, guarantees | From code or billing, with date |
| Goals and measures | Primary action, current rate, target | Numbers carry their date |
| Open questions | `TODO(owner): question` | Remove when answered |

Rules for every statement outside Voice and Open questions:

- One fact per bullet, ending in a source tag:
  `[repo: path]`, `[site: url]`, `[data: system, date]`, `[customer: who, date]`,
  `[user: date]` for what the user told you, or `[assumption]`.
- Customer words go in quotation marks, unedited. Do not tidy them into marketing language.
- A number without a date and a system of record is an assumption.
- What a competitor does or charges is recorded only from their public page with the date
  checked, or as a customer's words. Never from memory.
- Nothing confidential when the repository is public: no unreleased plans, no customer names
  without permission.

### 5. Check and connect it

Save the script as `scripts/check_context.py` (or run it once from a scratch directory):

```python
"""Usage: python3 check_context.py [.claude/product-marketing-context.md]"""
import re, sys
from datetime import date

path = sys.argv[1] if len(sys.argv) > 1 else ".claude/product-marketing-context.md"
lines = open(path, encoding="utf-8").read().splitlines()
text = "\n".join(lines)
SECTIONS = ["Product", "Audience", "Problem and alternatives", "Differentiators and proof", "Objections",
            "Language", "Voice", "Offers and pricing", "Goals and measures", "Open questions"]
TAG = re.compile(r"\[(repo|site|user|customer|data|assumption)\b[^\]]*\]")
problems = [f"section missing: ## {s}" for s in SECTIONS if not re.search(rf"^## {re.escape(s)}\s*$", text, re.M)]

reviewed = re.search(r"^Last reviewed: (\d{4})-(\d{2})-(\d{2})", text, re.M)
if not reviewed:
    problems.append("no 'Last reviewed: YYYY-MM-DD' line")
elif (date.today() - date(*map(int, reviewed.groups()))).days > 90:
    problems.append("last review is more than 90 days old")

section = ""
for number, line in enumerate(lines, 1):
    if line.startswith("## "):
        section = line[3:].strip()
    elif line.startswith("- ") and section not in ("", "Voice", "Open questions"):
        if not TAG.search(line) and "TODO(" not in line:
            problems.append(f"line {number}: statement without a source tag")
if len(lines) > 200:
    problems.append(f"{len(lines)} lines; keep it under 200")

print(f"{path}: {len(lines)} lines, {text.count('TODO(')} open questions, {text.count('[assumption')} assumptions")
for p in problems:
    print("  FIX " + p)
sys.exit(1 if problems else 0)
```

Then make sure agents find the file. Add one line to the project instruction file the team's
agent reads (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md` or a Cursor rule):

```markdown
Marketing facts (audience, claims, proof, pricing, wording) are in `.claude/product-marketing-context.md`.
Read it before writing or reviewing anything customer-facing; do not restate it here.
```

Keep the path inside backticks. In Claude Code an `@` path outside backticks is an import and
would load the whole file into every session, including the ones that fix a build. Commit the
file so teammates and CI agents share it.

### 6. Update an existing file

1. Run the check script and read the open questions.
2. Change only the sections the news affects; replace statements, do not append history.
3. Set `Last reviewed` to today and add the new sources to the header.
4. Search the project for material that now disagrees and list it for the user:

```bash
grep -rnE 'freelancers?|\$19( |/)|per month' --include=*.md --include=*.mdx --include=*.tsx --include=*.html . | grep -v product-marketing-context
```

### 7. Report

Tell the user, in this order: what the file now says in five lines; contradictions found between
sources; open questions with owners; assumptions that need evidence; files that disagree with it.

## Examples

### Example 1: first draft from a repository

Request: "Set up the marketing context for Brindle CRM."

The agent reads the README, the landing page, `src/billing/plans.ts` and six call notes the user
drops into `notes/calls/`, asks round one, and writes (shortened here):

```markdown
# Product marketing context: Brindle CRM

Last reviewed: 2026-10-01
Owner: Maya Okafor
Sources: repository, brindlecrm.com, 6 customer calls (September 2026), Stripe export

## Product
- Brindle is a CRM for independent insurance brokers: policies, renewals and client notes in one record. [repo: README.md]
- Category the buyer would name: "broker CRM" or "agency management system". [customer: 4 of 6 calls]

## Audience
- Brokerages with 2 to 15 staff in the UK and Ireland. [data: Stripe export 2026-09-28, 212 of 240 accounts]
- Trigger to look: a missed renewal, or a handler leaving with client knowledge in their inbox. [customer: calls 2, 3, 5]

## Problem and alternatives
- "We found out the policy had lapsed when the client rang to claim." [customer: Oakfield Insurance call, 2026-09-12]
- What they use instead: a shared spreadsheet plus Outlook reminders. [customer: 5 of 6 calls]

## Differentiators and proof
- Renewal calendar built from policy end dates, with handler assignment. [repo: src/renewals/]
- Customers report fewer missed renewals. [assumption] TODO(Maya): get a number and permission to quote.

## Offers and pricing
- £39 per user per month; £390 per user per year; 14-day trial without a card. [repo: src/billing/plans.ts]

## Open questions
- TODO(Jon): the pricing page says "from £29"; the code says £39. Which is right?
```

Check output and report:

```text
.claude/product-marketing-context.md: 48 lines, 4 open questions, 1 assumptions
```

"Draft saved. Two things need you: the pricing page and the code disagree on the price (£29 and
£39), and the main benefit, fewer missed renewals, has no number behind it yet. Until it does,
copy should describe the renewal calendar rather than claim a result."

### Example 2: update after a change of audience and price

Request: "Sproutdeck now sells to agencies instead of freelancers, and the plan went from $19 to
$49 per workspace. Update the context."

The agent runs the check (file last reviewed 2026-05-14, flagged as stale), rewrites Audience,
Problem and alternatives, Language and Offers and pricing from the user's notes on four agency
calls, moves two freelancer quotes out, marks the old differentiator "works offline" as
`[assumption]` because no agency mentioned it, and runs the search from step 6:

```text
content/blog/invoice-tips-for-freelancers.mdx:3: description: "For freelancers who ..."
app/(site)/page.tsx:41: <p>Built for freelancers. $19 per month.</p>
emails/welcome-1.mdx:12: As a freelancer, you ...
```

Report: sections changed, three files that still address freelancers or show $19, and one open
question: "TODO(Priya): do agencies need client-level permissions? Two of four calls raised it."

## Guidelines

- Do not fill a gap with a plausible sentence. An empty section with a `TODO` is correct; an
  invented persona is a defect that every later task inherits.
- Do not record testimonials, customer counts or logos that cannot be traced to a real customer
  and a permission. In the US, 16 CFR Part 465 makes fabricated testimonials unlawful.
- Do not paste the whole landing page in. The file records the facts behind the copy.
- Do not let it become a strategy essay. If a section passes its limit, the extra belongs in a
  separate document linked from the header.
- When two sources conflict, keep both in Open questions until the owner decides; do not pick.
- For several products in one repository, keep this path for the main product and add one file
  per extra product, such as `.claude/product-marketing-context.invoicing.md`, listed in the header.
- Review it when pricing, audience or the main claim changes, and at least every 90 days; the
  check script fails after that.
- When not to use it: a single small task where the user has already given the facts in the
  request, or a repository that holds no product (a library of scripts, a personal site).
