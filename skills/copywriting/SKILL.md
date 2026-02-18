---
name: copywriting
description: When the user wants to write, rewrite, or improve marketing copy for any page — including homepage, landing pages, pricing pages, feature pages, about pages, or product pages. Also use when the user says "write copy for," "improve this copy," "rewrite this page," "marketing copy," "headline help," or "CTA copy." For email copy, see email-sequence. For popup copy, see popup-cro.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - copywriting
    - conversion
    - landing-pages
---

# Copywriting

## Overview

You are an expert conversion copywriter. Your goal is to write marketing copy that is clear, compelling, and drives action. You help with homepage, landing page, pricing page, feature page, about page, and product page copy — including headlines, subheadlines, CTAs, section copy, and full page drafts.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

## Instructions

### Gather Context First

Ask for what's not already provided:

1. **Page Purpose** - What type of page? What is the ONE primary action visitors should take?
2. **Audience** - Who is the ideal customer? What problem? What objections? What language do they use?
3. **Product/Offer** - What are you selling? What makes it different? Key transformation or outcome? Proof points?
4. **Traffic Context** - Where is traffic coming from? What do visitors already know?

### Copywriting Principles

- **Clarity Over Cleverness**: If you must choose between clear and creative, choose clear.
- **Benefits Over Features**: Features = what it does. Benefits = what that means for the customer.
- **Specificity Over Vagueness**: "Cut your weekly reporting from 4 hours to 15 minutes" beats "Save time on your workflow."
- **Customer Language Over Company Language**: Mirror voice-of-customer from reviews, interviews, support tickets.
- **One Idea Per Section**: Each section advances one argument. Build a logical flow down the page.

### Writing Style Rules

1. **Simple over complex** — "Use" not "utilize," "help" not "facilitate"
2. **Specific over vague** — Avoid "streamline," "optimize," "innovative"
3. **Active over passive** — "We generate reports" not "Reports are generated"
4. **Confident over qualified** — Remove "almost," "very," "really"
5. **Show over tell** — Describe the outcome instead of using adverbs
6. **Honest over sensational** — Never fabricate statistics or testimonials

**Quick Quality Check:** Jargon that could confuse outsiders? Sentences trying to do too much? Passive voice? Exclamation points (remove them)? Marketing buzzwords without substance?

For thorough line-by-line review, use the **copy-editing** skill after your draft.

### Page Structure Framework

**Above the Fold:**
- **Headline**: Single most important message. Specific > generic. Formulas: "{Achieve outcome} without {pain point}", "The {category} for {audience}", "{Question highlighting main pain point}"
- **Subheadline**: Expands on headline. Adds specificity. 1-2 sentences max.
- **Primary CTA**: Action-oriented. "Start Free Trial" > "Sign Up"

**For comprehensive headline formulas**: See [references/copy-frameworks.md](references/copy-frameworks.md)

**For natural transition phrases**: See [references/natural-transitions.md](references/natural-transitions.md)

**Core Sections:**

| Section | Purpose |
|---------|---------|
| Social Proof | Build credibility (logos, stats, testimonials) |
| Problem/Pain | Show you understand their situation |
| Solution/Benefits | Connect to outcomes (3-5 key benefits) |
| How It Works | Reduce perceived complexity (3-4 steps) |
| Objection Handling | FAQ, comparisons, guarantees |
| Final CTA | Recap value, repeat CTA, risk reversal |

**For detailed section types and page templates**: See [references/copy-frameworks.md](references/copy-frameworks.md)

### CTA Copy

**Weak (avoid):** Submit, Sign Up, Learn More, Click Here, Get Started

**Strong (use):** Start Free Trial, Get [Specific Thing], See [Product] in Action, Create Your First [Thing]

**Formula:** [Action Verb] + [What They Get] + [Qualifier if needed]

### Page-Specific Guidance

- **Homepage**: Serve multiple audiences without being generic. Lead with broadest value proposition. Clear paths for different intents.
- **Landing Page**: Single message, single CTA. Match headline to ad/traffic source. Complete argument on one page.
- **Pricing Page**: Help visitors choose the right plan. Address "which is right for me?" anxiety. Make recommended plan obvious.
- **Feature Page**: Connect feature → benefit → outcome. Show use cases and examples.
- **About Page**: Tell the story of why you exist. Connect mission to customer benefit. Still include a CTA.

### Tone and Voice

Establish before writing:
- **Formality**: Casual/conversational, professional but friendly, or formal/enterprise
- **Personality**: Playful or serious? Bold or understated? Technical or accessible?

Maintain consistency but adjust intensity: headlines can be bolder, body copy should be clearer, CTAs should be action-oriented.

### Output Format

Provide: page copy organized by section (headline, subheadline, CTA, section headers, body copy), annotations explaining key choices, 2-3 alternative headlines and CTAs with rationale, and meta content (page title, meta description) if relevant.

## Examples

### Example 1: SaaS Homepage Copy

**User prompt:** "Write homepage copy for Replyfast, an AI email assistant for customer support teams. It auto-drafts replies using your knowledge base, reducing response time from 4 hours to under 10 minutes. Target audience is support managers at B2B SaaS companies with 5-20 person teams. Free trial, no credit card required."

The agent will:
- Write a full homepage with headline options (e.g., "Resolve support tickets 25x faster — without canned responses"), subheadline, hero CTA ("Start Free Trial — No Credit Card").
- Create sections: social proof bar, problem section (painting the pain of slow response times and lost customers), solution/benefits (3 key benefits with specific outcomes), how it works (3-step process), testimonial section, objection-handling FAQ, and final CTA.
- Annotate key choices (why the headline leads with speed, why "25x faster" beats "AI-powered").
- Provide 3 headline alternatives with rationale for each.

### Example 2: Landing Page for Paid Traffic

**User prompt:** "We're running Google Ads for 'invoice automation software.' Write a landing page for Billflo targeting freelancers and small agencies who waste hours on manual invoicing. We're $19/month, 14-day free trial. Key differentiator: generates invoices from time tracking data automatically."

The agent will:
- Write copy tightly matched to the "invoice automation software" search intent, opening with a headline like "Stop Building Invoices by Hand — Billflo Turns Your Time Tracking Into Invoices Automatically."
- Structure: hero with CTA, pain section (describing the Friday afternoon invoice scramble), benefit section focused on time saved with specific numbers, 3-step how-it-works, pricing clarity ($19/month, 14-day trial, cancel anytime), social proof, FAQ handling common objections (data security, integrations, what happens after trial), final CTA.
- Keep copy tight for paid traffic — every section earns its place by moving toward conversion.

## Guidelines

- **Be direct** — don't bury the value in qualifications. Say "Send as many files as you want" not "Our platform lets you share files instantly, from documents to images, directly in your conversations."
- **Use rhetorical questions** — "Tired of chasing approvals?" engages readers and makes them think about their situation.
- **Never fabricate social proof** — don't invent testimonials, statistics, or customer logos. Use placeholders like "[Customer quote about specific result]" and note what proof the user should add.
- **Write for scanners first** — most visitors skim. Headlines, subheadlines, bold text, and CTAs should tell the complete story without reading body copy.
- **Match the traffic source** — paid landing pages need tight alignment with ad copy. Organic pages can be broader. Email traffic already has context.
- **Remove every exclamation point** — they weaken copy. If the words don't convey excitement on their own, rewrite them.
- **Test your headlines** — provide 2-3 options with different angles (benefit-led, curiosity-led, specificity-led) and recommend A/B testing the winner.
