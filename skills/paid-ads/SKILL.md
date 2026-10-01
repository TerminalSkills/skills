---
name: paid-ads
description: >-
  Plans, structures, launches and diagnoses paid campaigns on Google Ads, Meta
  (Facebook and Instagram) and LinkedIn against a cost-per-acquisition or
  return target derived from the business's own numbers. Use when someone asks
  to "set up Google Ads", "run Meta ads", "write ad copy", "lower our CPA",
  "improve ROAS", "plan a PPC budget", "set up retargeting", or "why are my ads
  not converting". Covers the budget check, conversion tracking, campaign
  structure, bidding, ad text within platform limits, policy restrictions, and
  a weekly review that separates measurement faults from real performance
  changes.
license: Apache-2.0
compatibility: >-
  Any agent that can read the site's tracking code and run Python 3.9+
  (standard library only). The user needs their own Google Ads, Meta Ads
  Manager or LinkedIn Campaign Manager account; the agent prepares plans,
  assets and queries and does not need platform credentials. Platform facts
  checked against Google and Meta documentation in October 2026.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["ppc", "google-ads", "meta-ads", "advertising", "performance-marketing"]
---

# Paid Ads: Planning and Running Google, Meta and LinkedIn Campaigns

## Overview

Ad platforms now automate most bidding and much of the targeting. What stays with the advertiser decides the outcome: a target grounded in unit economics, accurate conversion signals, a structure that concentrates data, creative worth showing, and the discipline not to disturb a campaign while it learns. This skill covers those parts and gives the agent the platform limits it must respect.

Platform features change several times a year. Statements about campaign types, bid strategies and policies below were checked against the vendors' help pages; re-check the linked concepts in the current documentation before promising a specific setting exists.

## Instructions

### 1. Gather the inputs

From the user: what is sold and its price, gross margin, how many leads or trials become customers, monthly budget, countries and languages, the landing page, past ad results, whether a customer list exists, and whether the product falls in a restricted category (housing, employment, financial products, health, politics).

From the project: the tags on the site (`gtag(`, a Google Tag Manager container, `fbq(`), the consent banner and what it does to those tags, the event fired on the conversion, and whether anything is sent server-side.

### 2. Check that the budget can work

Save as `ads_math.py`. Arguments: monthly budget, monthly price, gross margin, payback months, lead-to-customer rate, expected cost per click, landing page conversion rate.

```python
"""Check whether a budget can reach its target and feed the bidding systems enough data."""
import sys

def check(monthly_budget, monthly_price, gross_margin, payback_months,
          lead_to_customer, cost_per_click, landing_rate):
    cac_ceiling = monthly_price * gross_margin * payback_months
    target_cpa = cac_ceiling * lead_to_customer          # most a lead or trial may cost
    expected_cpa = cost_per_click / landing_rate
    per_week = monthly_budget / expected_cpa * 7 / 30.4
    print(f"customer may cost up to   {cac_ceiling:,.0f}")
    print(f"target cost per lead      {target_cpa:,.0f}")
    print(f"expected cost per lead    {expected_cpa:,.0f}  ({'within' if expected_cpa <= target_cpa else 'ABOVE'} target)")
    print(f"leads per week            {per_week:.1f}")
    print(f"ad sets Meta can settle   {int(per_week // 50)}  (about 50 results a week each)")
    print(f"weeks to 30 conversions   {30 / per_week:.1f}  (minimum to judge a Google bid target)")

if __name__ == "__main__":
    check(*[float(a) for a in sys.argv[1:8]])
```

Take the cost per click from the platform's own forecast (Keyword Planner in Google Ads, the estimate shown while building a Meta or LinkedIn audience) and the landing rate from analytics. Do not substitute industry averages. If the expected cost is above target, fix the page or the offer before buying traffic. If the weekly volume is small, run one campaign, not several.

### 3. Choose where to run

| Option | Fits when | Verified constraints |
|---|---|---|
| Google Search | People already search for the problem or product | Keywords match by meaning: broad (no symbols), phrase (`"…"`), exact (`[…]`). AI Max is a setting on a Search campaign, not a campaign type; switching it on enables text customisation and final URL expansion by default |
| Google Performance Max | Conversion tracking is solid and assets exist for every format | Serves across Search, YouTube, Display, Discover, Gmail and Maps from one campaign; steer it with asset groups, audience signals, search themes, negative keywords and brand exclusions |
| Google Demand Gen | A visual offer for people not yet searching | YouTube including Shorts, Discover, Gmail and the Display Network; Display campaigns are being moved into Demand Gen, with voluntary migration open since June 2026 |
| Meta | The buyer can be reached by interest or by a customer list, and fresh creative can be produced regularly | Six objectives: Awareness, Traffic, Engagement, Leads, App promotion, Sales |
| LinkedIn | The buyer is defined by job title, seniority or company | Minimum daily budget $10; minimum audience 300 members, with 300,000 or more suggested for Sponsored Content |

Start with one platform. Add a second only when the first has a stable cost per conversion.

### 4. Make conversions measurable before spending

- **Google Ads**: one primary conversion action for the event that matters; auto-tagging on (it appends `gclid`); enhanced conversions so hashed first-party data (SHA-256 email or phone) backs up cookies; consent mode passing `ad_storage`, `ad_user_data`, `ad_personalization` and `analytics_storage` for visitors in the EEA and UK.
- **Meta**: the Pixel in the browser and the Conversions API from the server, sending the same event with the same ID so Meta counts it once. Events are deduplicated when the names match, `eventID` equals `event_id`, and both arrive within 48 hours.

```javascript
// Browser: the fourth argument carries the shared ID
fbq('track', 'Lead', {}, {eventID: 'lead-7f3c91e2'});
```

```json
{
  "data": [{
    "event_name": "Lead",
    "event_time": 1790865000,
    "event_id": "lead-7f3c91e2",
    "action_source": "website",
    "event_source_url": "https://molarplan.com/treatment-plans",
    "user_data": {
      "em": ["5b05929accfb0219641efa6e456c2fa97f8cb81f000ba3b672e1e701e1d9184b"],
      "client_user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)"
    }
  }]
}
```

The server sends that body to the dataset's `/events` edge of the Graph API with an access token read from an environment variable such as `META_CAPI_TOKEN`. `em` is the SHA-256 hash of the lower-cased, trimmed email address.

- **Landing URLs**: tag them so analytics can compare platforms on equal terms.

```text
Meta, URL parameters field:
utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}

Google Ads, final URL suffix (auto-tagging stays on):
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}
```

Meta fills name-based parameters with the names used when the ad was first published; renaming later does not change them. Finish by completing one real conversion and confirming it appears once in the platform and once in analytics.

### 5. Build the structure

**Google Search**

- Separate campaigns only where budgets or goals differ: brand terms, non-brand terms, competitor terms. Inside each, ad groups by theme, each pointing at the page that answers that theme.
- Negative keywords from day one for obvious mismatches (jobs, free, definitions). Review real queries weekly with the Google Ads API or the Search terms report:

```sql
SELECT campaign.name, ad_group.name, search_term_view.search_term,
       metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM search_term_view
WHERE segments.date DURING LAST_30_DAYS AND metrics.clicks > 0
ORDER BY metrics.cost_micros DESC
LIMIT 200
```

  `cost_micros` is the cost multiplied by one million. This view excludes Performance Max, which has its own campaign-level search term view.
- Responsive search ads take 3 to 15 headlines of up to 30 characters, 2 to 4 descriptions of up to 90, and two paths of up to 15. Write headlines that each stand alone, since any may be combined; pin only what must always show, such as a legal line. Count with code, never by eye; save the ad as JSON with `headlines`, `descriptions` and `paths` arrays and run:

```python
import json, sys
ad = json.load(open(sys.argv[1]))
for field, (max_chars, fewest, most) in {"headlines": (30, 3, 15), "descriptions": (90, 2, 4), "paths": (15, 0, 2)}.items():
    items = ad.get(field, [])
    if not fewest <= len(items) <= most:
        print(f"FAIL {field}: {len(items)} items, allowed {fewest}-{most}")
    for text in items:
        print(f"{'ok  ' if len(text) <= max_chars else 'FAIL'} {len(text):>2}/{max_chars}  {text}")
```

- Bidding: Smart Bidding means Target CPA, Target ROAS, Maximize conversions and Maximize conversion value. Enhanced CPC was withdrawn from Search and Display in March 2025. A new campaign starts on Maximize conversions; add a Target CPA near the average actually achieved once there are 30 or more conversions to judge it by. A target far below the real cost starves delivery.
- A daily budget may spend up to twice its amount on a single day and no more than 30.4 times it in a month. Quality Score (1–10, from expected click-through rate, ad relevance and landing page experience) is a diagnostic, not an input to the auction.

**Meta**

- One campaign per objective, as few ad sets as possible, several distinct creative concepts inside each. Fragmented ad sets each receive too few results.
- An ad set leaves the learning phase after about 50 results in the week following its last significant edit. If it cannot reach that, it shows "Learning limited"; Meta's remedies are to combine ad sets, widen the audience, raise the budget or cost control, or optimise for a more frequent event.
- Significant edits restart learning: any change to targeting, creative or the optimisation event, adding an ad, changing bid strategy, pausing for seven days or more, and large budget changes. Batch edits into one session a week.
- Bid strategies: Highest volume or Highest value to spend the budget; Cost per result goal or ROAS goal to hold an average (Meta recommends 50 to 100 or more conversions a week for these); Bid cap for manual control. Start with Highest volume.
- Attribution on the standard model can count click-through within 1 or 7 days, view-through within 1 day and engage-through within 1 day. Record the setting in every report; results under different settings are not comparable.

**Remarketing**: Google data segments and customer lists need at least 100 active users in the last 30 days and hold members for up to 540 days. Exclude existing customers and recent converters from prospecting.

### 6. Check policy before writing ads

| Situation | Rule |
|---|---|
| Housing, employment or consumer finance ads on Google in the US and Canada | No targeting by gender, age, parental status, marital status or ZIP code |
| Sensitive interest categories on Google (health conditions, religion, sexual orientation and others) | Advertiser-curated audiences, including remarketing lists and customer match, cannot be used |
| Housing, employment or financial products and services on Meta | Declare the Special Ad Category; age, gender, postal code, exclusions, lookalikes and saved audiences are limited or unavailable. "Financial products and services" replaced "Credit" and has been required for US audiences since January 2025 |
| Social issues, elections or politics on Meta | Authorisation and a "Paid for by" disclaimer; such ads cannot be created for the European Union |

### 7. Review weekly, in this order

1. **Is the measurement intact?** Compare platform conversions with orders or leads in the CRM. A sudden jump or drop with flat spend is usually tagging, consent or deduplication.
2. **Which factor moved?** Cost per conversion = (CPM ÷ 1000) ÷ (click-through rate × conversion rate). One of the three explains most changes:

| Moved | Likely causes | Look at |
|---|---|---|
| CPM up | Narrower audience, seasonal competition, learning restarted | Audience size, edit history, auction overlap |
| Click-through rate down | Creative has been seen too often, promise does not fit the audience | Frequency, results by ad, search terms |
| Conversion rate down | Page or form changed or broke, slower page, weaker traffic mix | Landing page by device, placements, search terms |

3. **Then act**: add negatives, replace the weakest ad, move budget toward the campaign with the lowest cost per customer, not per click.

Platforms each claim the conversions they touched, so their totals overlap. Report blended cost per customer (all ad spend ÷ all new customers) beside each platform's own figure.

### 8. Deliver the plan

Write the plan as Markdown with this title and these sections as headings, in order:

```text
Paid plan: Molarplan, Google Search, October 2026

1. Target          (customer may cost, target cost per trial, budget, expected trials per week)
2. Tracking        (conversion action, consent, enhanced conversions, test conversion: done / missing)
3. Structure       (table: campaign | daily budget | bid strategy | ad groups | landing page)
4. Keywords        (per ad group, with match type) and negatives
5. Ads             (headlines and descriptions with character counts)
6. Policy          (category checks and the outcome)
7. First four weeks (what will not be touched, what is reviewed each week, when the bid target is set)
```

## Examples

### Example 1: First Google Search campaign for a small SaaS

Request: "Molarplan is treatment-plan software for dental practices, $180 a month, 80% margin. One in four trials becomes a customer. I have $4,500 a month. Set up Google Ads."

The agent finds a `gtag` snippet with no conversion event and a consent banner that does not update consent mode; both go into the tracking section as blockers. Keyword Planner forecasts $6.50 a click for the chosen terms and analytics shows 4% of visitors start a trial. `python3 ads_math.py 4500 180 0.80 9 0.25 6.50 0.04` prints:

```text
customer may cost up to   1,296
target cost per lead      324
expected cost per lead    162  (within target)
leads per week            6.4
ad sets Meta can settle   0  (about 50 results a week each)
weeks to 30 conversions   4.7  (minimum to judge a Google bid target)
```

The plan: Google Search only, since six trials a week cannot feed a Meta ad set. Two campaigns, brand at $10 a day and non-brand at $138 a day, the second with two ad groups ("treatment plan software" and "case presentation software") in phrase and exact match, on Maximize conversions with no target until week five. Negatives: jobs, template, free, course. The agent writes nine headlines and three descriptions and runs them through a length check, which rejects two:

```text
ok   30/30  Dental Treatment Plan Software
ok   26/30  Free 14-Day Trial, No Card
FAIL 33/30  Molarplan Treatment Planning Tool
FAIL 92/90  Turn exam notes into a plan patients understand, with phases, costs and options on one page.
```

It shortens them to "Molarplan Treatment Plans" (25) and "Turn exam notes into a plan patients understand: phases, costs, options on one page." (84) and delivers the plan in the step 8 layout. Dental software is not a restricted category, so the policy section records the check and nothing more.

### Example 2: A Meta account that never leaves learning

Request: "We sell a sourdough subscription, Thistle & Rye. $9,000 a month on Meta, six ad sets, target $45 a purchase, we're at $68 and everything says 'Learning limited'. I adjust budgets every couple of days."

The agent starts with measurement: Ads Manager reports 132 purchases for September, while the shop's order export shows 96 orders from Meta-tagged visits. The Pixel and the server both send `Purchase`, the server without an `event_id`, so some orders are counted twice and the real cost per purchase is above the reported $68. Fixing deduplication comes first, with a warning that reported volume will fall when it is fixed.

Then structure: $9,000 a month is about $2,070 a week, which buys between 22 and 30 purchases depending on which count is right. Split six ways, that is four or five per ad set against the 50 needed. The agent merges the six ad sets into one with a broad audience, existing subscribers excluded, and keeps four distinct creative concepts in it. Because even 30 a week is below 50, it sets the optimisation event to "Add to cart" for the first month, as Meta's guidance suggests for infrequent events, and plans the switch back to purchases once weekly purchases pass 50.

Then behaviour: budget changes every two days are significant edits when large and restart learning. The plan fixes one editing day a week. Decomposing the reported cost, a CPM of $14 with a 0.9% click-through rate and 2.3% conversion rate gives 14 ÷ 1000 ÷ (0.009 × 0.023) = $67.63, so the agent names the two levers that matter (creative to lift click-through, the product page to lift conversion) and states the review to hold after 14 untouched days.

## Guidelines

- No tracking, no launch. A campaign optimising on a broken or duplicated signal buys the wrong people efficiently.
- Never quote benchmark click costs or conversion rates as expectations. Use the platform's forecast for this account and the site's own rates, and label both as estimates.
- Verify a setting exists before recommending it by name; menus and campaign types are renamed often. Say "check that this option is still offered" where unsure.
- Fewer campaigns, more data in each. Split only for a different budget, goal, country or language.
- Leave a learning campaign alone. Judge results over full weeks and enough conversions, not day by day.
- Ad text must be true and match the landing page; unverifiable superlatives and invented deadlines invite disapproval and distrust.
- Customer lists are personal data: upload only with a lawful basis, hashed, and never paste them into a chat or commit them to the repository. Tokens and account IDs come from environment variables.
- Low volume is a real limit. Google suggests judging a bid target over at least 30 conversions and Meta looks for about 50 results a week per ad set; far below that, prefer tight targeting, an earlier conversion event, or a different channel.
- The agent drafts and analyses; a person with account access publishes, sets billing and accepts platform terms. Regulated products need review by someone who knows the applicable advertising law.
