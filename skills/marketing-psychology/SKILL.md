---
name: marketing-psychology
description: >-
  Applies behavioural science to marketing decisions using only effects with
  solid published evidence, named as the research literature names them, with
  their replication record. Use when someone asks about "marketing psychology",
  "cognitive biases", "persuasion", "why people buy", "behavioural science",
  "nudges", or wants to use anchoring, scarcity, social proof, defaults, loss
  aversion or a decoy on a pricing page, checkout, signup or upgrade prompt.
  Grades each effect, says where it failed to replicate, checks the idea
  against consumer-protection rules, and turns it into a sized experiment.
license: Apache-2.0
compatibility: >-
  Any agent that can read the project's page templates, pricing configuration
  and analytics exports. Python 3.9+ (standard library only) for the sample
  size helper.
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: business
  tags: ["behavioral-science", "persuasion", "pricing", "experimentation", "marketing"]
---

# Marketing Psychology: Evidence-Graded Behavioural Science

## Overview

Popular lists of "biases that sell" mix findings that have survived large replications with others that have collapsed, and present all of them as laws. This skill works the other way round: start from a specific decision a customer is not making, find the barrier, choose at most two mechanisms whose evidence holds up, check that the application is honest and lawful, and test it with enough traffic to learn something.

Effect sizes from laboratories shrink in the field. Across 126 trials run by two government nudge units the average effect was 1.4 percentage points, against 8.7 in published academic papers (DellaVigna & Linos, 2022). Plan for small, real gains.

## Instructions

### 1. Pin down the decision

Read the page template, pricing configuration, checkout flow or email in the project, and the analytics for it. Then state, in one line each: who decides, at which moment, what they do now, what you want instead, the current rate, and monthly traffic at that step. If any of these is unknown, get it before proposing a mechanism.

### 2. Find the barrier from evidence

Use session recordings, support tickets, on-page survey answers and funnel data, not a catalogue of biases. Typical barriers and the mechanisms that address them:

| Barrier seen in the data | Candidate mechanisms |
|---|---|
| People do nothing when a choice is required | Default effect, simpler choice set |
| People doubt the product works for someone like them | Descriptive norms (social proof), specific evidence |
| Price looks high with nothing to compare it with | Anchoring, left-digit effect, attribute framing |
| People intend to act and postpone | Genuine deadlines, present-focused benefits, goal-gradient |
| People start and abandon a multi-step task | Endowed progress, fewer steps |

### 3. Choose from effects that hold up

**Well supported** (multi-lab replications, meta-analyses or large field experiments):

| Effect (popular name) | Key evidence | Use | Limit |
|---|---|---|---|
| Default effect | Johnson & Goldstein 2003; meta-analysis of 58 studies, N = 73,675, d = 0.68, with wide variation (Jachimowicz et al. 2019) | Preselect the option most buyers would pick anyway | Never preselect paid extras or consent |
| Anchoring | Tversky & Kahneman 1974; replicated strongly across 36 samples in Many Labs 1 (Klein et al. 2014) | Show a relevant reference price first | Arbitrary anchors on willingness to pay replicated at under a third of the original size (Maniadis, Tufano & List 2014) |
| Risky-choice framing | Tversky & Kahneman 1981; replicated in Many Labs 1 | State outcomes consistently as gains or as avoided losses | Shown for choices under risk, not for every headline |
| Left-digit effect (charm pricing) | Thomas & Morwitz 2005; scanner data from 25 US chains (Strulov-Shlain 2023); field experiment with 21 million Lyft riders (List et al. 2023) | Price just below a round threshold when signalling value | Evidence is from retail and ride prices |
| Mere exposure | Zajonc 1968; 268 curves from 81 articles show liking rises, then falls (Montoya et al. 2017) | Repeated, consistent brand presence | Over-exposure reverses it |
| Reciprocity (gift exchange) | Mailing of about 10,000 letters: donation frequency +17% with a small gift, +75% with a large one (Falk 2007) | Give something useful before asking | Shown for charity; transfer to software trials is an assumption |

**Real but conditional** (works in some settings, small on average, or disputed):

| Effect (popular name) | Key evidence | When it works | Caution |
|---|---|---|---|
| Loss aversion | Kahneman & Tversky 1979; 607 estimates, mean coefficient 1.955 (Brown et al. 2024) | Larger stakes, concrete possessions | Gal & Rucker 2018 and a 2025 re-analysis dispute its robustness; "losses hurt twice as much" is an average, not a rule for copy |
| Scarcity | Meta-analysis, 416 effects from 131 studies (Barton, Zlatevska & Oppewal 2022) | The cue fits the product: demand-based for utilitarian goods, supply-based for experiences, time-based for high-involvement purchases | Must be true; see step 4 |
| Descriptive norms (social proof) | Goldstein, Cialdini & Griskevicius 2008; no advantage in a German replication (Bohner & Schlüter 2014); pooled evidence positive (Scheibehenne et al. 2016) | The reference group resembles the reader | Publicising that many people do the unwanted thing backfires (Cialdini et al. 2006) |
| Attraction effect (decoy, asymmetric dominance) | Huber, Payne & Puto 1982 | Options described by numbers alone | Fails with pictures or real experience of the product (Frederick, Lee & Baskin 2014; Yang & Lynn 2014) |
| Choice overload (paradox of choice) | Iyengar & Lepper 2000; meta-analysis of 50 experiments found a mean effect near zero (Scheibehenne et al. 2010) | Complex options, hard task, unclear preferences, no firm intent to buy (Chernev et al. 2015) | Cutting options is not a universal fix |
| Endowment effect | Kahneman, Knetsch & Thaler 1990 | Tangible ownership | The gap shrinks under tighter procedures (Plott & Zeiler 2005) |
| Present bias (hyperbolic discounting) | Laibson 1997; meta-analysis of 220 estimates (Imai, Rutter & Camerer 2021) | Effort and consumption now versus later | Weak or absent for money |
| Zero-price effect | Shampanier, Mazar & Ariely 2007 | Low-priced items; stronger for hedonic products in follow-up studies | Shown mostly in small lab and cafeteria choices |
| Goal-gradient, endowed progress | Kivetz, Urminsky & Zheng 2006; Nunes & Drèze 2006 | Visible progress toward a reward the person wants | Field studies of loyalty cards; untested for most software flows |
| IKEA effect | Norton, Mochon & Ariely 2012 | The person finishes what they build | Disappears when the task is left incomplete |

**Do not build on these:**

- Ego depletion and the "decision fatigue" advice derived from it: 23 labs found d = 0.04 (Hagger et al. 2016), 36 labs d = 0.06 (Vohs et al. 2021).
- Incidental priming (money or flag images shifting attitudes): failed in Many Labs 1.
- Signing a pledge at the top of a form to increase honesty: the 2012 paper was retracted in 2021; a preregistered replication found nothing (Kristal et al. 2020).
- Subliminal advertising: the 1957 cinema claim was admitted to be invented.
- Button colour as a persuasion lever: in an industry analysis of 6,700 e-commerce experiments, of which about 2,600 were grouped by treatment type, colour changes averaged 0.0% and button changes −0.2% revenue per visitor, while stock scarcity averaged +2.9%, social proof +2.3% and countdown urgency +1.5% (Browne & Swarbrick Jones 2017; not peer reviewed).
- "Nudging" as a blanket claim: a meta-analysis reported d = 0.43 (Mertens et al. 2022); after correction for publication bias no clear effect remained (Maier et al. 2022).

### 4. Pass the honesty and law gate

Reject the idea if any answer is no:

1. Is every statement shown to the customer true at the moment they see it (stock, deadline, number of buyers, reviewer identity)?
2. Would the customer still be content if the mechanism were explained to them?
3. Is declining or undoing as easy as accepting?
4. Does it clear the rules where the customers are?

| Practice | Rule (not legal advice; confirm with counsel) |
|---|---|
| Countdown that resets, false "limited time" | EU Unfair Commercial Practices Directive, Annex I point 7: unfair in all circumstances. US: deception under Section 5 of the FTC Act |
| Invented, purchased or undisclosed insider reviews; bought follower counts | US FTC rule on consumer reviews and testimonials, 16 CFR Part 465, in force since 21 October 2024 |
| Pre-ticked box for a paid extra | EU Consumer Rights Directive, Article 22: express consent required |
| Pre-ticked consent to tracking or marketing | Not valid consent under GDPR (CJEU, Planet49, 2019) |
| Interface that deceives or impairs free choice on an online platform | EU Digital Services Act, Article 25 |
| Cancellation harder than signup | The FTC's 2024 click-to-cancel rule was vacated in July 2025; the Restore Online Shoppers' Confidence Act and state auto-renewal laws still apply |

### 5. Write the hypothesis

```yaml
decision: choose annual or monthly billing at checkout
audience: new self-serve buyers, all devices
barrier: monthly is preselected; 78% never touch the toggle (session data, 2 weeks)
mechanism: default effect
evidence_grade: well supported (Jachimowicz et al. 2019), effect varies by setting
change: preselect annual; show "$144 billed today" beside the per-month price
honesty_gate: total charged is on screen before payment; one click switches to monthly
primary_metric: share of purchases on annual (now 22%)
minimum_effect: 22% -> 30%
guardrails: revenue per checkout visitor, refunds within 30 days, "charged yearly" tickets
```

### 6. Size the test before running it

```python
"""Visitors per variant needed to detect a change between two conversion rates."""
import sys
from statistics import NormalDist

def per_variant(base, target, alpha=0.05, power=0.80):
    z = NormalDist().inv_cdf
    spread = base * (1 - base) + target * (1 - target)
    return round((z(1 - alpha / 2) + z(power)) ** 2 * spread / (base - target) ** 2)

if __name__ == "__main__":
    base, target = float(sys.argv[1]), float(sys.argv[2])
    print(f"{base:.1%} -> {target:.1%}: {per_variant(base, target):,} visitors per variant")
```

Divide the total by weekly traffic at that step. If the answer is more than about eight weeks, do not run a split test: either make a bolder change, measure an earlier step with a higher base rate, or ship the change on judgement and say plainly that its effect was not measured. Fix the sample size in advance and do not stop the first day the difference looks significant.

### 7. Deliver the recommendation

One block per decision, with these fields in this order:

```text
Recommendation: Draftlattice checkout billing default
Decision and baseline: 22% of 3,800 monthly checkout visitors buy annual.
Barrier (evidence): monthly preselected; 78% never touch the toggle.
Mechanism: default effect, well supported; effect size varies widely.
Change: preselect annual, show total billed today.
Honesty and law: passes all four questions; no pre-ticked extras.
Test: 468 per variant for 22% -> 30%; about one week of traffic.
Guardrails: revenue per visitor, 30-day refunds, billing complaints.
Not recommended: decoy tier (plans are shown with screenshots; the effect fails there).
```

## Examples

### Example 1: A request for urgency that cannot be honest as asked

Request: "Harborlight Languages sells an eight-week live Spanish course for $240. The page gets 9,000 visitors a month and 3.1% enrol. Add a 15-minute countdown for each visitor and an 'only 4 seats left' badge."

The agent finds in the page template that cohorts start on fixed dates and are capped at 24 seats. It rejects the per-visitor countdown: the deadline is false, which fails question 1 and is listed as always unfair in the EU, where a third of Harborlight's customers live. It keeps what is true: the enrolment deadline for the next cohort ("Enrolment closes Sunday 18 October, 23:59 CET") and the real remaining seats, shown only when eight or fewer remain. It cites the scarcity meta-analysis for the time-based cue on a considered purchase and warns that e-commerce experiments average +1.5% to +2.9% for such cues.

Then it runs the helper for a lift to 3.6%:

```text
3.1% -> 3.6%: 20,326 visitors per variant
```

That is 40,652 visitors, four and a half months of traffic. The agent recommends shipping the truthful deadline without a split test, watching enrolments per cohort against the previous three cohorts, and reserving experiments for bigger changes such as the course outline or a free first lesson.

### Example 2: More annual subscriptions without tricks

Request: "Draftlattice is $15 per user monthly or $144 a year. Only 22% take annual. What does psychology say?"

The agent reads the checkout component and session data: monthly is preselected and 78% of buyers never touch the toggle. It writes the hypothesis card from step 5 and adds a second, separate test for attribute framing of the saving ("2 months free" against "save 20%"), noting that no solid evidence favours either wording, so the test decides. It declines two ideas the user raised: a third "decoy" plan, because Draftlattice's plans are presented with screenshots, the condition under which the attraction effect has failed, and a "prices rise Friday" banner, because no price rise is planned.

The helper returns `22.0% -> 30.0%: 468 visitors per variant`; with 3,800 checkout visitors a month the test needs about a week, and the agent sets it to two full weeks to cover weekday and weekend buyers. The recommendation follows the template in step 7, with refunds and billing complaints as guardrails so that a default that surprises people shows up as a cost.

## Guidelines

- Use the literature's name for an effect and give the popular label in brackets. If an idea has only a popular label and no traceable study, treat it as untested.
- Cite the status with the effect every time. A reader who sees "anchoring" should also see where it weakens.
- At most two mechanisms per recommendation. Stacking five makes the result impossible to attribute and usually makes the page worse.
- A mechanism addresses a barrier. If the barrier is that the product does not solve the visitor's problem, no effect in the tables helps.
- Laboratory effect sizes are ceilings, not forecasts. Quote field evidence when it exists and say when it does not.
- Dark patterns are out of scope: confirm-shaming, hidden costs, forced continuity, obstructed cancellation, invented scarcity or reviews. Decline them and offer the honest version.
- Vulnerable audiences (children, people in financial or health distress) call for a stricter gate; when in doubt leave the mechanism out.
- The regulatory table is a prompt to check, current to October 2026, and not legal advice.
- This skill does not replace copywriting, pricing research or page audits; it supplies the behavioural reasoning and the test design for one decision at a time.
