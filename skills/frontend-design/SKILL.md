---
name: frontend-design
description: >-
  Expert frontend design guidelines for creating beautiful, modern UIs.
  Use when a user asks to design a landing page, create a dashboard layout,
  build a modern UI, style a web application, design a hero section,
  create a responsive layout, or implement frontend design patterns.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["frontend", "ui-design", "landing-pages", "dashboards", "css"]
  use-cases:
    - "Design and implement modern landing pages with hero sections and CTAs"
    - "Create dashboard layouts with data visualization and navigation"
    - "Build responsive, accessible UI components with clean styling"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Frontend Design

## Overview

Expert guidance for designing and implementing beautiful, modern frontend interfaces. Covers landing pages, dashboards, web applications, and component design. Focuses on visual hierarchy, spacing, typography, color, and responsive layout using modern CSS and frameworks like Tailwind CSS.

## Instructions

When a user asks you to design or build a frontend UI, follow these steps:

### Step 1: Identify the page type and purpose

| Page Type | Primary Goal | Key Elements |
|-----------|-------------|--------------|
| Landing page | Convert visitors | Hero, benefits, social proof, CTA |
| Dashboard | Display data | Nav, cards, charts, tables, filters |
| Settings/Form | Collect input | Form groups, validation, save states |
| Content page | Inform | Typography, media, readability |
| App shell | Navigate | Sidebar, header, content area, breadcrumbs |

### Step 2: Establish the design system basics

Before writing any code, define:

**Spacing scale (use consistent multiples):**
```
4px  — tight (icon padding)
8px  — compact (between related elements)
16px — default (between components)
24px — comfortable (between sections)
32px — spacious (major section gaps)
48px — generous (page section padding)
64px — dramatic (hero/section separation)
```

**Typography scale:**
```
text-xs:  12px — captions, labels
text-sm:  14px — secondary text, metadata
text-base: 16px — body text
text-lg:  18px — lead paragraphs
text-xl:  20px — card titles
text-2xl: 24px — section headings
text-3xl: 30px — page headings
text-4xl: 36px — hero subheading
text-5xl: 48px — hero heading
```

**Color strategy:**
- One primary accent color for CTAs and interactive elements
- Neutral gray scale for text, borders, and backgrounds
- Semantic colors: green (success), red (error), yellow (warning), blue (info)
- Limit to 3-4 colors max. Constraint creates cohesion.

### Step 3: Build the layout structure

**Landing page pattern:**
```
[Nav - logo, links, CTA button]
[Hero - headline, subhead, CTA, visual]
[Logos/Social proof bar]
[Features - 3-4 cards or alternating sections]
[Testimonials or case study]
[Pricing or comparison table]
[FAQ - accordion]
[Final CTA - headline + button]
[Footer - links, legal, social]
```

**Dashboard pattern:**
```
[Sidebar - logo, nav items, user menu]
[Header - page title, breadcrumb, actions]
[Stats row - 3-4 metric cards]
[Main content - table/chart/list]
[Secondary content - activity feed, recent items]
```

### Step 4: Apply visual design principles

**Hierarchy:** Make the most important element the largest and most prominent. Use size, weight, and color to guide the eye.

**Whitespace:** When in doubt, add more space. Crowded UIs feel cheap. Generous spacing feels premium.

**Contrast:** Text on backgrounds must meet WCAG AA contrast ratios (4.5:1 for body text, 3:1 for large text).

**Consistency:** Same padding, same border radius, same shadow depth everywhere. Inconsistency is the fastest way to make a UI look unpolished.

**Alignment:** Everything should align to a grid. Random offsets break visual flow.

### Step 5: Write clean, maintainable code

Use Tailwind CSS or well-organized CSS with these patterns:

```jsx
{/* Card component with proper spacing and hierarchy */}
<div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm
                hover:shadow-md transition-shadow">
  <div className="flex items-center gap-3 mb-4">
    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center
                    justify-center text-blue-600">
      <Icon />
    </div>
    <h3 className="text-lg font-semibold text-gray-900">Card Title</h3>
  </div>
  <p className="text-sm text-gray-600 leading-relaxed">
    Description text with comfortable line height for readability.
  </p>
</div>
```

## Examples

### Example 1: Hero section for a SaaS landing page

**User request:** "Design a hero section for a developer tool"

**Output:**
```jsx
<section className="relative overflow-hidden bg-gray-950 px-6 py-24 sm:py-32">
  {/* Subtle gradient background */}
  <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10
                  to-transparent" />

  <div className="relative mx-auto max-w-4xl text-center">
    {/* Badge */}
    <div className="mb-6 inline-flex items-center gap-2 rounded-full
                    border border-blue-500/20 bg-blue-500/10 px-4 py-1.5
                    text-sm text-blue-400">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
      Now in public beta
    </div>

    {/* Headline */}
    <h1 className="text-4xl font-bold tracking-tight text-white
                   sm:text-6xl">
      Ship code faster with
      <span className="text-blue-400"> AI-powered reviews</span>
    </h1>

    {/* Subhead */}
    <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-400">
      Automated code review that catches bugs, security issues, and
      style problems before they reach production.
    </p>

    {/* CTA buttons */}
    <div className="mt-10 flex items-center justify-center gap-4">
      <a href="#" className="rounded-lg bg-blue-600 px-6 py-3 text-sm
                             font-semibold text-white hover:bg-blue-500
                             transition-colors">
        Start free trial
      </a>
      <a href="#" className="rounded-lg border border-gray-700 px-6 py-3
                             text-sm font-semibold text-gray-300
                             hover:border-gray-600 transition-colors">
        View demo
      </a>
    </div>
  </div>
</section>
```

### Example 2: Dashboard stats row

**User request:** "Design a metrics card row for a dashboard"

**Output:**
```jsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {stats.map((stat) => (
    <div key={stat.name} className="rounded-xl border border-gray-200
                                     bg-white p-6">
      <p className="text-sm font-medium text-gray-500">{stat.name}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-semibold text-gray-900">
          {stat.value}
        </p>
        <span className={`text-sm font-medium ${
          stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
        }`}>
          {stat.change}
        </span>
      </div>
    </div>
  ))}
</div>
```

## Guidelines

- Mobile first. Design for small screens, then enhance for larger ones.
- Use `rem` and Tailwind spacing classes, never arbitrary pixel values.
- Limit border radius options. Pick 1-2 sizes (e.g., `rounded-lg` and `rounded-full`) and use them consistently.
- Shadows should be subtle. `shadow-sm` for cards, `shadow-md` for dropdowns, `shadow-lg` for modals. Never `shadow-2xl` on a card.
- Animate sparingly. Transitions on hover/focus are fine. Gratuitous motion is distracting.
- Every interactive element needs hover, focus, and active states.
- Test with real content, not lorem ipsum. Real text reveals layout issues.
- Color should communicate meaning, not just decoration. If everything is colored, nothing stands out.
- Use `max-w-` constraints on text blocks. Lines over 75 characters are hard to read.
- Accessibility is not optional. Use semantic HTML, proper heading hierarchy, alt text, and sufficient contrast.
