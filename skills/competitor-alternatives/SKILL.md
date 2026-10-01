---
name: competitor-alternatives
description: "Plans and writes competitor comparison and alternative pages for SEO and sales enablement. Use when the user asks for an 'alternative page,' 'vs page,' 'competitor comparison,' 'comparison page,' '[Product] vs [Product],' '[Product] alternative,' or 'competitive landing pages.' Covers four formats: singular alternative, plural alternatives, you vs competitor, and competitor vs competitor. Emphasizes deep research, modular content architecture, and varied section types beyond feature tables."
license: MIT
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags:
    - seo
    - competition
    - comparison
---

# Competitor & Alternative Pages

## Overview

You are an expert in creating competitor comparison and alternative pages. Your goal is to build pages that rank for competitive search terms, provide genuine value to evaluators, and position your product effectively. You cover four page formats: singular alternative, plural alternatives, you-vs-competitor, and competitor-vs-competitor.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

## Instructions

### Initial Assessment

Before creating competitor pages, understand:

1. **Your Product** - Core value proposition, key differentiators, ideal customer profile, pricing model, strengths and honest weaknesses.
2. **Competitive Landscape** - Direct and indirect competitors, market positioning, search volume for competitor terms.
3. **Goals** - SEO traffic capture, sales enablement, conversion from competitor users, brand positioning.

### Core Principles

1. **Honesty Builds Trust** - Acknowledge competitor strengths. Be accurate about your limitations. Readers are comparing and will verify claims.
2. **Depth Over Surface** - Go beyond feature checklists. Explain *why* differences matter. Include use cases and scenarios.
3. **Help Them Decide** - Different tools fit different needs. Be clear about who you're best for and who the competitor is best for.
4. **Modular Content Architecture** - Centralize competitor data so updates propagate to all pages.

### Page Format 1: [Competitor] Alternative (Singular)

**Intent**: User actively looking to switch from a specific competitor.
**URL**: `/alternatives/[competitor]` or `/[competitor]-alternative`
**Keywords**: "[Competitor] alternative", "alternative to [Competitor]", "switch from [Competitor]"

**Structure**: Why people look for alternatives (validate pain) → You as the alternative → Detailed comparison → Who should switch (and who shouldn't) → Migration path → Social proof from switchers → CTA.

### Page Format 2: [Competitor] Alternatives (Plural)

**Intent**: User researching options, earlier in journey.
**URL**: `/alternatives/[competitor]-alternatives`
**Keywords**: "[Competitor] alternatives", "best [Competitor] alternatives"

**Structure**: Common pain points → Criteria framework → List of alternatives (you first, but include 4-7 real options) → Comparison table → Detailed breakdown → Recommendation by use case → CTA.

Being genuinely helpful by including real alternatives builds trust and ranks better.

### Page Format 3: You vs [Competitor]

**Intent**: User directly comparing you to a specific competitor.
**URL**: `/vs/[competitor]` or `/compare/[you]-vs-[competitor]`

**Structure**: TL;DR summary (key differences in 2-3 sentences) → At-a-glance comparison table → Detailed comparison by category (Features, Pricing, Support, Ease of use, Integrations) → Who you're best for → Who competitor is best for (be honest) → Testimonials from switchers → Migration support → CTA.

### Page Format 4: [Competitor A] vs [Competitor B]

**Intent**: User comparing two competitors (not you directly).
**URL**: `/compare/[competitor-a]-vs-[competitor-b]`

**Structure**: Overview of both → Comparison by category → Who each is best for → Introduce yourself as the third option → Three-way comparison table → CTA.

Captures search traffic for competitor terms and positions you as knowledgeable.

### Essential Page Sections

- **TL;DR Summary**: Start every page with key differences in 2-3 sentences for scanners.
- **Paragraph Comparisons**: Go beyond tables. For each dimension, explain differences and when each matters.
- **Pricing Comparison**: Tier-by-tier, what's included, hidden costs, total cost for sample team size.
- **Who It's For**: Be explicit about ideal customer for each option.
- **Migration Section**: What transfers, reconfiguration needed, support offered, quotes from switchers.

**For detailed templates**: See [references/templates.md](references/templates.md)

### Research Process

For each competitor, gather:
1. **Product research**: Sign up, use it, document features/UX/limitations.
2. **Pricing research**: Current pricing, what's included, hidden costs.
3. **Review mining**: G2, Capterra, TrustRadius for common praise/complaint themes.
4. **Customer feedback**: Talk to customers who switched (both directions).
5. **Content research**: Their positioning, their comparison pages, their changelog.

Update quarterly (pricing, major features), annually (full refresh).

### SEO and Content Architecture

**Internal Linking**: Link between related competitor pages, from feature pages to comparisons, and create a hub page linking to all competitor content.

**FAQ Section**: Answer common questions like "What is the best alternative to [Competitor]?" in a visible FAQ block. Do not rely on FAQ schema for search appearance: Google stopped showing FAQ rich results on May 7, 2026.

**URL Map**: One competitor can feed all four formats; keep the paths predictable.

```text
/alternatives/asana                  # Format 1: Asana alternative
/alternatives/asana-alternatives     # Format 2: Asana alternatives
/vs/asana                            # Format 3: you vs Asana
/compare/asana-vs-monday             # Format 4: competitor vs competitor
/compare                             # hub page linking to all of the above
```

**Centralized Competitor Data**: Create a single YAML source of truth for each competitor with positioning, pricing, feature ratings, strengths/weaknesses, best-for/not-ideal-for, and common complaints from reviews. Record where each fact came from and when it was last checked:

```yaml
# competitor_data/asana.yaml
name: Asana
website: asana.com
pricing:
  model: per-seat
  free_tier: Personal
  starter: "$10.99/user/month billed annually ($13.49 monthly)"
  advanced: "$24.99/user/month billed annually ($30.49 monthly)"
  enterprise: custom
  source: https://asana.com/pricing
  last_verified: 2026-10-01
strengths:
  - Large integration ecosystem
  - Enterprise features
  - Brand recognition
best_for:
  - Large teams and enterprises
  - Teams already working in Asana
not_ideal_for:
  - Small agencies that need client portals and time tracking built in
```

**For data structure and examples**: See [references/content-architecture.md](references/content-architecture.md)

## Examples

### Example 1: Project Management Tool vs Page

**User prompt:** "We're building a 'TeamSync vs Asana' comparison page. TeamSync is a lightweight project management tool for small agencies (under 20 people). We're $12/user/month vs Asana's $10.99-$24.99 range. Our strength is simplicity and agency-specific features like client portals and time tracking built in."

The agent will:
- Draft a full "TeamSync vs Asana" page following Format 3 structure.
- Open with a TL;DR that says who each tool is built for and what each costs (shown below).
- Create comparison sections for Features, Pricing, Ease of Use, Integrations, and Support.
- Honestly note where Asana wins (larger integration ecosystem, enterprise features, brand recognition).
- Include a "Who Asana is best for" section (large teams, enterprise, teams already in the Asana ecosystem).
- Provide a meta title, a meta description, and FAQ questions with answers targeting "TeamSync vs Asana" keywords.

The page, titled "TeamSync vs Asana: Which Fits a Small Agency?", opens like this:

```markdown
**TL;DR**: TeamSync is built for agencies under 20 people, with client portals and time
tracking included at $12/user/month. Asana is a general-purpose tool that scales to
enterprises; its paid plans run $10.99–$24.99/user/month billed annually.
Choose Asana if you need its integration ecosystem or enterprise controls.
Choose TeamSync if you bill clients by the hour and want one tool for it.

| | TeamSync | Asana |
|---|---|---|
| Price per user/month | $12 | $10.99–$24.99 (annual billing) |
| Built for | Agencies under 20 people | General-purpose teams up to enterprise |
| Client portals, time tracking | Built in | Confirm per plan before publishing |

_Pricing last verified: 2026-10-01 — asana.com/pricing_
```

### Example 2: Alternatives Roundup Page

**User prompt:** "We need a 'Mailchimp Alternatives' page for our email platform SendPulse. Our differentiator is multi-channel (email + SMS + web push) at lower prices. Target audience is growing e-commerce stores spending $100-500/month on email."

The agent will:
- Create a Format 2 alternatives page with 6 alternatives (SendPulse positioned first).
- Frame the opening around common Mailchimp pain points for e-commerce: pricing jumps at scale, limited SMS integration, basic automation for product-based businesses.
- Include a criteria framework (pricing transparency, multi-channel, e-commerce integrations, automation depth).
- Write detailed breakdowns of each alternative with honest pros/cons.
- Add a comparison table covering price at 10k and 50k contacts, SMS support, e-commerce integrations, and automation capabilities.
- Recommend by use case: "Best for budget-conscious stores" vs "Best for advanced automation" vs "Best for Shopify-native."

The delivered outline:

```text
H1  6 Mailchimp Alternatives for Growing E-commerce Stores (2026)
H2  Why stores outgrow Mailchimp
H2  How we compared: pricing transparency, channels, e-commerce integrations, automation
H2  The alternatives at a glance (comparison table, prices at 10k and 50k contacts)
H2  1. SendPulse — email, SMS and web push in one plan
H2  2–6. One section per alternative: who it suits, pros, cons, pricing
H2  Which one should you pick? (by use case)
H2  Switching from Mailchimp: what transfers and what does not
H2  FAQ
```

## Guidelines

- **Always be honest about competitor strengths** — readers are actively comparing and will fact-check. Losing credibility on one claim undermines the entire page.
- **Never misrepresent competitor pricing or features** — screenshot or link to their pricing page as a source. Pricing changes frequently; include a "last verified" date.
- **Go beyond feature comparison tables** — tables are table stakes. The paragraph comparisons explaining *why* differences matter are what differentiate your page from every other comparison.
- **Include "who should NOT switch"** — this builds enormous trust and actually increases conversion by making the recommendation feel genuine.
- **Update competitor data quarterly** — stale comparison pages with outdated pricing or features damage credibility and rankings.
- **Use review sites for voice-of-customer language** — G2 and Capterra reviews reveal the exact words people use when frustrated with competitors. Mirror that language in your "why people look for alternatives" section.
- **Create the competitor data file first** — a centralized YAML source per competitor ensures consistency across all pages and makes quarterly updates manageable.

---

Adapted from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (MIT License, © Corey Haines).
