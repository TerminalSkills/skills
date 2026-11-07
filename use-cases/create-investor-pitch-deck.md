---
title: "Create an Investor Pitch Deck from Product Data"
slug: create-investor-pitch-deck
description: "Turn your metrics, product data, and market research into a compelling investor pitch deck ready for fundraising."
skills: [ai-slides, data-analysis, content-writer]
category: business
tags: [pitch-deck, fundraising, investors, startup, presentations]
---

# Create an Investor Pitch Deck from Product Data

## The Problem

You're raising a seed round. Investors expect a focused deck of 12-15 slides that tells a story backed by data. You have the data — MRR growth, user metrics, market research — scattered across Stripe exports, analytics tools, and spreadsheets. What you don't have is the weeks it takes to learn pitch deck design.

Most founder-made decks fail for the same reasons: too much text, no visual hierarchy, metrics presented without context, and a story that buries the lead. The traction slide sits at slide 9 behind five slides of "here's our vision". The market slide says "$50B TAM" with no explanation of how it was calculated. The competition slide shows a 2x2 matrix where your company conveniently occupies the top-right quadrant.

You know your business — you just need help translating raw data into a narrative that makes investors lean forward.

## The Solution

Use **data-analysis** (pandas and matplotlib) to turn raw exports into verified numbers and clean charts, **content-writer** to craft the narrative and key messaging, and **ai-slides** to write the deck as slide-by-slide Markdown and export it to PowerPoint and PDF with Marp. Every number on a slide comes from a script you can re-run, not from a model's memory.

## Step-by-Step Walkthrough

The process moves from raw data to finished deck in five steps: compute the strongest metrics, build the narrative, generate charts, assemble the deck, and create variants for different contexts.

### Step 1: Compute the Strongest Data Points

Put your exports in one folder (`mrr.csv`, `mrr_by_customer.csv`, `users.csv`, `market-research.md`) and ask:

```text
Using the CSVs in this folder, work out the strongest data points for a seed-stage pitch: MRR growth, compound monthly growth, net revenue retention, user retention. Show the code you used for each number.
```

The agent follows the data-analysis skill: load with pandas, compute, print. Two scripts carry most of the weight. Growth from a monthly `mrr.csv` (`month,mrr_usd`), which also draws the traction chart:

```python
import matplotlib
matplotlib.use("Agg")                      # no display needed
import matplotlib.pyplot as plt
import pandas as pd

mrr = pd.read_csv("mrr.csv", parse_dates=["month"])
first, last = mrr["mrr_usd"].iloc[0], mrr["mrr_usd"].iloc[-1]
months = len(mrr) - 1
cmgr = (last / first) ** (1 / months) - 1      # compound monthly growth rate
print(f"MRR ${first:,.0f} -> ${last:,.0f}: {last / first - 1:.0%} in {months} months, {cmgr:.1%} per month")

fig, ax = plt.subplots(figsize=(8, 4.5))
colors = ["#94A3B8"] * (len(mrr) - 1) + ["#2563EB"]   # highlight the current month
ax.bar(mrr["month"].dt.strftime("%b"), mrr["mrr_usd"] / 1000, color=colors)
ax.set_title(f"MRR grew {last / first - 1:.0%} in {months} months", loc="left", fontsize=14)
ax.set_ylabel("MRR, $K")
ax.spines[["top", "right"]].set_visible(False)
fig.tight_layout()
fig.savefig("chart_mrr_growth.png", dpi=150)
```

Net revenue retention from a per-customer export (`customer_id,month,mrr_usd`, month as the first of the month):

```python
import pandas as pd

df = pd.read_csv("mrr_by_customer.csv", parse_dates=["month"])
latest = df["month"].max()
year_ago = latest - pd.DateOffset(months=12)

start = df[df["month"] == year_ago].set_index("customer_id")["mrr_usd"]
now = df[df["month"] == latest].set_index("customer_id")["mrr_usd"]
# today's MRR from the customers you had a year ago: expansion minus churn and contraction
nrr = now.reindex(start.index).fillna(0).sum() / start.sum()
print(f"Net revenue retention (12 months): {nrr:.0%}")
```

For Marta's example company the analysis surfaces:

- **Growth:** MRR $18K to $47K in 8 months (161%), 12.7% compound monthly growth
- **Retention:** 118% net revenue retention, 89% of new users still active after week 1
- **Users:** 1,240 active users, 67% of signups organic
- **Market:** $8.2B developer tools for mid-market (from her research notes, with the source cited), three incumbents, all enterprise-focused

The 118% net revenue retention is the headline. It means existing customers expand faster than churn eats away revenue, so revenue compounds even without new customers. The 67% organic share matters for a different reason: growth is not dependent on paid acquisition.

Check each figure before it goes on a slide. The market number in particular needs a source or a bottom-up calculation (customers times price) you can defend out loud.

### Step 2: Build the Narrative Arc

Data without narrative is a spreadsheet. The classic structure works because it mirrors how people process a pitch: problem, insight, proof, opportunity, ask.

```text
Write the pitch narrative with the content-writer approach: audience is seed investors, one message per slide, titles that state the takeaway. Order: problem, insight, solution, traction, market, business model, team, ask.
```

| Slide | Content | Purpose |
|-------|---------|---------|
| 1 | Title — Developer tools that mid-market teams actually use | Hook |
| 2 | Problem — Mid-market eng teams (50-500 people) lose hours every week to tooling gaps | Pain |
| 3 | Insight — They don't need simpler enterprise tools; they need tools built for their workflow | "Why now" |
| 4 | Solution — One line, a screenshot, 3 key capabilities | The product |
| 5 | Traction — $47K MRR, 161% growth, 118% NRR | Proof |
| 6 | How it works — Product flow in 3 steps | Clarity |
| 7 | Market — $8.2B, bottom-up calculation in the notes | Opportunity |
| 8 | Business model — Self-serve plus sales-assisted, $200-2,000/mo | Economics |
| 9 | Competition — Positioning matrix showing the mid-market gap | Differentiation |
| 10 | Go-to-market — Product-led growth, community, partnerships | Distribution |
| 11 | Team — Relevant experience and unfair advantages | Credibility |
| 12 | Financials — 18-month projection, path to $1M ARR | Vision |
| 13 | Ask — $2.5M seed, 18 months runway, 3 milestones | The close |

The critical decision: traction moves to slide 5 instead of the usual slide 9. By then the investor has heard the problem and the insight, and sees proof that it is working. The ask is specific: an amount, a runway, and concrete milestones. A vague "we need $2-4M for growth" signals that the math has not been done.

### Step 3: Generate the Charts

Charts do the heavy lifting in investor meetings. A clean retention curve says more than three slides of text:

```text
Create PNG charts for the traction slide: MRR growth (bar chart, current month highlighted), weekly user retention curve, and DAU/MAU trend. Minimal styling, our colors #2563EB and #1E293B, titles that state the finding.
```

The data-analysis skill saves charts as 150 DPI PNG files with labeled axes, using the same pattern as the script above: `chart_mrr_growth.png`, `chart_retention.png`, `chart_engagement.png`. One chart per slide; if two charts compete, make two slides. Put the calculation behind any market figure in the speaker notes so you can defend it.

### Step 4: Assemble the Deck

Ask for the deck as a Marp Markdown file, as the ai-slides skill describes:

```text
Write pitch-deck.md for Marp using the 13-slide narrative and the charts. Max 6 lines per slide and 6 words per bullet, takeaway titles, speaker notes as HTML comments with likely investor questions.
```

The file looks like this (slides are separated by `---`, notes are HTML comments):

```markdown
---
marp: true
theme: default
paginate: true
style: |
  section { font-family: Inter, Helvetica, Arial, sans-serif; color: #1E293B; }
  h1 { color: #2563EB; }
---

# $47K MRR, up 161% in 8 months

![bg right:55% fit](chart_mrr_growth.png)

- 1,240 active users
- 118% net revenue retention

<!-- Open with the number. Growth is 12.7% per month, compounded.
Likely question: how much of this is organic? Answer: 67% of signups. -->

---

# The ask: $2.5M seed

- 18 months of runway
- Three milestones
```

Export with the Marp CLI (needs Node.js and a local Chrome, Edge or Firefox for PowerPoint and PDF output):

```bash
npx @marp-team/marp-cli@latest pitch-deck.md --pptx --allow-local-files -o pitch-deck-seed-2026.pptx
npx @marp-team/marp-cli@latest pitch-deck.md --pdf --pdf-notes --allow-local-files -o pitch-deck-seed-2026.pdf
```

`--allow-local-files` lets the export read your chart images; run it only on decks you wrote. Open the result and check for overflow before you send it. A Marp-exported `.pptx` renders each slide as an image, so add `--pptx-editable` next to `--pptx` (experimental; it also needs LibreOffice Impress installed and can fail on themes with complex styles) if the team needs to edit text in PowerPoint, or keep the Markdown as the source of truth.

### Step 5: Create Variant Versions

A full 13-slide deck is for partner meetings. Cold emails need something shorter, and diligence meetings need something deeper:

```text
From pitch-deck.md make a 5-slide teaser (problem, solution, traction, market, ask) and a separate appendix deck with unit economics, cohort data, and competitive analysis.
```

**Teaser (5 slides):** the hook for an email attachment; keep the PDF small (a few MB) by exporting charts at 150 DPI. No product demo, team, or financials — just enough to earn the meeting.

**Appendix:** unit economics (LTV:CAC, payback period, gross margin), cohort analysis, a feature-level competitive matrix, customer quotes, roadmap, the detailed financial model, and the cap table. It is not sent proactively; it is ready when an investor asks "walk me through your unit economics". Re-run the Step 1 scripts so every appendix number matches the main deck.

## Real-World Example

Marta, co-founder of a developer tools startup, had 3 weeks before her first investor meetings. Her metrics were strong, but her existing deck was 22 slides of bullet points on white backgrounds, and two angel investors had passed. One said: "I couldn't find the numbers."

She exported Stripe data and analytics CSVs and ran the Step 1 scripts. The analysis showed 118% net revenue retention, a number she had buried on slide 18. The narrative moved traction from slide 9 to slide 5, and the problem statement sharpened from "developers need better tools" to a specific claim about mid-market engineering teams that she could back with her own customer interviews. The agent wrote the deck as Marp Markdown, and she exported a PowerPoint and a PDF.

She sent the 5-slide teaser to 12 investors; 7 took meetings, up from 2 of 10 with her old deck. When one partner asked about unit economics, she opened the appendix. These are Marta's own numbers; the deck did not build the company, but it stopped being the thing that lost deals.

## Related Skills

- [ai-slides](/skills/ai-slides) — slide structure and Marp export
- [data-analysis](/skills/data-analysis) — pandas metrics and matplotlib charts
- [content-writer](/skills/content-writer) — narrative and key messaging
