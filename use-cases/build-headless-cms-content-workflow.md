---
title: "Build a Headless CMS Content Workflow with Payload and Markdown"
slug: build-headless-cms-content-workflow
description: "Set up Payload CMS as a headless content backend and use structured markdown writing to create, manage, and publish content across websites, docs, and newsletters."
skills:
  - payload-cms
  - markdown-writer
category: content
tags:
  - cms
  - headless
  - markdown
  - content-management
  - publishing
---

# Build a Headless CMS Content Workflow with Payload and Markdown

## The Problem

A SaaS company publishes content across four channels: a Next.js marketing site, a documentation portal, a weekly newsletter, and a changelog. Each channel has its own content workflow -- blog posts live in a WordPress instance, docs are in a GitHub repo as raw markdown, the newsletter is composed in Mailchimp's editor, and the changelog is a manually updated JSON file. When the product ships a feature, the marketing team writes the blog post in WordPress, the developer writes docs in VS Code, someone pastes a summary into Mailchimp, and another person updates the changelog JSON. The same feature gets described four times in four places with four different tones, and they inevitably fall out of sync. Last month, the blog post said the feature was "available now" while the docs still referenced it as "coming soon."

## The Solution

Set up **Payload CMS** as a single headless content backend that serves all four channels through its REST and GraphQL APIs, and use the **markdown-writer** skill to produce well-structured markdown content that renders cleanly across every platform. Authors write once in Payload's admin panel with markdown fields, and each channel pulls the content it needs through API queries.

## Step-by-Step Walkthrough

### 1. Configure Payload CMS collections for multi-channel content

Design the content schema so a single piece of content can serve blog posts, docs, newsletter sections, and changelog entries.

> Set up a Payload CMS project with these collections: BlogPosts (title, slug, body as markdown richtext, author, category, publishDate, featured image, SEO metadata), Documentation (title, section, order, body as markdown, version, relatedEndpoints), ChangelogEntries (version, date, type enum of feature/fix/improvement, summary, detailedBody as markdown, relatedBlogPost relation), and NewsletterSections (weekNumber, sectionType enum of feature-highlight/tip/update, body as markdown, callToAction). Add a global Settings collection for site-wide configuration.

### 2. Create content authoring templates

Build markdown templates that enforce consistent structure for each content type so every blog post, doc page, and changelog entry follows the same pattern. Templates eliminate the blank-page problem and ensure every piece of content includes the sections readers expect.

> Create markdown writing templates for our four content types. The blog post template should have frontmatter fields, a hook paragraph, 3-4 sections with H2 headers, code examples in fenced blocks, and a conclusion with CTA. The documentation template should follow a pattern of Overview, Prerequisites, Steps with numbered instructions, Code Examples, and Troubleshooting. The changelog template should be concise: one-sentence summary, what changed, migration steps if any. Write a sample blog post about our new webhook retry feature using the template.

The sample blog post serves as the definitive example for the team: it shows exactly how much detail to include, how code examples should be formatted, and what tone the writing should take.

### 3. Set up API endpoints for each channel

Configure Payload's API layer so each frontend can query exactly the content it needs without over-fetching. Each channel has different data requirements, so the API should provide tailored responses rather than returning the entire content object every time.

> Configure Payload API access for our four channels. The Next.js marketing site needs a REST endpoint that returns published blog posts with rendered markdown, SEO metadata, and related posts. The docs portal needs documentation entries filtered by section and sorted by order. The newsletter builder needs this week's sections grouped by type. The changelog page needs entries sorted by version with pagination. Add API key authentication for each channel and rate limiting at 100 requests per minute.

Payload's built-in REST and GraphQL APIs handle this natively with field-level access control, so each API key only exposes the fields that channel needs.

### 4. Build a content publishing workflow

Create a review and publishing pipeline with draft, review, and published states so content goes through approval before reaching any channel. The workflow prevents premature publishing -- no more "oops, that blog post went live before the feature actually shipped" incidents.

> Add a publishing workflow to Payload CMS. Content starts in draft status, moves to review when the author marks it ready, and a designated reviewer approves or returns it with comments. When approved, the status changes to published and the content becomes available through the API. Add a scheduled publishing feature so blog posts and changelog entries can be queued to go live at a specific date and time. Include a webhook that notifies our Slack content channel whenever content moves to published status.

Scheduled publishing is critical for launches: the team can prepare all content pieces days in advance and schedule them to go live simultaneously at the exact moment the feature ships.

### 5. Generate markdown content for a feature launch

Exercise the full workflow by creating all content pieces for a product feature launch through the CMS. This step validates the entire pipeline: content creation, review workflow, API delivery, and cross-channel consistency.

> We are launching a new API rate limiting feature next Tuesday. Create all content pieces in Payload CMS: a blog post explaining the feature with code examples showing the rate limit headers and retry logic, a documentation page covering configuration options and response codes, a changelog entry with the version bump and migration notes, and a newsletter section highlighting the feature with a link to the full blog post. All four pieces should reference the same code examples and use consistent terminology.

## Real-World Example

The SaaS company migrated from their fragmented content setup over two weeks. The first week, the engineering lead deployed Payload CMS on their existing infrastructure and configured the four collections with the proper field types, access controls, and API endpoints. The second week, the content team migrated 45 blog posts, 120 documentation pages, and 8 months of changelog entries into Payload using a bulk import script.

The first feature launch using the new workflow -- an API versioning update -- took 3 hours of writing to produce all four content pieces compared to the previous 12 hours across four platforms. The markdown writer templates enforced consistency: every blog post had code examples, every doc page had a troubleshooting section, and the changelog followed a predictable format. When the marketing lead wrote the blog post, the same code examples appeared verbatim in the documentation and the changelog referenced the same version number -- no more discrepancies between channels.

The newsletter team stopped copy-pasting between tools entirely -- they pulled the week's content sections directly from Payload's API and fed them into their email renderer. Content sync issues between channels dropped to zero, and the scheduled publishing feature meant the team could prepare a launch's content days in advance and have it go live simultaneously across all four channels at a precise time.
