---
title: "Redesign a SaaS User Experience from Audit to Implementation"
slug: redesign-saas-user-experience
description: "Conduct a UX audit, define improved user flows, and produce detailed interaction specifications to transform a confusing SaaS product into an intuitive experience."
skills:
  - ui-ux-pro-max
  - frontend-design
category: design
tags:
  - ux-audit
  - user-experience
  - interaction-design
  - saas
  - usability
---

# Redesign a SaaS User Experience from Audit to Implementation

## The Problem

A project management SaaS has strong features but poor usability. In the team's own analytics, 62% of new users abandon onboarding. The settings page has 47 options on a single screen with no grouping. Creating a new project requires 9 clicks across 4 different pages. The navigation sidebar has 14 top-level items, 8 of which most users never touch. Customer support tickets are dominated by "how do I do X" questions for basic tasks. The product team knows the UX needs an overhaul, but they have no structured process for auditing the current experience, prioritizing improvements, or specifying the redesigned interactions in enough detail for developers to implement correctly. Past redesign attempts produced vague Figma mockups that left developers guessing about hover states, error handling, and keyboard navigation.

## The Solution

Use the **ui-ux-pro-max** skill to conduct a systematic UX audit, map user flows, identify friction points, and produce interaction specifications with exact behavior for every screen and state. When the UI UX Pro Max pack is installed, its search script (`--domain ux`, `--stack`) supplies pattern guidance for the stack you build on. Use the **frontend-design** skill to translate those specs into implementable component layouts with responsive behavior, spacing, and visual hierarchy that developers can build directly from. The audit provides the diagnosis; the specifications provide the prescription.

## Step-by-Step Walkthrough

### 1. Conduct a heuristic UX audit

Evaluate every major screen in the product against established usability heuristics, documenting specific violations and their severity. A structured audit replaces subjective opinions with evidence-based findings that the team can prioritize objectively.

> Conduct a heuristic evaluation of our project management app across these 8 screens: dashboard, project list, project detail, task board, task detail, settings, team members, and reporting. Evaluate each against [Nielsen's 10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/). For each violation found, document: the heuristic violated, severity rating (cosmetic, minor, major, critical), a screenshot reference, the current behavior, and the expected behavior. Prioritize findings by a combined score of severity times frequency of user encounter.

Severity and frequency are your own scoring choices layered on the heuristics (Nielsen's list defines the heuristics, not a scoring scheme), and they are only as good as the frequency data you give the agent: paste in page-view counts from your analytics. The scoring prevents the team from fixating on cosmetic issues while critical flows remain broken. A minor issue on the most-used screen may rank higher than a major issue on a screen visited once per month.

### 2. Map and simplify critical user flows

Trace the most important user journeys, identify unnecessary steps, and design streamlined alternatives. The goal is to reduce the number of clicks, page loads, and decision points for each critical task.

> Map the current user flow for these 5 critical tasks: create a new project, assign a task to a team member, view project progress, invite a new team member, and change notification settings. For each flow, document every click, page load, and decision point. Then design a simplified flow that reduces each task to the minimum viable steps. Our create-project flow currently takes 9 clicks across 4 pages -- the target should be completable in a single modal with 3 steps maximum. Show the current versus proposed flow side by side with step counts.

Count the steps yourself by walking the real flow before trusting the agent's "current" column; the side-by-side comparison only persuades stakeholders if the current numbers are accurate.

### 3. Redesign the navigation architecture

Restructure the 14-item sidebar into a logical hierarchy that surfaces common actions and hides advanced features. A 14-item sidebar means users scan past 10 items they do not need every time they look for the 4 they use daily.

> Redesign the navigation architecture. The current sidebar has: Dashboard, Projects, My Tasks, Team, Calendar, Reports, Files, Messages, Time Tracking, Integrations, Templates, Settings, Help, What's New. Group these into a primary tier (the 4-5 items used daily by most users) and a secondary tier (everything else accessible through a more menu or sub-navigation). Add contextual navigation within project pages so project-specific features (task board, files, settings) appear as tabs rather than sidebar items. Design the mobile navigation as a bottom tab bar with the primary tier items (a bottom bar suits 3 to 5 destinations, so keep the primary tier within that).

Contextual navigation within project pages is the key structural change: it reduces the global sidebar to workspace-level navigation and moves project-level navigation inside the project, eliminating the confusion of "am I looking at all projects or this specific project."

### 4. Specify the redesigned settings experience

Transform the 47-option settings page into a grouped, searchable settings experience with clear descriptions. Settings pages are where users go to solve a specific problem -- they need to find the right option quickly, not scroll through everything.

> Redesign the settings page. Group the 47 current options into logical categories: Profile (name, avatar, timezone), Notifications (email, in-app, mobile push -- each with per-event toggles), Workspace (default project view, theme, language), Integrations (connected services with individual auth management), and Billing (plan, payment method, invoices). Each category is a separate page within settings, navigable by a left sidebar. Add a search bar at the top that filters settings by keyword. Every setting has a descriptive label, a help text sentence, and shows its current value before the user clicks to edit. Destructive settings (delete account, leave workspace) are isolated at the bottom with confirmation gates.

### 5. Produce implementation-ready interaction specifications

Document every interaction detail so developers can build the redesigned screens without ambiguity. The specification should be so detailed that a developer who has never seen the product can implement the feature correctly on the first attempt.

> Write interaction specifications for the new project creation modal. The modal opens from a prominent "New Project" button in the header. Step 1: project name field (auto-focused, 60 character limit, checks uniqueness on blur and again on submit, with the server enforcing it, and shows the result in a polite live region), template selector (grid of 6 templates with preview thumbnails, or blank project). Step 2: invite team members (typeahead search of workspace members, selected members shown as chips, skip button for solo projects). Step 3: confirm and create (summary of selections, create button that shows loading spinner, redirects to the new project board on success). The modal is closeable via X button, Escape key, and clicking the overlay. Unsaved input triggers a "discard changes?" confirmation. Build it on the native `<dialog>` element opened with `showModal()` (it traps focus, makes the page behind inert and closes on Escape; intercept the `cancel` event to show the discard confirmation, and close on overlay clicks yourself, since `<dialog>` does not do that natively), return focus to the "New Project" button on close, and respect `prefers-reduced-motion` for transitions. Document the exact transition animations, error states, and keyboard navigation order.

## Real-World Example

The example team ran the heuristic audit over two days and documented 34 usability violations across the 8 core screens; 14 were rated major or critical, including the 9-click project creation flow and the unsearchable 47-option settings page. The audit gave them a prioritized backlog instead of a vague sense that "the UX needs work."

The simplified navigation went from 14 items to 5 primary and 9 secondary. The project creation modal replaced 9 clicks across 4 pages with 3 steps, and the interaction specification was detailed enough that the frontend developer built it without needing clarifications, because every state, animation and keyboard interaction was written down. After the grouped, searchable settings shipped, the team tracked "how do I change my notifications" tickets and onboarding abandonment against the 62% baseline. These outcomes are this team's own measurements; yours will differ, so set the baseline before the rollout and measure the same way afterwards. For usability testing, small rounds of about five participants find most problems per round ([Nielsen Norman Group](https://www.nngroup.com/articles/how-many-test-users/)), so test, fix, and test again rather than running one large study.

## Related Skills

- [ui-ux-pro-max](../skills/ui-ux-pro-max/SKILL.md) -- UX audit, flow mapping, design-system and pattern search
- [frontend-design](../skills/frontend-design/SKILL.md) -- implementable component layouts, spacing, accessibility
