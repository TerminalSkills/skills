---
title: "Run Content Operations with Airtable and AI Writers"
slug: run-content-operations-with-airtable-and-writers
description: "Manage a content production pipeline in Airtable with automated drafting, editorial tracking, and publishing workflows for consistent blog and marketing output."
skills:
  - airtable
  - content-writer
category: productivity
tags:
  - content-ops
  - airtable
  - writing
  - editorial
---

# Run Content Operations with Airtable and AI Writers

## The Problem

A B2B SaaS marketing team publishes 8 blog posts per month, plus 4 case studies and 2 whitepapers per quarter. The content calendar lives in a Google Sheet that nobody updates, drafts sit in random Google Docs folders, and the review process happens over Slack threads that get lost.

The content manager cannot answer basic questions: How many posts are in the pipeline? Which ones are blocked on SME review? What topics have they already covered this year? Last month, two writers independently produced articles on the same topic because nobody checked the backlog. The duplicate was only discovered after both articles were fully drafted, wasting $1,200 in freelancer costs.

## The Solution

Use the **airtable** skill to build a structured content operations database through the Airtable Web API (schema, records, queries) with pipeline tracking, and the **content-writer** skill to generate briefs and first drafts, reducing the time from content idea to published article. The agent needs a personal access token with the scopes `schema.bases:write`, `data.records:read` and `data.records:write` for that one base, kept in `$AIRTABLE_TOKEN`.

## Step-by-Step Walkthrough

### 1. Build the content operations base in Airtable

Create the database structure for managing the full content lifecycle. Create the empty base "Content Operations" in the Airtable UI (or let the agent call the create-base endpoint if you give the token access to a workspace), then ask:

> In the base "Content Operations" create these tables through the Airtable API, People first so the other tables can link to it. Content Pipeline: fields for Title (text), Slug (text), Topic Cluster (single select: product-led-growth, developer-experience, data-engineering, security, case-studies), Status (single select: Idea, Brief Ready, Draft In Progress, In Review, Approved, Published), Author (linked to People table), Reviewer (linked to People table), Target Publish Date (date), Actual Publish Date (date), Word Count (number), SEO Keyword (text), Target Audience (single select: developers, engineering-managers, CTOs), and Draft URL (URL). People table: Name, Role, Email, Capacity (number of articles per month). Topic Registry: Topic, Cluster, Times Covered, Last Published Date, Related Keywords. Use the base's `linkedTableId` for the Author and Reviewer link fields.

The Web API can create bases, tables and fields but cannot create views (it can only list, read and delete them). Create the "Editorial Board" view by hand in Airtable: filter Status to Brief Ready, Draft In Progress and In Review, group by Status, sort by Target Publish Date. The agent's queries below do not depend on it.

The Topic Registry table prevents the duplicate article problem. Before assigning a new topic, the content manager checks whether it has been covered before and when, turning an institutional memory problem into a database query.

### 2. Generate content briefs from topic ideas

Turn approved topic ideas into structured briefs that writers can execute:

> For the content pipeline item "Why Feature Flags Reduce Deployment Risk" (topic cluster: developer-experience, target audience: engineering-managers, SEO keyword: "feature flags deployment"), generate a content brief. Include: working title, target word count (1,800), article structure with H2 and H3 headings, key points to cover under each section, 3 competitor articles to reference and differentiate from, a specific angle that makes this article unique (focus on the risk reduction math with real incident cost data), suggested internal links to 2 existing articles, and a CTA aligned with the product's feature flag functionality. Save the brief in the record's Brief field (add a long text field named Brief to Content Pipeline) and set the status to "Brief Ready".

A good brief answers "what makes this article different from the 10 existing articles on this topic?" Without a specific angle, the writer produces generic content that does not rank or convert.

### 3. Draft articles from approved briefs

Generate first drafts based on the content briefs stored in Airtable:

> Pull the content brief for "Why Feature Flags Reduce Deployment Risk" from Airtable and generate a first draft. Follow the brief structure exactly. Treat the incident figures below as placeholders for a real, sourced incident from your own history; do not publish invented numbers. Write for engineering managers who deploy to production 3-5 times per week. Use a practical, evidence-based tone. Include a specific example from the incident write-up in the brief, and show how a feature flag kill switch would have shortened the impact. Include code snippets showing a basic feature flag implementation in TypeScript. Target 1,800 words. Save the draft text in a Draft field (or a link in Draft URL), set the Airtable status to "Draft In Progress" and fill in the word count field.

First drafts should be treated as starting points, not finished products. The writer then spends 1-2 hours adding personal experience, refining the voice, and verifying technical accuracy rather than staring at a blank page.

### 4. Track editorial progress and bottlenecks

Monitor the content pipeline for overdue items and capacity issues:

> Query the Airtable Content Pipeline for the current editorial status (the agent reads records with `filterByFormula` and pages through `offset`; Airtable allows 5 requests per second per base). Show: items in each status bucket with their target publish dates, any items where target publish date is within 5 days and status is still "Draft In Progress" or earlier (at risk of missing deadline), articles that have been "In Review" for more than 3 business days (bottleneck), and author capacity this month (compare assigned articles against each person's monthly capacity in the People table). Flag anyone assigned more articles than their capacity and any article stuck in review without feedback from the SME reviewer.

The bottleneck detection is the most actionable part of the pipeline view. Most content delays come from the review stage, not the writing stage. Making review latency visible puts social pressure on reviewers to respond promptly.

### 5. Generate the monthly content performance report

Compile publishing metrics and pipeline health from Airtable data:

> Generate last month's content report from Airtable. Published last month: list all items with status "Published" and an Actual Publish Date in that month, showing title, author, word count, and topic cluster. Pipeline health: count items in each status, average days from "Brief Ready" to "Published" this month, and number of items that missed their target publish date. Topic coverage: query the Topic Registry to show which clusters have been covered this quarter and which have gaps. Highlight any cluster below its quarterly target (for example "security" with 1 article against a target of 3). Recommend 2 specific topic ideas for the security cluster based on gaps in the Topic Registry.

Monthly reporting reveals patterns that weekly tracking misses. If the "developer-experience" cluster consistently overperforms while "security" underperforms, the team may need a dedicated security-focused writer or SME.

## Real-World Example

The content manager starts December planning by reviewing the Airtable Editorial Board view. The pipeline shows 14 items: 3 published in November, 2 in review, 4 drafts in progress, and 5 ideas awaiting briefs. The bottleneck report flags that the "Observability for Microservices" article has been stuck in SME review for 8 days, so the manager pings the reviewer directly. The capacity check shows that the team can handle 8 articles in December but has 11 scheduled, so 3 get pushed to January.

A first draft for the feature flags article is generated from the brief in minutes instead of the hours a writer usually spends on a first pass. The writer then spends a couple of hours checking facts, adding personal experience, and polishing rather than staring at a blank page. The duplicate topic problem disappears because the Topic Registry shows every subject that has been covered and when. By the end of the quarter the team has published more articles than the quarter before with the same headcount (their own count: 24 against 18), and the content manager can answer any pipeline question from the Airtable base.
