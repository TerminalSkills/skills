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
  author: carlos
  version: "1.0.0"
  category: development
  tags: ["accessibility", "wcag", "a11y", "compliance", "screen-reader"]
---

# Accessibility Auditor

## Overview

Audits web pages and UI components against WCAG 2.2 (Level AA) success criteria. Identifies violations in color contrast, keyboard navigation, ARIA usage, semantic HTML, form labeling, focus management, and dynamic content updates. Produces actionable fixes with exact code changes.

## Instructions

When asked to audit accessibility:

1. **Determine the scope:**
   - Single component, full page, or entire application?
   - Target compliance level: A, AA (default), or AAA?
   - Any specific regulations: EAA (European Accessibility Act), ADA, Section 508?

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
   - Large text (18px+ or 14px+ bold): minimum 3:1
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

6. **Check ARIA usage (WCAG 4.1.2):**
   - ARIA roles match element behavior
   - Required ARIA attributes present (e.g., `aria-expanded` on toggles)
   - `aria-live` regions for dynamic content updates
   - No redundant ARIA (e.g., `role="button"` on `<button>`)
   - `aria-label`/`aria-labelledby` on elements without visible text

7. **Check forms (WCAG 1.3.5, 3.3.1, 3.3.2):**
   - All inputs have associated `<label>` elements (not just placeholder text)
   - Error messages are programmatically associated with inputs
   - Required fields indicated with more than just color
   - `autocomplete` attributes on common fields (name, email, address)
   - Form validation errors announced to screen readers

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
  Fix: Add role="alert" and aria-live="polite" to announce errors.
       Associate with input: aria-describedby="login-error" on the relevant input.

MAJOR [WCAG 1.4.1] — Error indicated by color alone
  Element: error div with color: red
  Fix: Add an icon (⚠) or prefix "Error:" to the text.

MINOR [WCAG 1.4.3] — Verify error text contrast
  Red (#FF0000) on white (#FFFFFF) = 4.0:1 — fails for normal text.
  Fix: Use #D32F2F (darker red) for 5.9:1 ratio.
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
- Note that automated audits catch ~30% of accessibility issues — recommend manual testing with screen readers for the rest.
- For color contrast, calculate actual ratios — don't eyeball it.
- Flag `tabIndex` values greater than 0 as an anti-pattern (disrupts natural tab order).
