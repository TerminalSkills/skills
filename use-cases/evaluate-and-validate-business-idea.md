---
title: Evaluate and Validate a Business Idea Before Writing Code
slug: evaluate-and-validate-business-idea
description: >-
  Marco has 3 SaaS ideas and has been going back and forth for 6 months.
  Use market evaluation and shadow testing to pick one, validate demand with
  a $200 ad budget, and get 47 signups in 5 days before writing any code.
skills:
  - market-evaluation
category: business
tags:
  - startup
  - validation
  - market-research
  - saas
  - ideation
  - shadow-testing
---

## The Problem

Marco is an indie developer. He has three SaaS ideas and has been agonizing over them for six months. He spends evenings reading about each idea, switching between them in his Notion board, and never committing to any one thing.

**Idea A:** An AI tool that generates social media captions from blog posts.
**Idea B:** An AI invoice parser that extracts data from PDFs and pushes it into Xero/QuickBooks.
**Idea C:** A grammar checker specifically for legal documents.

He can only seriously pursue one. He's a developer, not a marketer — he doesn't know how to evaluate market opportunity. And he's burned out from months of indecision.

The real cost: every week he spends deciding is a week he's not building. Six months of indecision = 6 months closer to a competitor shipping.

## The Solution

Use the 10-factor market evaluation framework to score each idea objectively, identify the winner, map critical assumptions, and shadow test demand with a $200 Google Ads budget — before writing a single line of code.

## Step-by-Step Walkthrough

### Step 1: Score Each Idea on 10 Factors

Marco runs each idea through the 10-factor evaluation. He scores 1-10 on each dimension, being brutally honest.

```
IDEA A: AI Social Media Caption Generator (Urgency/Mktsize/Pricing/CAC/Delivery/Unique/Speed/CapEx/Upsell/Evergreen)

  Urgency:          4  (nice to have, marketers already use ChatGPT for free)
  Market size:      7  (many social media managers, but crowded)
  Pricing potential:3  (hard to charge >$20/mo — free alternatives everywhere)
  CAC:              4  (hard to stand out in a sea of AI writing tools)
  Value delivery:   9  (pure software, near-zero marginal cost)
  Uniqueness:       2  (Buffer, Jasper, Copy.ai, ChatGPT — brutal competition)
  Speed to market:  8  (doable in 3-4 weeks)
  Up-front invest:  9  (low capital needed)
  Upsell potential: 5  (scheduling, analytics — already done by competitors)
  Evergreen:        6  (social media isn't going anywhere, but AI commoditizes it)

  TOTAL: 57/100 → PROCEED WITH CAUTION (borderline, weak differentiation)
```

```
IDEA B: AI Invoice Parser for Accountants

  Urgency:          8  (month-end close is painful — accountants lose HOURS weekly)
  Market size:      7  (500k+ accountants and bookkeepers in US alone)
  Pricing potential:8  (businesses pay $49-299/mo for accounting tools easily)
  CAC:              7  (accountants reachable via LinkedIn, accounting communities, Xero/QB directories)
  Value delivery:   8  (software + AI API, low marginal cost)
  Uniqueness:       6  (AutoEntry exists but expensive and clunky — room for better UX)
  Speed to market:  6  (PDF parsing + AI + API integration = 6-8 weeks)
  Up-front invest:  8  (AWS + OpenAI costs manageable)
  Upsell potential: 8  (receipt management, bank reconciliation, multi-entity, white-label)
  Evergreen:        9  (invoices will always exist — evergreen problem)

  TOTAL: 75/100 → PROMISING ✓
```

```
IDEA C: Grammar Checker for Legal Documents

  Urgency:          5  (lawyers care but Grammarly sort-of works)
  Market size:      4  (legal is niche — US lawyers: ~1.3M, fewer use B2B tools)
  Pricing potential:7  (law firms pay well — $100-500/mo plausible)
  CAC:              3  (lawyers are HARD to reach — no communities, hate spam, trust issues)
  Value delivery:   8  (software)
  Uniqueness:       6  (no dominant player but low urgency dampens demand)
  Speed to market:  6  (fine-tuning for legal language takes time)
  Up-front invest:  7  (manageable)
  Upsell potential: 5  (contract review, template library — limited scope)
  Evergreen:        8  (legal writing never changes)

  TOTAL: 59/100 → PROCEED WITH CAUTION
```

**Winner: Idea B — AI Invoice Parser (75/100)**

The gap is clear. Idea A has a pricing ceiling problem and brutal competition. Idea C has an acquisition nightmare. Idea B has real urgency, willingness to pay, and a reachable audience.

### Step 2: Map Critical Assumptions

Marco writes down every assumption that MUST be true for the invoice parser to work:

```
CRITICAL ASSUMPTIONS (most important first):

1. Accountants spend 5+ hours/week on manual invoice data entry  ← TEST THIS FIRST
2. They're willing to pay $49+/month for automation
3. AI (GPT-4 Vision) can extract invoice data with 90%+ accuracy
4. Xero/QuickBooks APIs allow the integrations needed
5. Existing tools (AutoEntry, Hubdoc) have poor UX that frustrates users
6. GDPR/data privacy concerns won't block adoption
```

**Testing priority:** Assumption #1 is cheapest to test — 20 phone calls to accountants. If they don't spend 5+ hours/week on this, nothing else matters.

Marco spends two days making calls. Result: 18 of 20 accountants said they spend 6-15 hours/month on manual invoice entry. The pain is real.

### Step 3: Shadow Test with $200 Ad Budget

With assumption #1 confirmed, Marco builds a landing page in one afternoon:

```
Landing page copy:
  Headline: "Stop typing invoice data. AI does it in seconds."
  Subhead:  "Upload any PDF invoice. AI extracts all fields and pushes
             directly to Xero or QuickBooks. 90-second demo below."
  CTA:      "Join the waitlist — first 100 users get 50% off forever"
  Social proof: [placeholder: "Join 47 accountants on the waitlist"]
```

**Ad setup:**
- Platform: Google Ads (search intent — people already looking for solutions)
- Budget: $200 over 5 days
- Keywords: "invoice data entry automation", "xero invoice import", "pdf to quickbooks"
- Audience: billing, accounts payable job titles

**Day 5 results:**
```
Ad spend:        $194
Clicks:          312
Landing page:    page visits
Signups:         47 waitlist emails (15.1% signup rate)
Cost per signup: $4.13

Benchmark:
  < 2% = weak demand
  2-5% = moderate interest
  > 5% = strong signal ← WE GOT 15.1%
```

47 signups at 15% conversion rate is an overwhelming signal. The market exists. People care enough to give their email for a product that doesn't exist yet.

### Step 4: Validate Pricing

Marco emails 47 signups: "Would you pay $49/month for this when it launches?"

Results:
- 31 replied (66% response rate — these people are engaged)
- 24 said yes to $49/month
- 9 said yes but only at $29/month
- 4 asked about enterprise pricing ($299+/month)

Pricing conclusion: $49/month starter tier is validated. Potential for $299/month enterprise.

### Step 5: Build the MVP

Marco now has enough signal to write code. He scopes a focused MVP:

```
MVP Scope (2 weeks):

  IN:
    - PDF invoice upload (drag-and-drop)
    - GPT-4 Vision extraction (vendor, date, line items, total, tax)
    - Review/edit extracted data before pushing
    - One-click sync to Xero OR QuickBooks (user chooses at setup)
    - Simple dashboard showing processed invoices

  OUT (save for v2):
    - Batch processing
    - Bank reconciliation
    - Receipt handling
    - Slack notifications
    - Multi-user team accounts
```

**Tech stack:**
```typescript
// Core extraction pipeline
async function extractInvoiceData(pdfBuffer: Buffer): Promise<InvoiceData> {
  const base64 = pdfBuffer.toString('base64');

  const response = await openai.chat.completions.create({
    model: "gpt-4-vision-preview",
    messages: [{
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:application/pdf;base64,${base64}` }
        },
        {
          type: "text",
          text: `Extract invoice data as JSON:
            { vendor, invoiceNumber, date, dueDate,
              lineItems: [{description, quantity, unitPrice, total}],
              subtotal, tax, total, currency }`
        }
      ]
    }],
  });

  return JSON.parse(response.choices[0].message.content!);
}
```

Marco ships the MVP in 12 days. He onboards the first 5 paying customers from his waitlist the next day.

### Step 6: First Paying Customers

Day 1 after launch: Marco emails the 24 people who said "yes" to $49/month.

```
Subject: InvoiceAI is live — here's your beta access

Hi [Name],

You signed up for the waitlist 3 weeks ago. It's ready.

Here's what it does: upload a PDF invoice, AI extracts all the data in
under 10 seconds, you click "Send to Xero" and you're done.

I'm giving the first 10 customers lifetime access at $29/month (vs
$49 regular price) for being early. This deal closes when 10 spots fill.

[Try it now — 14 day free trial]

Marco
```

Result: 8 paying customers by end of day. $232 MRR on day 1 of launch.

## Real-World Example

**Company:** InvoiceAI (Marco's validated SaaS)
**Timeline:** 3 weeks from idea evaluation to first paying customers

Marco, a solo developer in Berlin, had been stuck between three SaaS ideas for six months. He ran each through the 10-factor market evaluation framework and scored them: AI caption generator (57/100), AI invoice parser for accountants (75/100), and legal grammar checker (59/100). The invoice parser won decisively on urgency, pricing potential, and upsell opportunity.

He validated assumption #1 (accountants spend 5+ hours/week on manual data entry) with 20 cold calls over two days. 18 of 20 confirmed the pain. He then ran a $194 Google Ads campaign targeting "invoice data entry automation" and "pdf to quickbooks" keywords, landing 47 waitlist signups at a 15.1% conversion rate — 3x above the strong-signal benchmark.

Before writing any code, Marco emailed all 47 signups about pricing. 24 confirmed they would pay $49/month. He scoped a 2-week MVP (PDF upload, GPT-4 Vision extraction, one-click Xero/QuickBooks sync) and shipped in 12 days. Day one post-launch: 8 paying customers at $29/month early-bird pricing, generating $232 MRR.

Total investment before first revenue: $194 in ads, 20 phone calls, and 12 days of development. Six months of indecision replaced by 3 weeks of structured validation.

## Key Lessons

1. **Six months of indecision = zero revenue.** The 10-factor framework forced a decision in one afternoon.

2. **The cheapest test is a conversation.** Marco validated the core assumption (pain exists) with 20 phone calls before spending a dollar on ads.

3. **15% landing page conversion = demand is strong.** Industry standard for cold traffic is 2-5%. Three times above benchmark means people were already searching for this.

4. **Shadow testing saved Marco from building the wrong thing.** Idea A looked fun but scored 57. Building it would have been 3 months of work for a crowded market with no pricing power.

5. **Small MVP, real customers.** 12 days to MVP, 8 paying customers on day 1. Not because Marco is exceptional — because he scoped ruthlessly.

## What to Do Next

- Week 3-4: Onboard waitlist customers, fix bugs, watch usage patterns
- Month 2: Add batch processing (most requested feature)
- Month 3: Build enterprise tier ($299/month) for accounting firms
- Ongoing: Post in accounting communities (not ads) — lower CAC, higher trust

## Related Skills

- **[market-evaluation](/skills/market-evaluation)** — The 10-factor scoring framework used to evaluate and rank Marco's three ideas
- **[lean-canvas](/skills/lean-canvas)** — Map business model assumptions before building
- **[pricing-strategy](/skills/pricing-strategy)** — Structure pricing tiers and validate willingness to pay
- **[ad-campaign-optimization](/skills/ad-campaign-optimization)** — Run and optimize the shadow test ad campaigns
- **[go-to-market](/skills/go-to-market)** — Plan the launch strategy after validation confirms demand
