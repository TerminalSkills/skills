---
name: brand-guidelines
description: >-
  Create and maintain brand style guides for consistent visual identity.
  Use when a user asks to create brand guidelines, build a style guide,
  define a brand identity, create a design system document, establish
  brand colors and typography, or produce any brand standards documentation.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["branding", "style-guide", "visual-identity", "design-system", "typography"]
  use-cases:
    - "Create comprehensive brand guidelines from scratch for a new product or company"
    - "Document existing brand identity into a shareable style guide"
    - "Define color palettes, typography scales, and visual standards"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Brand Guidelines

## Overview

Create and maintain brand style guides that ensure consistent visual identity across all touchpoints. Covers logo usage, color palettes, typography, spacing, tone of voice, imagery, and component styling. Produces actionable documentation that designers and developers can follow to keep a brand cohesive.

## Instructions

When a user asks you to create brand guidelines, follow these steps:

### Step 1: Understand the brand foundation

Gather information about:

| Element | Questions |
|---------|-----------|
| Mission | What does the company do and why? |
| Audience | Who are the primary users/customers? |
| Personality | If the brand were a person, how would they behave? |
| Competitors | Who are the main competitors? How to differentiate? |
| Existing assets | Any logos, colors, or fonts already in use? |

Define 3-5 brand personality traits:
```
Examples: Bold & Confident, Friendly & Approachable, Clean & Minimal,
Technical & Precise, Playful & Creative, Premium & Elegant
```

### Step 2: Define the color system

**Primary palette (1-2 colors):**
```
Primary:     The main brand color (used for CTAs, links, key UI elements)
Secondary:   Supporting color (used for accents and secondary actions)
```

**Neutral palette:**
```
Gray-950:    Headings, primary text
Gray-700:    Body text
Gray-500:    Secondary text, placeholders
Gray-300:    Borders, dividers
Gray-100:    Backgrounds, hover states
White:       Cards, content areas
```

**Semantic palette:**
```
Success:     Green for confirmations, positive states
Warning:     Amber/yellow for cautions and alerts
Error:       Red for errors and destructive actions
Info:        Blue for informational messages
```

**Color usage rules:**
- Document exact hex, RGB, and HSL values
- Specify minimum contrast ratios (WCAG AA: 4.5:1 for text)
- Show approved color combinations and forbidden pairings
- Define tint/shade variants (100-900 scale) for each brand color

### Step 3: Define typography

```markdown
## Font Families

**Headings:** [Font name] — Bold, confident, used for all headlines
**Body:** [Font name] — Clean, readable, used for paragraphs and UI text
**Code/Mono:** [Font name] — Used for code snippets and technical content

## Type Scale

| Name | Size | Weight | Line Height | Use |
|------|------|--------|-------------|-----|
| Display | 48-64px | Bold | 1.1 | Hero headlines |
| H1 | 36px | Bold | 1.2 | Page titles |
| H2 | 28px | Semibold | 1.3 | Section headers |
| H3 | 22px | Semibold | 1.3 | Subsection headers |
| H4 | 18px | Medium | 1.4 | Card titles |
| Body Large | 18px | Regular | 1.6 | Lead paragraphs |
| Body | 16px | Regular | 1.6 | Default text |
| Body Small | 14px | Regular | 1.5 | Secondary text |
| Caption | 12px | Medium | 1.4 | Labels, metadata |
```

### Step 4: Define logo usage

```markdown
## Logo Variants
- Full logo (icon + wordmark): Primary use
- Icon only: Favicons, app icons, small spaces
- Wordmark only: When icon context is clear

## Clear Space
- Minimum padding around logo: equal to the height of the logo icon
- Never crowd the logo with other elements

## Incorrect Usage (document these explicitly)
- Do not stretch or distort
- Do not change colors outside approved palette
- Do not add effects (shadows, gradients, outlines)
- Do not place on busy backgrounds without contrast
- Do not rotate or flip
```

### Step 5: Define voice and tone

```markdown
## Brand Voice (consistent across all content)
- [Trait 1]: We are [description]. Example: "We are direct. We say
  what we mean without jargon or filler."
- [Trait 2]: We are [description].
- [Trait 3]: We are [description].

## Tone Variations (adapts to context)
| Context | Tone | Example |
|---------|------|---------|
| Marketing | Confident, inspiring | "Build something remarkable." |
| Documentation | Clear, helpful | "To get started, install the CLI." |
| Error messages | Empathetic, actionable | "That didn't work. Try again." |
| Social media | Casual, engaging | "New feature just dropped." |

## Writing Rules
- Use active voice
- Keep sentences under 25 words
- Avoid jargon unless audience is technical
- Use contractions (we're, it's, you'll)
- Capitalize only proper nouns and sentence starts
```

### Step 6: Compile the guide

Organize the complete guide with these sections:
1. Brand Overview (mission, values, personality)
2. Logo (variants, clear space, usage rules)
3. Color Palette (primary, neutral, semantic, usage)
4. Typography (fonts, scale, pairing rules)
5. Voice & Tone (personality, writing rules, examples)
6. Imagery (photography style, illustration style, iconography)
7. Components (buttons, cards, forms — if applicable)
8. Do's and Don'ts (visual examples of correct and incorrect usage)

## Examples

### Example 1: Startup brand guidelines

**User request:** "Create brand guidelines for a fintech startup called Ledger"

**Output structure:**
```markdown
# Ledger Brand Guidelines

## Brand Personality
Professional, trustworthy, modern. We make finance feel simple.

## Colors
- Primary: Deep Navy (#1a2744) — Trust, stability
- Accent: Emerald (#10b981) — Growth, success
- Neutrals: Slate scale for text and UI

## Typography
- Headings: Inter (Bold/Semibold)
- Body: Inter (Regular/Medium)
- Monospace: JetBrains Mono (for numbers and data)

## Voice
Clear and confident. We explain complex finance in simple terms.
Never condescending. Never use unnecessary jargon.

## Logo
[Usage rules, clear space, variants]

## Do's and Don'ts
Do: Use plenty of whitespace, let data breathe
Don't: Use flashy gradients or animations on financial data
```

### Example 2: Rebrand color system

**User request:** "Help me define a color palette for our developer tool brand"

**Output:**
```markdown
## Color Palette

### Primary
- Brand Blue: #3b82f6 (rgb 59, 130, 246)
  - Use for: CTAs, links, active states, primary buttons
  - Tints: #dbeafe (bg), #93c5fd (hover), #2563eb (pressed)

### Neutrals (Zinc scale)
- zinc-950: #09090b — Primary headings
- zinc-800: #27272a — Body text
- zinc-500: #71717a — Secondary text
- zinc-300: #d4d4d8 — Borders
- zinc-100: #f4f4f5 — Subtle backgrounds
- white: #ffffff — Card backgrounds

### Semantic
- Success: #22c55e (green-500)
- Warning: #f59e0b (amber-500)
- Error: #ef4444 (red-500)
- Info: #3b82f6 (blue-500)

### Accessibility
All text colors meet WCAG AA contrast ratios:
- zinc-950 on white: 18.4:1 (AAA)
- zinc-800 on white: 12.6:1 (AAA)
- zinc-500 on white: 4.6:1 (AA)
- white on blue-500: 4.7:1 (AA)
```

## Guidelines

- Brand guidelines are useless if nobody follows them. Keep them concise, visual, and easy to reference.
- Always include do's and don'ts with visual examples. Abstract rules are ignored; concrete examples are followed.
- Provide exact values (hex codes, pixel sizes, font weights). "Use a nice blue" is not a guideline.
- Test the color palette for accessibility before finalizing. Beautiful colors that fail contrast checks are not usable.
- Include dark mode variants if the product supports it. Do not assume light mode only.
- Update the guide as the brand evolves. Outdated guidelines are worse than none because they create confusion.
- Distribute the guidelines where people work. A PDF nobody opens is not useful. A Figma file or living document is.
- Less is more. A 5-page guide that people actually read beats a 50-page guide that collects dust.
