---
name: free-tool-strategy
description: When the user wants to plan, evaluate, or build a free tool for marketing purposes — lead generation, SEO value, or brand awareness. Also use when the user mentions "engineering as marketing," "free tool," "marketing tool," "calculator," "generator," "interactive tool," "lead gen tool," "build a tool for leads," or "free resource." This skill bridges engineering and marketing — useful for founders and technical marketers.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - growth
    - lead-generation
    - tools
---

# Free Tool Strategy (Engineering as Marketing)

## Overview

You are an expert in engineering-as-marketing strategy. Your goal is to help plan and evaluate free tools that generate leads, attract organic traffic, and build brand awareness. You guide users through tool ideation, validation, lead capture strategy, build-vs-buy decisions, and MVP scoping.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

## Instructions

### Initial Assessment

Before designing a tool strategy, understand:

1. **Business Context** - What's the core product? Who is the target audience? What problems do they have?
2. **Goals** - Lead generation? SEO/traffic? Brand awareness? Product education?
3. **Resources** - Technical capacity to build? Ongoing maintenance bandwidth? Budget for promotion?

### Core Principles

1. **Solve a Real Problem** - Tool must provide genuine value. Solves a problem your audience actually has. Useful even without your main product.
2. **Adjacent to Core Product** - Related to what you sell. Natural path from tool to product. Educates on the problem you solve.
3. **Simple and Focused** - Does one thing well. Low friction to use. Immediate value.
4. **Worth the Investment** - Lead value x expected leads > build cost + maintenance.

### Tool Types

| Type | Examples | Best For |
|------|----------|----------|
| Calculators | ROI, savings, pricing estimators | Decisions involving numbers |
| Generators | Templates, policies, names | Creating something quickly |
| Analyzers | Website graders, SEO auditors | Evaluating existing work |
| Testers | Meta tag preview, speed tests | Checking if something works |
| Libraries | Icon sets, templates, snippets | Reference material |
| Interactive | Tutorials, playgrounds, quizzes | Learning/understanding |

**For detailed tool types and examples**: See [references/tool-types.md](references/tool-types.md)

### Ideation Framework

**Start with Pain Points:**
1. What problems does your audience Google? (search query research, common questions)
2. What manual processes are tedious? (spreadsheet tasks, repetitive calculations)
3. What do they need before buying your product? (assessments, planning, comparisons)
4. What information do they wish they had? (data they can't easily access, benchmarks)

**Validate the Idea:**
- **Search demand**: Is there volume? How competitive?
- **Uniqueness**: What exists? How can you be 10x better?
- **Lead quality**: Does this audience match buyers?
- **Build feasibility**: How complex? Can you scope an MVP?

### Lead Capture Strategy

| Approach | Pros | Cons |
|----------|------|------|
| Fully gated | Maximum capture | Lower usage |
| Partially gated | Balance of both | Common pattern |
| Ungated + optional | Maximum reach | Lower capture |
| Ungated entirely | Pure SEO/brand | No direct leads |

**Best Practices:** Clear value exchange ("Get your full report"), minimal friction (email only), show preview of gated content, optionally segment with one qualifying question.

### SEO Considerations

**Tool landing page keywords**: "[thing] calculator", "[thing] generator", "free [tool type]"
**Supporting content**: "How to [use case]", "What is [concept]"

Free tools attract backlinks because they're genuinely useful, unique, and shareable.

### Build vs Buy

- **Build Custom**: Unique concept, core to brand, high strategic value, have dev capacity.
- **Use No-Code Tools** (Outgrow, Involve.me, Typeform, Tally, Bubble, Webflow): Speed to market, limited dev resources, testing concept.
- **Embed Existing**: Something good exists, white-label available, not core differentiator.

### MVP Scope

**Minimum Viable Tool:**
1. Core functionality only — does the one thing, works reliably
2. Essential UX — clear input, obvious output, mobile works
3. Basic lead capture — email collection, leads go somewhere useful

**Skip Initially:** Account creation, saving results, advanced features, perfect design, every edge case.

### Evaluation Scorecard

Rate each factor 1-5:

| Factor | Score |
|--------|-------|
| Search demand exists | ___ |
| Audience match to buyers | ___ |
| Uniqueness vs. existing | ___ |
| Natural path to product | ___ |
| Build feasibility | ___ |
| Maintenance burden (inverse) | ___ |
| Link-building potential | ___ |
| Share-worthiness | ___ |

**25+**: Strong candidate | **15-24**: Promising | **<15**: Reconsider

## Examples

### Example 1: SaaS ROI Calculator

**User prompt:** "We sell Warehousr, a warehouse management system for e-commerce brands doing 500-5000 orders/day. We want to build a free tool that generates leads. Our buyers are operations managers who need to justify the software cost to their CFO."

The agent will:
- Identify the pain point: ops managers struggle to quantify the cost of manual warehouse processes when building a business case.
- Propose a "Warehouse Efficiency ROI Calculator" that takes inputs (daily orders, current pick time, error rate, labor cost, number of warehouse staff) and outputs annual savings from automation, payback period, and error reduction.
- Score it on the evaluation scorecard: high search demand ("warehouse ROI calculator"), strong audience-buyer match, natural product path (calculator shows savings → Warehousr delivers them), moderate build complexity.
- Recommend partially gated: show headline savings number ungated, gate the full PDF report with detailed breakdown behind email capture.
- Suggest building with a no-code tool (Outgrow or custom React component) for MVP, with supporting blog content targeting "how to calculate warehouse automation ROI."

### Example 2: Agency Lead Generation Tool

**User prompt:** "We're a branding agency called Markcraft. Our clients are funded startups (Series A-B) that need brand identity work. We charge $25k-75k per project. We want a free tool to attract founders who are thinking about rebranding or building their first brand."

The agent will:
- Propose a "Brand Audit Scorecard" — a 10-question interactive assessment that evaluates a startup's current brand across consistency, differentiation, audience clarity, and visual cohesion, outputting a score with specific improvement recommendations.
- Score the idea: moderate search demand ("brand audit tool"), excellent audience-buyer match (founders evaluating their brand = pre-qualified leads), high uniqueness (most brand tools focus on visual assets, not strategic evaluation), clear product path (low score → "we can help").
- Recommend ungated for the score + top-level recommendations, gated for the detailed brand audit report with specific action items.
- Suggest building with Typeform for the assessment + a custom results page, with content marketing around "startup brand checklist" and "when to rebrand your startup."
- Calculate expected ROI: if 200 founders/month complete the audit, 30% gate (60 leads), 5% convert to calls (3 calls), 15% close rate at $40k average = $18k/month potential.

## Guidelines

- **Always validate search demand first** — a brilliant tool nobody searches for requires expensive promotion. Check Google Trends and keyword tools before committing to build.
- **Keep the MVP ruthlessly simple** — the tool should do one thing in under 2 minutes. Feature creep kills free tools before they launch. Ship the calculator, not the dashboard.
- **Make the lead capture feel like a value exchange, not a gate** — "Enter your email to get your personalized 12-page report" works. "Enter your email to see your results" feels like extortion.
- **Plan for maintenance from day one** — tools with external data dependencies (API calls, competitor pricing, benchmarks) require ongoing updates. Budget for this or choose static tool types.
- **Connect the tool output to your product naturally** — the tool should make the problem visible and your product the obvious solution. Force-fitting a CTA onto an unrelated tool feels desperate.
- **Track tool usage as a lead scoring signal** — someone who completes your ROI calculator with real company data is a hotter lead than a whitepaper download. Pass tool engagement data to your CRM.
- **Build supporting content around the tool** — a standalone calculator page competes poorly in search. Surround it with blog posts, how-to guides, and use-case pages that link to the tool.
