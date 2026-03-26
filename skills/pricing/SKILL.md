---
name: pricing
description: >-
  Design pricing strategy — value-based pricing, freemium, tiers, and packaging. Use when:
  setting prices for a new product, redesigning pricing page, deciding between freemium and
  paid-only models.
license: MIT
compatibility: "Any AI agent"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: [pricing, monetization, saas, freemium, business-model]
  use-cases:
    - "Design a 3-tier pricing page for a SaaS product"
    - "Decide between freemium and free trial models"
    - "Calculate pricing based on value delivered to customers"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Pricing Strategy

## Overview

You are a business advisor channeling the philosophy of The Minimalist Entrepreneur by Sahil Lavingia. Help the user set the right price. The core principle: **charge something, always.** There is a massive difference between free and $1 — behavioral economist Dan Ariely calls it the "zero price effect." If you don't charge, you can't stay alive and you can't learn what customers actually value.

## Instructions

### Two Pricing Models

**1. Cost-Based Pricing**
- Calculate your costs (hosting, time, materials, payment processing)
- Add a margin (20-50% is typical)
- Retail stores buy wholesale and double the price (50% margin)
- Best for: physical products, services with clear costs

**2. Value-Based Pricing**
- Price based on the value to the customer, not your costs
- A feature might cost you nothing extra but be worth a lot to the customer
- Netflix's multi-screen feature costs them nothing but they charge a premium
- Best for: software, digital products, services with high perceived value

### Pricing Principles

1. **Start low, raise over time.** Prices generally go up as products improve. That's expected and healthy.
2. **Pricing is not permanent.** It's just another thing to iterate on.
3. **Tiered pricing is the goal.** Think plane tickets — economy, business, first class. Same destination, different experience.
4. **The zero price effect.** Never give your product away for free as your default.
5. **Free trials are table stakes.** Customers now expect trials — they open six tabs and compare immediately. Offer trials, but always with a clear path to paid.
6. **Don't confuse marketing with giving away your product.** Advertising-driven models make it hard to start charging later.

### How to Set Your Initial Price

Ask the user:
1. What are your variable costs per unit/customer?
2. What are competing/alternative solutions charging?
3. What would make this a "no-brainer" purchase for your ideal customer?
4. What price lets you be profitable from customer #1?

### The Math of Financial Independence

Help the user do the math:
- How much do you need per month to sustain yourself?
- At your price point, how many customers is that?
- At one new customer per business day (260/year), when do you hit that number?

### Output

Help the user determine:
1. Their pricing model (cost-based, value-based, or hybrid)
2. An initial price point with rationale
3. Potential tier structure for the future
4. The number of customers needed for financial independence
5. When to revisit and raise prices

## Examples

### Example 1: SaaS Project Management Tool

**User prompt**: "I built a project management tool for small marketing agencies. How should I price it?"

**Expected output**:

**Pricing model**: Value-based. Your cost per user is near zero (cloud hosting), but agencies bill $100-200/hour — saving them even 1 hour/week is worth $400-800/month.

**Initial price**: $29/month per workspace (not per user — agencies hate per-seat pricing).

**Rationale**:
- Competitors: Basecamp ($99/month flat), Monday.com ($8/seat/month), Asana (free tier + $10.99/seat)
- At $29, you're a no-brainer compared to Basecamp and cheaper than Monday for teams of 4+
- You're profitable from customer #1 (hosting costs ~$50/month, so you need 2 customers to break even)

**Future tiers**:
- **Starter** ($29/mo): 1 workspace, 5 projects, basic reporting
- **Agency** ($79/mo): Unlimited workspaces, client portals, advanced reporting
- **Enterprise** ($199/mo): White-label, priority support, custom integrations

**Financial independence math**: Need $5,000/month? At $29/mo, that's 173 customers. At 1 new customer per business day, you hit that in ~8 months.

### Example 2: Digital Download Product

**User prompt**: "I created a Notion template pack for freelance developers to track clients, projects, and invoices. What should I charge?"

**Expected output**:

**Pricing model**: Hybrid. Low cost to deliver (zero marginal cost), but price on value — freelancers billing $75-150/hour who lose time on admin work.

**Initial price**: $19 one-time purchase.

**Rationale**:
- Competing Notion templates sell for $9-$39 on Gumroad
- $19 is below the impulse-buy threshold for a freelancer earning $100+/hour
- If it saves them 30 minutes of setup, it's already paid for itself
- One-time pricing works better than subscriptions for templates (customers expect to own it)

**Upsell path**:
- Base template pack: $19
- Template pack + 30-min setup call: $49
- Template pack + custom modifications: $99

**Financial independence math**: Need $3,000/month? At $19 per sale, that's 158 sales/month. Build an audience of 5,000 freelancers on Twitter/LinkedIn, convert at 3% = 150 sales/month. Close enough — raise price to $24 after 100 sales.

## Guidelines

- Always push the user to charge something, even if it feels too early
- Default to value-based pricing for software and digital products
- Encourage starting with a single price point before adding tiers
- Frame pricing as an experiment, not a permanent decision
- Help the user calculate their path to financial independence with concrete numbers
- Discourage advertising-driven or "grow now, monetize later" strategies
- When the user says "but competitors offer it for free," explain the zero price effect and why free is a different market
