---
title: "Design and Implement a Product Design System"
slug: design-and-implement-product-design-system
description: "Build a complete design system from brand guidelines through UI component specifications, ensuring visual consistency across a SaaS product."
skills:
  - ui-ux-pro-max
  - brand-guidelines
category: design
tags:
  - design-system
  - ui-ux
  - brand
  - components
  - consistency
---

# Design and Implement a Product Design System

## The Problem

A growing SaaS company has 6 frontend developers building features independently. Every developer interprets the brand differently -- buttons come in 4 slightly different shades of blue, spacing varies between 12px and 16px depending on who built the page, and the settings panel uses a completely different card style than the dashboard. There are no documented color tokens, typography scales, or component specifications. The design team creates mockups in Figma, but developers eyeball the implementation, leading to a product that looks like 6 different apps stitched together. Onboarding a new developer means weeks of learning unwritten conventions by reading existing code. Every code review includes at least one comment about inconsistent spacing or wrong button styles.

## The Solution

Use the **brand-guidelines** skill to write down the visual identity (colors, typography, spacing, voice) as exact values, turn those values into CSS custom properties with a contrast check that runs in CI, then use the **ui-ux-pro-max** skill to look up interaction and accessibility rules and write the component specifications. Brand guidelines define how things look; the component specifications define how they behave.

## Step-by-Step Walkthrough

### 1. Audit the current UI for inconsistencies

Catalog every visual inconsistency across the product to understand the scope of the problem and prioritize which components need standardization first. The audit creates a shared awareness that the problem is systemic, not just a few mismatched buttons.

> Audit our SaaS dashboard for visual inconsistencies. Compare button styles, colors, border radii, and font sizes across the 8 main pages: dashboard, settings, billing, team management, API keys, analytics, notifications, and onboarding. Document every variation of primary buttons, secondary buttons, form inputs, cards, modals, and navigation elements. Create a spreadsheet showing which pages use which variants so we can see the full scope of inconsistency.

The audit typically reveals that inconsistencies cluster around components built by different developers at different times. This data helps prioritize: standardize the components that appear most frequently first.

### 2. Define brand guidelines and design tokens

Establish the foundational brand system: color palette, typography scale, spacing units, and visual principles that every component will inherit.

> Use brand-guidelines. Create brand guidelines for our product. Define a primary color palette (primary blue, success green, warning amber, error red, and 5 neutral grays) with exact hex values, and give the contrast ratio of every text/background pair that will be used, checked against WCAG 2.x AA (4.5:1 for body text, 3:1 for large text and UI boundaries), for both the light and the dark theme. Establish a type scale using Inter as the primary font: 6 heading sizes and 3 body sizes with specific line heights and letter spacing. Define an 8px spacing system with named tokens (xs through 3xl). Document our visual principles: clean over decorative, information-dense but not cluttered, consistent border-radius of 8px for containers and 6px for inputs.

Then make the values machine-readable so nobody retypes a hex from memory. Put them in one `tokens.css` and check the pairs in CI:

```css
:root {
  --color-primary: #2563eb;
  --color-on-primary: #ffffff;
  --color-error: #dc2626;
  --color-text: #1e293b;
  --color-text-muted: #475569;
  --color-bg: #ffffff;
  --space-sm: 8px;
  --space-md: 16px;
  --radius-container: 8px;
  --radius-input: 6px;
}
```

```python
# check_contrast.py: exit 1 when a text/background pair falls below WCAG 2.x AA (4.5:1)
import re, sys

PAIRS = [("--color-on-primary", "--color-primary"), ("--color-text", "--color-bg"),
         ("--color-text-muted", "--color-bg"), ("--color-error", "--color-bg")]

def channel(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def luminance(h):
    r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

def ratio(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)

tokens = dict(re.findall(r"(--[\w-]+):\s*(#[0-9a-fA-F]{6})", open(sys.argv[1]).read()))
failed = False
for fg, bg in PAIRS:
    r = ratio(tokens[fg], tokens[bg])
    failed |= r < 4.5
    print(f"{'ok  ' if r >= 4.5 else 'FAIL'} {fg} on {bg}: {r:.2f}:1")
sys.exit(1 if failed else 0)
```

```console
$ python3 check_contrast.py tokens.css
ok   --color-on-primary on --color-primary: 5.17:1
ok   --color-text on --color-bg: 14.63:1
ok   --color-text-muted on --color-bg: 7.58:1
ok   --color-error on --color-bg: 4.83:1
```

White on `#3b82f6` (blue-500) is only 3.7:1, so a lighter blue like that can fill icons but not carry white button text. Re-run the check whenever a token changes, and add the dark-theme token set to the same script.

If you have no brand yet, the UI UX Pro Max pack can propose a starting palette, type pairing and style from a product description. It is a local Python script, installed into the project with `npx ui-ux-pro-max-cli init --ai claude` (this copies seven skills into `.claude/skills/`, so confirm with the team first):

```console
$ python3 .claude/skills/ui-ux-pro-max/scripts/search.py "B2B SaaS analytics dashboard" --design-system -p "Acme Console" -f markdown
```

It prints a style, a color table with CSS variable names, and a font pairing. Treat the output as a draft: check every pair with the contrast script before adopting it.

### 3. Specify core UI components

Design the specification for every core component with exact dimensions, states, interaction behavior, and accessibility requirements. Each specification should be detailed enough that a developer can implement the component without asking a single follow-up question.

> Create detailed UI/UX specifications for our core components based on the brand guidelines. For each component (button, input, select, checkbox, radio, toggle, card, modal, toast, tooltip, badge, avatar, table, pagination, tabs, breadcrumbs), specify: default dimensions and padding, all visual states (default, hover, active, focused, disabled, loading), keyboard interaction behavior, ARIA attributes and screen reader announcements, responsive behavior at mobile and tablet breakpoints, and dark mode color mappings. Start with buttons and inputs since they appear on every page. Use ui-ux-pro-max for the rules behind each spec: `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "form validation error message" --domain ux -n 2` returns do/don't guidance (for example, a focusable error summary that links to each invalid field).

### 4. Design complex component patterns

Specify higher-level patterns like forms, data tables, navigation, and empty states that combine multiple core components. These patterns are where most usability problems occur because they involve multiple components interacting together.

> Design specifications for our complex UI patterns. The data table pattern: sortable columns with visual indicators, row selection with bulk actions toolbar, inline editing, pagination with page size selector, empty state, loading skeleton, and filter bar. The form pattern: field layout rules (when to stack versus inline), validation display timing (on blur versus on submit), error message positioning, required field indicators, and form section grouping with progressive disclosure. The navigation pattern: sidebar with collapsible sections, breadcrumb generation rules, mobile drawer behavior, and active state indication.

Each pattern specification includes an error state and an empty state. These are the states developers most often forget to implement, and they are the states users encounter during the most frustrating moments of their experience.

### 5. Create a component usage guide with do and do-not examples

Document how to use each component correctly with concrete examples of proper and improper usage to prevent future drift. The usage guide answers the "when" and "why" questions that the component specs do not cover.

> Write a component usage guide for the development team. For buttons: when to use primary versus secondary versus ghost variants, maximum of one primary button per visible area, never use buttons for navigation (use links instead), and icon-only buttons must have aria-label. For modals: maximum content height with scroll behavior, always include a close mechanism (X button and Escape key), destructive actions require explicit confirmation with a typed confirmation input for irreversible operations. For toasts: auto-dismiss after 5 seconds for success, persistent until dismissed for errors, stack from bottom-right with 8px gap, maximum 3 visible simultaneously. Include visual do/don't comparison examples for each rule.

## Real-World Example

A design lead and a senior frontend developer spent a few weeks on the system. The audit found the same button styled many ways; the "four blues" came from developers typing hex values from memory and one sampling a compressed screenshot. Once the palette and spacing lived in `tokens.css`, the "which blue?" review comments disappeared and the contrast check blocked pairs that failed AA. New pages were built from the component specs, with states, keyboard behavior and ARIA attributes already written down, and the design team began referring to components by name in briefs instead of drawing standard pages pixel by pixel.

## Related Skills

- [brand-guidelines](../skills/brand-guidelines/) -- exact colors, type scale, spacing and voice as a shareable style guide
- [ui-ux-pro-max](../skills/ui-ux-pro-max/) -- searchable UX rules, palettes and a design-system generator
