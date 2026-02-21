---
title: "Generate Technical Documentation and Architecture Presentations from Code"
slug: create-technical-documentation-and-presentations
description: "Extract documentation from an undocumented codebase and generate presentation slides for architecture reviews and team onboarding."
skills:
  - code-documenter
  - dev-slides
category: development
tags:
  - documentation
  - presentations
  - architecture
  - onboarding
---

# Generate Technical Documentation and Architecture Presentations from Code

## The Problem

Your team inherited a 60,000-line codebase with no documentation. New engineers take 3 weeks to become productive because they have to read code to understand system architecture. The tech lead spends 4 hours every month preparing architecture review slides manually, copying code snippets into Google Slides and drawing diagrams by hand.

When the VP of Engineering asks for a system overview for a board meeting, it takes two days to assemble something presentable from scattered README fragments and Slack messages. Every question a new engineer asks costs 15 minutes of a senior engineer's time. With 5 new hires per quarter, the team loses 60 hours of senior engineering time answering the same architecture questions.

## The Solution

Use the **code-documenter** skill to extract structured documentation directly from the codebase, then use the **dev-slides** skill to transform that documentation into presentation decks for architecture reviews, onboarding sessions, and stakeholder updates.

## Step-by-Step Walkthrough

### 1. Generate module-level documentation from code

Start by documenting the major modules with their responsibilities, dependencies, and public APIs:

> Analyze the src/ directory and generate documentation for each top-level module. Include a one-paragraph overview, the public API surface, dependencies on other modules, and data flow between components. Write it as markdown files in docs/modules/.

The documenter produces 8 module documents covering auth, billing, API gateway, background jobs, notifications, reporting, user management, and the data access layer. Each document includes a dependency graph extracted from import statements and function invocations.

### 2. Create an architecture overview document

Combine the module docs into a single system architecture document:

> Using the module documentation you just generated, create a high-level architecture overview. Include a system context diagram in Mermaid syntax, the request lifecycle from HTTP request to database and back, and a section on cross-cutting concerns like authentication, logging, and error handling.

The resulting document serves as the single source of truth. The Mermaid diagrams render in GitHub without additional tooling. The request lifecycle traces a typical API call through middleware, validation, business logic, data access, and response formatting.

### 3. Generate an onboarding slide deck

Transform the architecture document into a presentation for new engineers:

> Create a slide deck from the architecture overview for new engineer onboarding. Target 15 slides, 20 minutes. Include system context, module overview with the dependency diagram, request lifecycle walkthrough, local development setup, and common debugging workflows. Use a clean dark theme with code snippets.

The deck includes code snippets pulled from documented modules, Mermaid diagrams rendered as images, and speaker notes. The debugging section highlights the 5 most common issues new engineers encounter.

### 4. Generate a stakeholder summary deck

Create a non-technical version for leadership:

> Create a 10-slide executive summary deck from the architecture docs. Replace code snippets with plain-language descriptions. Focus on system capabilities, scalability characteristics, tech debt risks, and infrastructure costs. Include a slide on what would break if traffic doubled.

This deck focuses on business-relevant decisions. The capacity slide shows the database at 70% utilization and API servers able to handle 3x current traffic. Leadership gets planning information without needing to understand the code.

### 5. Set up automated documentation refresh

Keep docs and decks in sync with code changes:

> Create a CI job that regenerates module documentation whenever files in src/ change. Flag any module where the documented public API no longer matches the actual exports. Post a weekly summary of documentation drift to the #engineering Slack channel.

The weekly drift report catches undocumented API changes before they become knowledge gaps. When a developer adds a new endpoint to the billing module, the report flags it as undocumented within a week.

## Real-World Example

An engineering manager at a 40-person company needed to onboard 5 new hires while preparing for an architecture review with the CTO. The codebase had zero documentation, and the previous tech lead had left 6 months earlier.

She ran the code-documenter on Monday morning and had 12 module documents by lunch. Tuesday, she used dev-slides to generate both the onboarding deck and the CTO review deck. The onboarding deck cut ramp-up time from 3 weeks to 8 days. The CTO review, previously requiring two days of preparation, was generated in 20 minutes and needed only minor edits.

The ongoing cost was near zero because both docs and slides could be regenerated whenever the codebase changed significantly.
