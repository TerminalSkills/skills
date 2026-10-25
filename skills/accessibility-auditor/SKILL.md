---
name: accessibility-auditor
description: >-
  Audit web pages and components for WCAG 2.2 accessibility compliance. Use when
  a user asks to check accessibility, find a11y issues, audit for WCAG compliance,
  fix screen reader problems, check color contrast, ensure keyboard navigation works,
  or prepare for accessibility regulations like the European Accessibility Act or ADA.
license: Apache-2.0
compatibility: "Works with any HTML/JSX/Vue/Svelte component code. Framework-agnostic."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/dequelabs/axe-core
  tags: "accessibility, wcag, a11y, compliance, screen-reader"
---

# Accessibility Auditor

## Overview

Audits web pages and UI components against WCAG 2.2 (Level AA) success criteria. Identifies violations in color contrast, keyboard navigation, ARIA usage, semantic HTML, form labeling, focus management, and dynamic content updates. Produces actionable fixes with exact code changes.

## Instructions

When asked to audit accessibility:

1. **Determine the scope:**
   - Single component, full page, or entire application?
   - Target compliance level: A, AA (default), or AAA?
   - Any specific regulations: EAA (European Accessibility Act, in force since 28 June 2025, points to EN 301 549 which is based on WCAG 2.1 AA), ADA (US DOJ Title II rule for public bodies names WCAG 2.1 AA), Section 508? WCAG 2.2 is a superset, so auditing against it covers them.
   - If the app runs, start with an automated pass (axe-core via `@axe-core/cli`, Lighthouse, or `pa11y`) and then review by hand what tools cannot judge.

2. **Check semantic structure (WCAG 1.3.1, 1.3.2):**
   - Heading hierarchy: h1 → h2 → h3, no skipped levels
   - Landmark regions: `<nav>`, `<main>`, `<header>`, `<footer>`, `<aside>`
   - Lists use `<ul>`/`<ol>`/`<dl>`, not styled `<div>`s
   - Tables have `<th>` with `scope`, and `<caption>` where appropriate
   - Reading order matches visual order

3. **Check text alternatives (WCAG 1.1.1):**
   - All `<img>` have meaningful `alt` text (not "image", "photo", or filename)
   - Decorative images use `alt=""` or `role="presentation"`
   - SVG icons have `<title>` or `aria-label`
   - Complex images (charts, diagrams) have extended descriptions
   - Video/audio have captions and transcripts

4. **Check color and contrast (WCAG 1.4.3, 1.4.11):**
   - Normal text: minimum 4.5:1 contrast ratio
   - Large text (18pt / 24px or larger, or 14pt / about 18.66px bold): minimum 3:1
   - UI components and graphical objects: minimum 3:1
   - Information not conveyed by color alone (WCAG 1.4.1)
   - Compute exact contrast ratios for flagged elements

5. **Check keyboard accessibility (WCAG 2.1.1, 2.1.2, 2.4.7):**
   - All interactive elements reachable via Tab key
   - No keyboard traps (user can always Tab away)
   - Focus indicators visible (not `outline: none` without replacement)
   - Custom components have appropriate keyboard handlers (Enter, Space, Arrow keys)
   - Modal dialogs trap and restore focus correctly
   - Skip-to-content link present
   - Focus not hidden behind sticky headers or cookie banners (WCAG 2.4.11, new in 2.2)
   - Every drag interaction has a click/tap alternative (WCAG 2.5.7, new in 2.2)
   - Pointer targets at least 24x24 CSS px or sufficiently spaced (WCAG 2.5.8, new in 2.2)

6. **Check ARIA usage (WCAG 4.1.2):**
   - ARIA roles match element behavior
   - Required ARIA attributes present (e.g., `aria-expanded` on toggles)
   - `aria-live` regions for dynamic content updates
   - No redundant ARIA (e.g., `role="button"` on `<button>`)
   - `aria-label`/`aria-labelledby` on elements without visible text

7. **Check forms (WCAG 1.3.5, 3.3.1, 3.3.2, 3.3.7, 3.3.8):**
   - All inputs have associated `<label>` elements (not just placeholder text)
   - Error messages are programmatically associated with inputs
   - Required fields indicated with more than just color
   - `autocomplete` attributes on common fields (name, email, address)
   - Form validation errors announced to screen readers
   - Data already entered is not requested again in the same flow (3.3.7)
   - Login does not require a cognitive test: allow paste and password managers (3.3.8)
   - Help links appear in the same place across pages (3.2.6)

8. **Output format for each violation:**
   - WCAG criterion number and name
   - Severity: Critical / Major / Minor
   - Element and location (file:line or CSS selector)
   - What's wrong (specific, not generic)
   - Exact code fix
   - Who is affected (screen reader users, keyboard users, low vision, etc.)

## Examples

### Example 1: Component audit

**Input:**
```
Audit this React login form for accessibility:
<form onSubmit={handleLogin}>
  <input type="email" placeholder="Email" value={email} onChange={setEmail} />
  <input type="password" placeholder="Password" value={pw} onChange={setPw} />
  <div className="error" style={{color: 'red'}}>{error}</div>
  <div className="submit-btn" onClick={handleLogin}>Log In</div>
</form>
```

**Output:**
```
Accessibility Audit: Login Form
=================================
6 violations found (3 Critical, 2 Major, 1 Minor)

CRITICAL [WCAG 1.3.5] — Missing autocomplete attributes
  Elements: email input, password input
  Fix: Add autocomplete="email" and autocomplete="current-password"
  Affected: Users relying on autofill, password managers, and assistive tech

CRITICAL [WCAG 3.3.2] — Inputs have no accessible labels
  Elements: both <input> fields
  Problem: Placeholder text disappears on focus and is not a label.
  Fix: Add <label htmlFor="email">Email</label> before each input,
       or use aria-label="Email address" as minimum.

CRITICAL [WCAG 2.1.1] — Submit button is not keyboard accessible
  Element: <div className="submit-btn">
  Problem: <div> is not focusable and onClick doesn't fire on Enter key.
  Fix: Replace with <button type="submit">Log In</button>

MAJOR [WCAG 3.3.1] — Error message not associated with input
  Element: <div className="error">
  Fix: Add role="alert" (implicitly assertive live region) to the message, or
       aria-live="polite" if it should not interrupt.
       Associate with input: aria-describedby="login-error" on the relevant input.

MAJOR [WCAG 1.4.1] — Error indicated by color alone
  Element: error div with color: red
  Fix: Add an icon (⚠) or prefix "Error:" to the text.

MINOR [WCAG 1.4.3] — Verify error text contrast
  Red (#FF0000) on white (#FFFFFF) = 4.0:1 — fails for normal text.
  Fix: Use #D32F2F (darker red) for about 5.0:1.
```

### Example 2: Keyboard navigation audit

**Input:**
```
Check keyboard accessibility of our dropdown menu component in src/components/Dropdown.tsx
```

**Output:**
```
Keyboard Audit: Dropdown Component
====================================
3 violations found.

CRITICAL [WCAG 2.1.2] — Keyboard trap in open dropdown
  When dropdown is open, Tab moves focus into the list but pressing Escape
  does nothing. User is trapped.
  Fix: Add onKeyDown handler:
    if (e.key === 'Escape') { setOpen(false); triggerRef.current.focus(); }

MAJOR [WCAG 2.1.1] — Arrow key navigation missing
  Dropdown items are only reachable via Tab. Standard pattern requires
  ArrowDown/ArrowUp to move between options.
  Fix: Add roving tabIndex pattern — active item gets tabIndex={0},
       others get tabIndex={-1}. ArrowDown moves focus to next item.

MAJOR [WCAG 4.1.2] — Missing ARIA attributes
  The trigger button lacks aria-expanded and aria-haspopup.
  Fix: <button aria-expanded={isOpen} aria-haspopup="listbox">
       The list needs role="listbox" and items need role="option".
```

## Guidelines

- Default to WCAG 2.2 Level AA unless the user specifies otherwise.
- Always provide exact code fixes, not just descriptions of the problem.
- Prioritize Critical issues (blocks entire user groups) over Minor (suboptimal experience).
- Test ARIA patterns against established WAI-ARIA Authoring Practices for correctness.
- Note that automated tools such as axe-core find only a part of all issues (Deque reports about 57% by volume; many criteria need human judgement) — recommend manual testing with screen readers for the rest.
- For color contrast, calculate actual ratios — don't eyeball it.
- WCAG 2.2 removed criterion 4.1.1 Parsing; do not report duplicate-id or markup errors under it.
- Prefer native elements (`<button>`, `<dialog>`, `<details>`) over ARIA; no ARIA is better than wrong ARIA.
- A menu-button that opens action items follows the "menu button" pattern (`role="menu"`/`menuitem`); `listbox` is for selecting a value.
- Flag `tabIndex` values greater than 0 as an anti-pattern (disrupts natural tab order).
