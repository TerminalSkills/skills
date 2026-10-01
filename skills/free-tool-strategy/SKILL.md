---
name: free-tool-strategy
description: >-
  Plans a free web tool built to bring in customers: picks the idea, checks it
  against the real buyer, estimates payback, decides where to ask for an email,
  scopes the first version and defines how to judge it. Covers calculators,
  checkers, generators, converters and lookups, including tools backed by a
  paid API. Use when someone says "we want a free tool for leads", "should we
  build a calculator", "engineering as marketing", "lead-gen tool ideas",
  "gate the results or not", or "our free tool gets traffic but no signups".
  Produces a decision memo and a one-page build spec, not the tool's code.
license: Apache-2.0
compatibility: >-
  Any agent with file access. The payback model needs Python 3; the demand check
  reads a Google Search Console performance export (Queries.csv).
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["free-tools", "lead-generation", "growth", "seo", "product-marketing"]
---

# Free Tool Strategy

## Overview

A free tool is a small product with its own costs: days to build, upkeep, sometimes a bill per use. It pays back only when the people who use it are the people who buy, and when using it makes the paid product the obvious next step. Most free tools that fail were chosen because they were easy to build or had search volume, and attracted an audience that was never going to buy.

This skill takes a company from "we should build something" to a decision the founder can defend: a shortlist tested against five gates, a payback estimate in three scenarios, one recommended tool specified on a page, and the numbers that will decide after 90 days whether to keep investing. It also diagnoses an existing tool that draws visitors and no customers.

## Instructions

### 1. Gather the facts

Read the repository for the stack, the existing public pages and how analytics is wired, so the proposal fits what the team can ship. Then ask:

- What is sold, to whom, and what a new customer is worth in the first year.
- How leads become customers today: the share that is a good fit, and the share of those that buy.
- How many developer days are available, and who would maintain the tool.
- Where the audience already comes from: search, a newsletter, communities, partners.
- Whether a Search Console export is available (Performance, Export, then `Queries.csv`).

Without a customer value and a rough close rate, no payback estimate is possible; say that and ask again before proceeding.

### 2. List candidates from the buyer's own chores

Good ideas come from what the buyer works out, checks or produces by hand shortly before they need the product. Mine these sources:

- Questions sales and support answer repeatedly with a number or a file.
- Spreadsheets customers send during onboarding.
- Scripts and internal dashboards the team already built for its own use.
- Search queries that already show the site for a task-shaped phrase:

```bash
grep -iE "calculator|generator|template|checker|converter|estimat|how to calculate" Queries.csv \
  | sort -t, -k3 -nr | head -25
```

The third column is impressions: a query with many impressions and a position beyond 10 is demand the site is close to but not serving.

| Form | The visitor brings | The visitor leaves with | Upkeep and cost |
|---|---|---|---|
| Calculator | A few numbers | A figure that supports a decision | Low; formulas rarely change |
| Checker or grader | A URL, file or snippet | A list of problems, ranked | Medium; rules age, fetches can be abused |
| Generator | A few choices | A draft document, config or name | Low for templates; per-use cost with a language model |
| Converter or formatter | Data in one format | The same data in another | Low; must be exact |
| Lookup or dataset | A question | A row of data nobody else publishes | High; the data must stay current |
| Simulator | Assumptions | A what-if picture | Medium; hardest to make simple |

### 3. Put each candidate through five gates

A candidate that fails any gate is dropped or reshaped, however attractive it looks.

1. **Same person.** The typical user holds the job title that buys the product. A tool for students does not sell to finance directors.
2. **Useful alone.** The result helps someone who never buys. Anything less is a brochure with input fields.
3. **A bridge.** The result exposes the problem the product removes, or the product is the natural way to act on it. Finish this sentence: "Now that you know X, the product does Y for you."
4. **Buildable.** It fits the available days using logic or data the company already has and can vouch for.
5. **Findable.** There is a way for the audience to meet it: search demand the site can plausibly win, or a channel the company controls. Look at who holds the first results now; if they are long-established tools from large brands, the candidate needs a narrower audience or better data, not a prettier interface.

### 4. Estimate payback in three scenarios

Every input is a guess until the tool is live, so present low, base and high, and name the input the answer is most sensitive to (nearly always visits).

```python
def monthly_value(visits, complete, capture, qualified, close, customer_value):
    """Customers and first-year revenue the tool is expected to start each month."""
    customers = visits * complete * capture * qualified * close
    return customers, customers * customer_value

build_cost = 6 * 600      # developer days x day rate
running_cost = 0          # per month: hosting, API calls, data licences
scenarios = {             # visits, finish the tool, leave an email, good fit, become customers
    "low":  (300, 0.40, 0.06, 0.30, 0.05),
    "base": (900, 0.50, 0.10, 0.35, 0.08),
    "high": (2500, 0.60, 0.15, 0.45, 0.10),
}
for name, rates in scenarios.items():
    customers, value = monthly_value(*rates, customer_value=1068)
    net = value - running_cost
    months = build_cost / net if net > 0 else float("inf")
    print(f"{name:5} {customers:5.2f} customers/mo  ${value:6.0f}/mo  payback {months:4.1f} months")
```

Take the user's own conversion rates where they exist. Payback counts from the month traffic arrives, and a new page can take months to rank, so state the wait separately. If the low scenario never pays back and the base depends on traffic the site has no record of winning, say so.

### 5. Decide where to ask for an email

The answer the visitor came for is shown without conditions. An email is requested only for something extra that naturally travels by email.

| Pattern | Use it when | Cost |
|---|---|---|
| No capture, product link only | The product is self-serve and the tool leads straight into a trial | No list growth |
| Optional, after the result | "Email me this report", "save and share", "alert me when it changes" | Lower capture, best goodwill |
| Summary free, detail by email | The full output is long: a multi-page audit, a custom plan | Some visitors leave at the request |
| Email before any result | Each run costs real money or a person's time | Most visitors leave; expect fake addresses |

Ask for the address alone, say exactly what will be sent, and keep marketing consent as a separate unticked box where GDPR or UK GDPR applies. Blocking the result behind a form tends to collect addresses of people who resent it.

### 6. Scope the first version

Version one is one input screen and one result. Include: sensible defaults so the page shows a worked answer before any typing; the method explained in plain text under the tool; a way to copy or share the result; one link to the product phrased as the bridge sentence from gate 3. Leave out accounts, saved history, PDF styling, and every input that changes the answer by less than the visitor's own uncertainty.

Requirements that are cheap now and expensive later:

- **Crawlable page.** Title, explanation and the default example are present in the server-rendered HTML. Google does render JavaScript, but in a later queue, and other crawlers may not render at all.
- **One URL for the tool.** Shared result links carry their inputs in the query string and declare the tool page as canonical. Never mint an indexable page per input combination; Google's spam policies treat pages generated at scale mainly to rank as abuse.
- **Honest structured data.** `WebApplication` markup describes the tool; a rich result additionally requires genuine ratings or reviews, which must not be invented.
- **Cost ceiling** for any tool that calls a paid API: a per-visitor rate limit, a cap on input size, cached results, a monthly budget alarm and a switch that degrades the tool to a waiting list. Keys stay on the server, read from environment variables.

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Reorder Point Calculator",
  "url": "https://crateflow.io/tools/reorder-point-calculator",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Any",
  "offers": { "@type": "Offer", "price": 0, "priceCurrency": "USD" }
}
```

### 7. Define the measurement before launch

Four events are enough. Three are custom names; `generate_lead` is a GA4 recommended event.

```js
gtag('event', 'tool_start',    { tool_name: 'reorder_point_calculator' });   // first input changed
gtag('event', 'tool_complete', { tool_name: 'reorder_point_calculator' });   // result shown
gtag('event', 'generate_lead', { currency: 'USD', value: 30 });              // email accepted by the server
gtag('event', 'tool_to_product', { tool_name: 'reorder_point_calculator' }); // product link clicked
```

Carry the tool's name into the CRM (a hidden field or a UTM-tagged product link) so customers can be traced back to it. Fix the review date and the thresholds now: for example, at 90 days keep investing if the tool produces at least the low-scenario number of qualified leads, otherwise stop adding to it.

### 8. Deliver the memo

1. Candidates table: each idea, the five gates as pass or fail with a one-line reason.
2. Payback table for the survivors, three scenarios each, with the assumptions listed.
3. The recommendation and the runner-up, and why.
4. A one-page spec for the recommended tool (format in Example 1).
5. Risks: what would make this fail, and the cheapest way to find out early.

## Examples

### Example 1: Choosing a tool for an inventory product

**Request:** "Crateflow is inventory software for Shopify merchants, $89 a month. We have six developer days. What free tool should we build?" The user supplies `Queries.csv`, a first-year customer value of $1,068, and says about a third of leads are a good fit and 8% of those buy.

The query filter returns "purchase order template" (2,750 impressions), "how to calculate safety stock" (2,210), "reorder point calculator" (1,840), "inventory turnover calculator" (1,310) and "sku generator" (960).

| Candidate | Same person | Useful alone | Bridge | Buildable | Findable | Verdict |
|---|---|---|---|---|---|---|
| Reorder point and safety stock calculator | Pass | Pass | Pass: Crateflow recalculates it nightly for every SKU | Pass | Pass: two queries, 4,050 impressions | Recommend |
| Purchase order template | Pass | Pass | Weak: a file, used once | Pass | Pass | Runner-up |
| SKU generator | Fail: mostly brand-new stores with no stock problem yet | Pass | Fail | Pass | Pass | Drop |

Payback for the calculator, from the model in step 4:

```text
low    0.11 customers/mo  $   115/mo  payback 31.2 months
base   1.26 customers/mo  $  1346/mo  payback  2.7 months
high  10.12 customers/mo  $ 10814/mo  payback  0.3 months
```

The spread is driven by visits. The site already sits around position 14 to 19 for both queries, so the base case is plausible; the agent says the low case is what happens if the page never reaches the first results.

```text
TOOL        Reorder Point Calculator
URL         /tools/reorder-point-calculator
TITLE       Reorder Point Calculator (with safety stock) | Crateflow
INPUTS      Average daily units sold (default 18) · Supplier lead time in days (default 21)
            · Safety stock in units (default 120, with a helper to derive it)
LOGIC       reorder point = daily units x lead time + safety stock   (defaults give 498)
OUTPUT      "Reorder when stock falls to 498 units", plus the working shown line by line
CAPTURE     Optional, after the result: "Email me this as a sheet for all my SKUs" (address only)
BRIDGE      "Crateflow recalculates this every night for each SKU and drafts the purchase order."
EVENTS      tool_start, tool_complete, generate_lead, tool_to_product
RUNNING     $0 a month; arithmetic runs in the browser. Owner: Hattie (growth). Review: 90 days.
KEEP IF     At least 3 qualified leads a month by day 90
```

### Example 2: A tool with traffic and no customers

**Request:** "Quillhaven makes proposal software for marketing agencies, $59 a seat. Our free invoice generator gets 9,200 visits a month and 14 emails. No customer has ever come from it. Fix it?"

The agent runs the existing tool through the gates instead of tuning its form:

- **Same person: fail.** People searching for a free invoice generator are freelancers of every trade, not agency owners.
- **Bridge: fail.** An invoice is written after the work; a proposal is written before it. Nothing in the result points at the product.
- **Capture:** the email is demanded before the PDF downloads, and 0.15% comply (14 of 9,200).

Recommendation: leave the page running since it costs nothing, stop developing it, and do not expect a better form to rescue an audience that will not buy. The candidate that passes all five gates is a scope-of-work generator for agency retainers: the user is the agency owner, and the output is the first section of a proposal. Because it calls a language model, the spec carries a cost ceiling: the team measured $0.012 per generation, so a $150 monthly budget covers 12,500 runs; limit each visitor to five runs a day, cap the brief at 1,500 characters, and switch to "join the waiting list" when the budget alarm fires. The first draft is shown free; "Send me the editable version" is the optional email step, and the bridge reads "Turn this scope into a priced proposal in Quillhaven."

## Guidelines

- Search volume is not buyer intent. A high-traffic idea that fails the first gate produces a busy page and an empty pipeline.
- Do not present the payback model as a forecast. It is a way to see which assumption matters; replace guesses with measured rates as soon as the tool is live.
- This skill cannot measure keyword volume by itself. Use the user's Search Console export, Google Ads Keyword Planner or Google Trends, and say plainly when no demand data was available.
- A tool that gives wrong answers damages the brand it was meant to build. Have someone who knows the domain check the formula, show the working, and state the limits of the estimate on the page.
- Tools that give financial, legal, medical or tax results need a qualified reviewer and a clear statement of what the output is not.
- Do not fake ratings, user counts or "used by" logos on the tool page or in its structured data.
- A free tool is the wrong move when the company cannot name its buyer yet, has no path from tool to product, or needs revenue this quarter; direct outreach is faster.
- Related work lives elsewhere: page wording (copywriting), the capture form (form-cro), follow-up emails (email-sequence), announcing the tool (launch-strategy), many templated pages (programmatic-seo).
