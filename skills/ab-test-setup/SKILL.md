---
name: ab-test-setup
description: >-
  Plans a controlled experiment (A/B test) so its result can be trusted: writes
  the hypothesis, picks one primary metric and the guardrails, computes sample
  size and run time, specifies how visitors are assigned and when exposure is
  logged, and reads out the result with a confidence interval. Use when someone
  says "set up an A/B test", "split test this page", "how many visitors do I
  need", "how long should the experiment run", "is this result significant",
  "can I stop the test early", or wants to test a headline, price, layout or
  onboarding change against the current version.
license: Apache-2.0
compatibility: "Python 3.8+ (standard library only) for the calculator, Node.js 18+ for the assignment snippet. Works with any assignment tool: feature flags, GrowthBook, PostHog, Optimizely, Statsig, or a hash split in your own code."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["ab-testing", "experimentation", "statistics", "conversion", "sample-size"]
---

# A/B Test Setup

## Overview

An A/B test answers one question: did this change move this metric, or was it noise? The answer is only worth something when the sample size, the metric and the stopping rule were fixed before the first visitor arrived. This skill produces three things: a written experiment plan committed before launch, an assignment and logging spec a developer can implement, and a readout that states the effect as an interval instead of a "winner" badge.

Most failed tests fail on arithmetic that could have been done on day zero: the site does not have enough traffic for the effect the team hopes for. Do that arithmetic first.

## Instructions

### 1. Gather the inputs

Ask for what is missing, and look in the project for the rest (feature-flag SDK, analytics events, an `experiments/` folder with earlier plans):

- **The change and the evidence behind it.** Session recordings, support tickets, a funnel drop, a survey. "We want to try it" is allowed, but record that the prior is weak.
- **Unit of assignment.** Logged-in user, account, or anonymous visitor ID. Accounts when users inside one company would otherwise see different prices or features.
- **Primary metric and its baseline**, measured over the last 4 full weeks on the same population that will enter the test (same pages, same devices, same traffic sources).
- **Eligible units per week** — people who actually reach the changed element, not total site traffic.
- **Smallest lift worth shipping.** This is a business question: below what improvement would nobody bother to keep the variant?
- **What else is running** on the same pages, and any sale, launch or campaign planned during the run.

### 2. Do the arithmetic before anything else

For a conversion rate, with control rate `p1`, variant rate `p2 = p1 × (1 + lift)` and `p̄` their mean, the visitors needed in each arm are:

```text
n = ( z_a × sqrt(2 × p̄ × (1 − p̄)) + z_b × sqrt(p1 × (1 − p1) + p2 × (1 − p2)) )² ÷ (p2 − p1)²

z_a = 1.960   two-sided significance level 0.05
z_b = 0.8416  power 0.80 (an effect of this size is detected 4 times out of 5)
```

Save the calculator as `abtest.py`. It also covers the two checks used later.

```python
"""Sample size, sample-ratio check and readout for a two-arm conversion test. Standard library only."""
import math, sys
from statistics import NormalDist

Z = NormalDist()

def size(base, rel_lift, alpha=0.05, power=0.80, comparisons=1):
    """Visitors per arm to detect base -> base*(1+rel_lift), two-sided."""
    p1, p2 = base, base * (1 + rel_lift)
    za = Z.inv_cdf(1 - alpha / comparisons / 2)
    zb = Z.inv_cdf(power)
    pbar = (p1 + p2) / 2
    root = za * math.sqrt(2 * pbar * (1 - pbar)) + zb * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))
    return math.ceil(root ** 2 / (p2 - p1) ** 2)

def srm(n_a, n_b, share_a=0.5):
    """Chi-square p-value that the observed split matches the planned one."""
    total = n_a + n_b
    exp_a, exp_b = total * share_a, total * (1 - share_a)
    chi2 = (n_a - exp_a) ** 2 / exp_a + (n_b - exp_b) ** 2 / exp_b
    return math.erfc(math.sqrt(chi2 / 2))

def result(n_a, conv_a, n_b, conv_b, alpha=0.05):
    """Two-proportion z-test plus a confidence interval for the absolute difference."""
    pa, pb = conv_a / n_a, conv_b / n_b
    pooled = (conv_a + conv_b) / (n_a + n_b)
    z = (pb - pa) / math.sqrt(pooled * (1 - pooled) * (1 / n_a + 1 / n_b))
    p_value = 2 * (1 - Z.cdf(abs(z)))
    half = Z.inv_cdf(1 - alpha / 2) * math.sqrt(pa * (1 - pa) / n_a + pb * (1 - pb) / n_b)
    return pa, pb, pb - pa, (pb - pa - half, pb - pa + half), p_value

if __name__ == "__main__":
    cmd, *a = sys.argv[1:]
    if cmd == "size":
        print(size(float(a[0]), float(a[1]), comparisons=int(a[2]) if len(a) > 2 else 1), "visitors per arm")
    elif cmd == "srm":
        p = srm(int(a[0]), int(a[1]))
        print(f"SRM p = {p:.4g} ->", "STOP: assignment is broken" if p < 0.001 else "split is fine")
    elif cmd == "result":
        pa, pb, diff, ci, p = result(*map(int, a))
        print(f"control {pa:.2%}  variant {pb:.2%}  diff {diff:+.2%} points "
              f"(95% CI {ci[0]:+.2%} to {ci[1]:+.2%})  relative {diff / pa:+.1%}  p = {p:.4f}")
```

Then: `weeks = ceil(arms × n ÷ eligible units per week)`, rounded up to whole weeks, never fewer than 2. Whole weeks matter because weekday and weekend visitors behave differently.

| Weeks needed | What to do |
|---|---|
| 2–6 | Run it as planned. |
| 7–8 | Acceptable only for a decision that matters; cookie loss and returning visitors blur the arms over time. |
| More than 8 | Do not run this test. Test a bolder change, measure a step with a higher baseline, pool several similar pages into one experiment, or ship and watch the trend. |

Other cases:

- **Several variants.** Each comparison against control gets `0.05 ÷ number of variants` (Bonferroni). Pass the count as the third argument: `size 0.04 0.15 2`.
- **Unequal split.** Total sample grows by `1 ÷ (4 × w × (1 − w))` where `w` is the control share: 70/30 costs 1.19×, 80/20 costs 1.56×, 90/10 costs 2.78×.
- **Averages** (revenue per visitor, order value): `n = 2 × σ² × (z_a + z_b)² ÷ δ²`, about `16 × σ² ÷ δ²`, with `σ` the standard deviation and `δ` the absolute difference to detect. Revenue is heavy-tailed, so state in the plan how extreme orders are capped.

### 3. Write the plan and commit it

Create `experiments/YYYY-MM-DD-short-name.md` before launch. Example 1 shows a filled one. It must contain:

1. **Hypothesis** in one sentence: the change, who sees it, the metric, the direction, and the evidence.
2. **Primary metric** — exactly one, with numerator, denominator and the window in which a conversion counts (for example "paid within 14 days of first exposure").
3. **Guardrails** — two to four metrics that must not get worse (refund rate, page errors, support contacts, revenue per visitor), each with the drop that would stop the test.
4. **Sample size, split, start and end dates.**
5. **Stopping rule** (section 5) and the **decision rule** for each outcome.
6. **Segments** that will be reported, named in advance. Anything else found later is a new hypothesis, not a finding.

### 4. Specify assignment and exposure logging

```javascript
import { createHash } from "node:crypto";

// Same unit + same experiment key -> same arm, on every server and every visit.
export function assign(experimentKey, unitId, arms = ["control", "variant"]) {
  const digest = createHash("sha256").update(`${experimentKey}:${unitId}`).digest();
  const bucket = digest.readUInt32BE(0) / 2 ** 32; // uniform in [0, 1)
  return arms[Math.floor(bucket * arms.length)];
}
```

- Hash a **stable** identifier. A new random draw per page view puts one person in both arms.
- Put the experiment key in the hash so two experiments split independently of each other.
- Log an **exposure event** (`experiment_key`, `arm`, `unit_id`, timestamp) at the moment the person reaches the changed element, not at assignment. Analyse only exposed units, and analyse by the same unit that was randomised.
- Render the variant on the server or before first paint. A page that flashes the control and then swaps is a different treatment from the one in the plan.
- For tests that split by URL, follow Google Search's guidance for site tests: no different content for the crawler than for people, `rel="canonical"` from each variant URL to the original, a 302 redirect rather than a 301, and remove the test when it ends.

### 5. Launch checks and the stopping rule

Before launch, force each arm with an override and confirm on desktop and mobile that the page renders, the exposure event fires once, and the conversion event carries the arm.

Daily during the run, look only at: `python3 abtest.py srm` on exposed counts, guardrails, and error rates. A sample-ratio mismatch (p below 0.001) means units are being lost in one arm (redirects, bot filtering, a crash, late logging). The result cannot be read: stop, fix, restart with a new experiment key.

Do not act on the primary metric early. Checking it repeatedly and stopping at the first p < 0.05 produces "winners" from identical pages:

| Looks at the primary metric | Chance an A/A test shows p < 0.05 at some look |
|---|---|
| 1 (at the planned end) | 5% |
| 5 | 14% |
| 10 | 19% |
| 14 (daily for two weeks) | 22% |
| 28 (daily for four weeks) | 27% |

Pick one rule and write it in the plan:

- **Fixed horizon** (default): read the primary metric once, at the planned sample size.
- **Planned interim looks**: stop early only if an interim p-value is below 0.001; the final look still uses 0.05. This keeps the overall false-positive rate at about 5%.
- **Sequential or Bayesian engine in the testing tool**: follow that tool's own stopping rule and do not mix it with the fixed-horizon numbers above. Sequential methods allow continuous monitoring at the price of wider intervals.

### 6. Read out the result

Run `python3 abtest.py result` with exposed units and conversions per arm. Report the interval first.

| Interval for the difference | Decision |
|---|---|
| Entirely above zero, guardrails healthy | Ship. Quote the range, not only the point estimate. |
| Includes zero | Not detected at this sample size. This is not proof of "no effect". Keep control unless the variant is cheaper to maintain and the lower bound is tolerable. |
| Entirely below zero | Keep control and record what was learned. |

Append the readout to the plan file: dates, exposed counts, SRM p-value, the interval, guardrails, the decision, and what to test next.

## Examples

### Example 1: Signup page headline, with the arithmetic

Prompt: "Our signup page for Tidewater Invoicing converts 4.0% of about 9,000 weekly visitors. We want to test a headline about getting paid faster. A 15% relative lift would be worth it. How long do we run?"

`p1 = 0.040`, `p2 = 0.040 × 1.15 = 0.046`, difference `0.006`, `p̄ = 0.043`.

```text
z_a × sqrt(2 × 0.043 × 0.957)            = 1.960 × 0.28688 = 0.56228
z_b × sqrt(0.040 × 0.960 + 0.046 × 0.954) = 0.8416 × 0.28685 = 0.24141
n = (0.56228 + 0.24141)² ÷ 0.006² = 0.64592 ÷ 0.000036 = 17,942.2 -> 17,943 per arm

total = 2 × 17,943 = 35,886      35,886 ÷ 9,000 per week = 3.99  ->  4 full weeks
```

`python3 abtest.py size 0.04 0.15` prints `17943 visitors per arm`. The plan the agent writes:

```markdown
# experiments/2026-10-05-signup-headline.md
Hypothesis: Replacing "Invoicing made simple" with "Get paid 9 days sooner" will raise
  signup completion for new visitors, because 31 of 50 interviewed customers named late
  payment as the reason they went looking.
Unit: anonymous visitor ID (first-party cookie), 50/50 hash split, key signup-headline-2026-10
Primary metric: signups completed ÷ visitors exposed to /signup, same session
Baseline: 4.0% (7 Sep – 4 Oct). Smallest lift worth shipping: +15% relative (4.0% -> 4.6%)
Sample: 17,943 per arm, alpha 0.05 two-sided, power 0.80. Run 5 Oct – 1 Nov (4 full weeks)
Guardrails: activation within 7 days (stop if down more than 10% relative), JS error rate (stop if it doubles)
Stopping rule: fixed horizon. SRM and guardrails checked daily; primary metric read on 2 Nov
Decision: ship if the 95% interval is above zero and activation holds; otherwise keep control
Segments reported: device type, paid vs organic
```

Four weeks later the counts are 17,990 exposed with 716 signups in control and 17,954 with 811 in the variant.

```text
$ python3 abtest.py srm 17990 17954
SRM p = 0.8494 -> split is fine
$ python3 abtest.py result 17990 716 17954 811
control 3.98%  variant 4.52%  diff +0.54% points (95% CI +0.12% to +0.95%)  relative +13.5%  p = 0.0116
```

Readout: the headline raised signup completion by between 0.12 and 0.95 percentage points (roughly +3% to +24% relative). Ship it, and expect the long-run gain to sit below the +13.5% point estimate.

### Example 2: A store without the traffic

Prompt: "Harbor Kiln sells ceramics. The product page gets 1,400 visitors a week and 6% add to cart. Can we A/B test a new 'free shipping over $60' badge? I'd be happy with 10% more add-to-carts."

```text
$ python3 abtest.py size 0.06 0.10
25740 visitors per arm        -> 51,480 total ÷ 1,400 per week = 36.8 weeks. Not testable.
$ python3 abtest.py size 0.06 0.30
3112 visitors per arm         -> 6,224 total ÷ 1,400 per week = 4.4 -> 5 full weeks.
```

The agent answers that a badge alone is unlikely to move add-to-cart by 30%, and that at this traffic only an effect of that size can be seen. It offers two honest routes: bundle the badge with a rebuilt page (new photos, reviews above the fold) and test the bundle for 5 weeks, accepting that the test cannot say which part worked; or add the badge to every product page at once and compare the four weeks after with the four before, labelled as a before/after observation rather than an experiment.

### Example 3: A split that is not 50/50

After one week of a redirect test the exposure counts are 18,102 and 17,402.

```text
$ python3 abtest.py srm 18102 17402
SRM p = 0.0002032 -> STOP: assignment is broken
```

The variant lost about 4% of its visitors, most likely during the redirect. The agent stops the test, moves exposure logging before the redirect, and restarts under a new key. The first week's data is discarded, not merged.

## Guidelines

- Stopping at half the planned sample because "it is already significant" halves more than the wait: at 8,972 per arm the test in Example 1 has 51% power, and effects found that way are overstated.
- Do not extend a test that ended without a detected effect "until it gets there". That is peeking with extra steps. Plan a new test with a larger sample or a bolder change.
- Relative and absolute lifts are different numbers. "15%" on a 4.0% baseline means 4.6%, not 19%. Write both in the plan.
- One primary metric. With five metrics and no correction, the chance that at least one shows p < 0.05 by luck is about 23%.
- A click on a button is a cheap metric with a high baseline, and it often rises while revenue does not. Use it as primary only when the plan says why it predicts the outcome that matters.
- Changing the variant, the split or the audience during the run starts a new experiment. Restart with a new key.
- Surprisingly large wins (a +40% lift from a copy change) are more often logging bugs than discoveries. Check SRM, duplicated events and bot traffic before celebrating.
- The formula assumes independent units. If one account contains many users, randomise and analyse by account.
- Google Optimize was shut down on 30 September 2023; tutorials built on it no longer apply.
- When not to test: fewer than about 400 conversions a month on the primary metric (at that volume four weeks can only detect lifts of 30% or more), legal or security fixes, changes that cannot be shown to only part of the audience, and decisions that would be made the same way regardless of the result.
