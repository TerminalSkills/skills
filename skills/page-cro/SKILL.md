---
name: page-cro
description: >-
  Audits a marketing page (homepage, ad landing page, pricing, feature page or
  article) to find why visitors do not take the next step, and returns ranked
  fixes with evidence plus a test plan sized for the page's traffic. Use when
  someone says "this page isn't converting", "audit my landing page", "improve
  conversions", "CRO", "conversion rate optimization", "why is my bounce rate
  high", or "what should we A/B test". Measures by device and source first,
  captures what the visitor actually reads, checks speed and accessibility
  against published thresholds, separates defects from hypotheses, and says
  when traffic is too low to test at all.
license: Apache-2.0
compatibility: >-
  Any agent that can fetch URLs and run Python 3.9+ (standard library only).
  Optional: Node.js 22.19+ with Chrome for Lighthouse 13, a browser tool for
  screenshots and JavaScript-rendered pages, a CrUX API key in CRUX_API_KEY,
  and read access to Google Analytics 4.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["cro", "conversion", "landing-pages", "ab-testing", "web-performance"]
---

# Page CRO: Auditing Marketing Pages for Conversion

## Overview

Most page audits start with opinions about the headline. This one starts with numbers: who arrives, on what device, from where, and how the page performs for each group. Only then does the agent read the page, and it reads what the visitor gets, not what the team intended.

The result is a short report: baseline by segment, findings ranked by how many visitors they affect, each labelled as a defect to fix, a change to ship, or a hypothesis to test, with the arithmetic that says whether a test is even possible. Forms inside signup flows, popups and post-signup onboarding are separate jobs.

## Instructions

### 1. Establish what the page is for

Get the URL, the single action that counts as success (trial started, demo requested, purchase, email captured), and where visitors come from. In the repository, find the page's template or component, the event that records the action, and the ad copy, email or search snippet that sends people there. A page with two equally weighted goals has none; make the owner choose.

### 2. Measure before reading

Pull the last 28 to 90 days, long enough to cover a few hundred conversions if the page has them:

| Cut | What it reveals |
|---|---|
| Conversion rate by device | A mobile rate far below desktop points at layout, speed or form problems, not copy |
| By source and campaign | Paid visitors converting far below organic points at a mismatch between ad and page |
| New against returning | Returning visitors who still do not act point at missing proof or price information |
| Clicks on the primary button against completed actions | A large gap puts the problem after the click (form, checkout), not on the page |

In GA4 use the Landing page report with the action marked as a key event, with device category and session default channel group as comparisons. Then get speed as real users experience it. Core Web Vitals are judged at the 75th percentile, mobile and desktop separately: Largest Contentful Paint good at 2.5 s or less and poor above 4 s; Interaction to Next Paint good at 200 ms or less and poor above 500 ms; Cumulative Layout Shift good at 0.1 or less and poor above 0.25.

```bash
# Field data from real Chrome users (needs a free API key in CRUX_API_KEY)
curl -s -X POST "https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${CRUX_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://saltmarshbooks.com/restaurants","formFactor":"PHONE","metrics":["largest_contentful_paint","interaction_to_next_paint","cumulative_layout_shift"]}'

# Lab run when the page has too little traffic for field data (mobile emulation by default)
npx lighthouse https://saltmarshbooks.com/restaurants --only-categories=performance,accessibility \
  --output=json --output-path=./lighthouse.json --quiet --chrome-flags="--headless=new"
```

The p75 values are at `record.metrics.largest_contentful_paint.percentiles.p75` and its siblings. In the Lighthouse file read `audits["largest-contentful-paint"].numericValue` (milliseconds), `audits["cumulative-layout-shift"].numericValue`, and the `color-contrast` and `target-size` audits. Lab numbers are for diagnosis; field numbers are what visitors experienced.

### 3. Capture what the visitor reads

Save this as `page_outline.py` and run it against the URL. It prints the page in reading order, stripped to the parts that carry the argument.

```python
"""List what a visitor reads first on a page: title, headings, actions, forms."""
import sys, urllib.request
from html.parser import HTMLParser

class Outline(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self.open, self.fields, self.no_alt = [], [], 0, 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("title", "h1", "h2", "h3", "button") or (tag == "a" and a.get("href")):
            self.open.append([tag, a.get("href", ""), ""])
        elif tag == "meta" and a.get("name") == "description":
            self.rows.append(("meta", a.get("content", "")))
        elif tag == "form":
            self.rows.append(("form", a.get("action") or "(same page)"))
        elif tag in ("select", "textarea") or (tag == "input" and a.get("type") not in ("hidden", "submit")):
            self.fields += 1
        elif tag == "img" and not a.get("alt"):
            self.no_alt += 1
    def handle_data(self, data):
        for item in self.open:
            item[2] += data
    def handle_endtag(self, tag):
        if self.open and self.open[-1][0] == tag:
            kind, href, text = self.open.pop()
            text = " ".join(text.split())
            if text and (kind != "a" or len(text.split()) <= 5):   # short links are usually actions
                self.rows.append((kind, f"{text}  -> {href}" if kind == "a" else text))

request = urllib.request.Request(sys.argv[1], headers={"User-Agent": "Mozilla/5.0 (page audit)"})
page = Outline()
page.feed(urllib.request.urlopen(request, timeout=30).read().decode("utf-8", "replace"))
for kind, text in page.rows:
    print(f"{kind:>6}  {text[:110]}")
h1s = sum(kind == "h1" for kind, _ in page.rows)
print(f"\nh1 count: {h1s}   form fields: {page.fields}   images without alt text: {page.no_alt}")
```

If the output is nearly empty the page is rendered by JavaScript: use a browser tool to load it and read the rendered DOM. With a browser tool, also take screenshots at 390×844 and 1440×900 and note what is visible before any scrolling. Submit the form or click through to the next step once, on a phone-sized viewport, to catch errors no static read will show.

### 4. Walk the page as the visitor's questions

Check each question in order. Write down what you observed, not an impression.

| Visitor's question | Passes when |
|---|---|
| Does it work on my device? | Field vitals in the good range; nothing overlaps or jumps at 390 px; the action completes on mobile; no overlay blocks the content on arrival |
| Am I in the right place? | The `h1` repeats the promise of the ad, snippet or email that brought the visitor, in the same words for the product and the audience |
| What is it, and what do I get? | The first screen names the product category, who it is for and the outcome, and shows the product itself (screenshot, sample, short demo) |
| Why should I believe it? | Proof is specific and attributable: named customers with permission, numbers with their source, reviews linked to where they were left |
| What will it cost me? | Price or the next commitment is stated (time, card required or not, contract); the form asks only what the next step needs |
| What do I do now? | One primary action, visible on the first screen at both sizes, repeated after each major section, with a label that says what happens next ("Book a 15-minute call"), not "Submit" |

Accessibility is part of conversion: body text needs a contrast ratio of at least 4.5:1 (WCAG 2.2 SC 1.4.3), and buttons and links need a target of at least 24 by 24 CSS pixels (SC 2.5.8); phone thumbs do better with more.

### 5. Adjust for the page type

| Page | Visitor arrives with | Extra checks |
|---|---|---|
| Homepage | Mixed intent, often little context | Paths for the two or three main audiences; the primary action serves the most common one |
| Ad landing page | One promise from one ad | Same wording as the ad; no navigation that leaks visitors elsewhere; the whole case on one page |
| Pricing | Intent to compare | What each plan includes in the buyer's terms, the total actually charged, which plan fits whom, answers to billing questions next to the plans |
| Feature page | A specific need | The feature shown doing the job, then the action; a route to pricing |
| Article | A question, not a purchase | An offer that continues the article's topic (template, calculator, checklist) placed where the answer ends; a trial button alone rarely fits the intent |

### 6. Classify and rank the findings

- **Fix**: something is broken or below a published threshold (form error, poor vitals, unreadable contrast, button off-screen on mobile, promise in the ad missing from the page). No test needed.
- **Change**: low risk and supported by the data from step 2 (cut form fields nobody uses, state the price, replace an anonymous quote with an attributed one). Ship and watch.
- **Test**: the direction is uncertain (a different lead offer, a new page structure, a reframed headline). Needs an experiment or a qualitative check.

Rank by share of visitors affected, then by how close the problem sits to the action, then by effort. Report at most seven findings. Cosmetic variations are not worth a test slot: an analysis of 6,700 e-commerce experiments found colour changes averaging 0.0% and button tweaks −0.2% revenue per visitor.

### 7. Decide whether a test is possible

Save as `ab_math.py`:

```python
"""Plan and read a two-variant page test. Standard library only."""
import math, sys
from statistics import NormalDist

def visitors_per_variant(base, target, alpha=0.05, power=0.80):
    z = NormalDist().inv_cdf
    spread = base * (1 - base) + target * (1 - target)
    return math.ceil((z(1 - alpha / 2) + z(power)) ** 2 * spread / (target - base) ** 2)

def split_p_value(n_a, n_b):
    """Chance that an honest 50/50 split produced counts this uneven."""
    expected = (n_a + n_b) / 2
    chi2 = ((n_a - expected) ** 2 + (n_b - expected) ** 2) / expected
    return math.erfc(math.sqrt(chi2 / 2))

def difference(conv_a, n_a, conv_b, n_b):
    p_a, p_b = conv_a / n_a, conv_b / n_b
    se = math.sqrt(p_a * (1 - p_a) / n_a + p_b * (1 - p_b) / n_b)
    return p_a, p_b, (p_b - p_a - 1.96 * se) * 100, (p_b - p_a + 1.96 * se) * 100

if __name__ == "__main__":
    if sys.argv[1] == "plan":   # plan BASE TARGET WEEKLY_VISITORS
        base, target, weekly = (float(x) for x in sys.argv[2:5])
        n = visitors_per_variant(base, target)
        print(f"{n:,} visitors per variant, {2 * n / weekly:.1f} weeks at {weekly:,.0f} visitors a week")
    else:                       # read CONV_A N_A CONV_B N_B
        conv_a, n_a, conv_b, n_b = (int(x) for x in sys.argv[2:6])
        p_a, p_b, low, high = difference(conv_a, n_a, conv_b, n_b)
        print(f"A {p_a:.2%}  B {p_b:.2%}  difference {(p_b - p_a) * 100:+.2f} points (95% CI {low:+.2f} to {high:+.2f})")
        print(f"split check p = {split_p_value(n_a, n_b):.4f}")
```

Rules for running one:

- More than about eight weeks needed: do not split-test. Ship the fixes and changes, compare the same weekdays before and after by segment, and use five moderated sessions or an on-page question to choose between bigger ideas.
- Fix the sample size and the primary metric before starting; run whole weeks; do not stop early because the dashboard turned green.
- A split check p-value below 0.001 means the variants did not receive the traffic they should have; find the cause before reading the result.
- Search engines: serve the same variants to crawlers as to people, put `rel="canonical"` on alternate URLs pointing to the original, redirect with 302 rather than 301, and remove the test when it ends.

### 8. Deliver the report

Write the report as Markdown with this title and these sections as headings, in order:

```text
Page audit: /restaurants (Saltmarsh Books), 1–28 Sep 2026

1. Baseline          (table: segment | visitors | conversion rate; vitals p75 per device)
2. What the visitor reads   (outline and first-screen notes for phone and desktop)
3. Findings          (table: # | question it fails | evidence | visitors affected | fix / change / test | effort)
4. Proposed copy     (current and two alternatives for the h1 and the primary button, each with its reason)
5. Test plan         (hypothesis, metric, base, target, visitors per variant, weeks; or why no test)
6. Tracking gaps     (events or segments that were missing)
```

## Examples

### Example 1: An ad landing page with too little traffic to test

Request: "Our Google Ads page for restaurant bookkeeping gets about 6,400 visits a month and 1.9% request a quote. What's wrong with it?"

The agent pulls the segments: 82% of visits are on phones and convert at 1.4%; desktop converts at 4.1%. CrUX shows a phone p75 Largest Contentful Paint of 4.6 s (poor). The outline script prints:

```text
 title  Saltmarsh Books | Finance, simplified
  meta  Bookkeeping for restaurants.
     a  Pricing  -> /pricing
     a  About  -> /about
    h1  Finance, simplified.
     a  Learn more  -> #more
    h2  Trusted by owners
  form  /lead
button  Submit

h1 count: 1   form fields: 9   images without alt text: 1
```

The ad headline reads "Restaurant bookkeeping from $349 a month". Findings: (1) fix, the 3.8 MB hero video delays the main content on phones, affecting 82% of visitors; replace it with a compressed still. (2) fix, the `h1` drops both "restaurant" and the price promised in the ad; proposed: "Monthly bookkeeping for restaurants, from $349". (3) change, the form asks nine things including annual revenue and point-of-sale system; keep name, email, restaurant and phone, and collect the rest on the call. (4) change, "Learn more" and "Submit" become "Get my quote". (5) change, the unattributed quote under "Trusted by owners" is replaced by a named owner with permission, or removed. (6) change, remove the navigation links that lead away from a paid page.

`python3 ab_math.py plan 0.019 0.025 1480` returns `9,379 visitors per variant, 12.7 weeks at 1,480 visitors a week`, so the agent recommends no split test: ship all six, then compare four weeks before and after by device while holding the ad budget and keywords steady, and says the comparison cannot rule out seasonal effects.

### Example 2: An article with traffic and the wrong offer

Request: "Our guide 'How to calculate overtime in California' gets 38,000 visits a month from search. Only 0.3% start a Tidewater Payroll trial. Can we do better?"

The agent notes the vitals are good and the mobile and desktop rates are alike, so the page works; the weak point is the last question, what to do next. The only action is a "Start free trial" button in the header and after the final paragraph, while the reader came to do a calculation. Hypothesis: an overtime calculator offered directly under the worked example, leading into the trial with the reader's numbers filled in, fits the intent. Primary metric: trial starts per visitor, the same in both variants; calculator use is a secondary metric.

`python3 ab_math.py plan 0.003 0.005 8770` gives `15,632 visitors per variant, 3.6 weeks at 8,770 visitors a week`; the test is set for four full weeks on the same URL with client-side assignment, so no canonical or redirect is involved. Afterwards `python3 ab_math.py read 53 17660 95 17540` prints:

```text
A 0.30%  B 0.54%  difference +0.24 points (95% CI +0.11 to +0.38)
split check p = 0.5224
```

The interval excludes zero and the split is sound. The agent recommends shipping the calculator, reports the plausible range (0.11 to 0.38 points) instead of the single number, and proposes checking paid conversions from both groups after 30 days before rolling the pattern out to the other guides.

## Guidelines

- Never recommend from the copy alone. If analytics access is missing, say which numbers are needed and limit the audit to defects that are visible without them.
- One page, one primary action. Secondary actions are fine when they are visibly secondary.
- Write the replacement text. "Make the headline clearer" is not a finding; the proposed `h1` and why it answers the visitor's question is.
- Proof must be real. Invented or unattributed testimonials and made-up customer counts are a legal risk (in the US, 16 CFR Part 465) as well as a credibility one.
- Do not invent urgency or scarcity to lift a rate; propose only deadlines and limits that exist.
- A lift on the page that lowers the quality of what comes after is not a win. Track the next stage (qualified leads, paid conversions) as a guardrail.
- Treat benchmark conversion rates from other companies as irrelevant; the comparison that matters is this page against itself by segment and over time.
- Lighthouse scores vary run to run and are lab measurements; do not report a two-point change as a finding.
- When the same problem appears on many pages (template-level speed, navigation, a shared form), report it once as a template issue instead of auditing each page.
