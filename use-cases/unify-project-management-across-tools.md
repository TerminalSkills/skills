---
title: "Unify Project Management Across Jira, Linear, and ClickUp"
slug: unify-project-management-across-tools
description: "Synchronize project tracking across Jira, Linear, and ClickUp to give leadership a unified view of engineering velocity while letting each team use their preferred tool."
skills:
  - jira
  - linear
  - clickup
category: productivity
tags:
  - project-management
  - agile
  - cross-team
  - reporting
---

# Unify Project Management Across Jira, Linear, and ClickUp

## The Problem

A 90-person company has three engineering squads using three different project management tools. The platform team uses Jira (inherited from the enterprise parent company), the product team chose Linear for its speed, and the acquired mobile team brought ClickUp.

The VP of Engineering cannot get a unified view of sprint velocity, blocked items, or cross-team dependencies without manually checking three dashboards every morning. Quarterly planning is a nightmare because estimating total engineering capacity requires exporting data from three systems and reconciling it in a spreadsheet. Forcing all teams onto one tool is not an option because each team chose their tool for specific workflow reasons, and a migration would cost more in lost productivity than the status quo.

## The Solution

Use the **jira**, **linear**, and **clickup** skills to query each platform, normalize the data into a common format, and produce unified cross-team reports for sprint tracking, dependency management, and capacity planning.

## Step-by-Step Walkthrough

### 1. Extract current sprint data from all three tools

Pull active sprint information from each platform into a common structure:

> Query the active sprint from each tool. From Jira, get all issues in the current sprint for the Platform team board (project key PLAT) including status, assignee, story points, and priority. From Linear, get all issues in the current cycle for the Product team including state, assignee, estimate, and priority. From ClickUp, get all tasks in the current sprint list for the Mobile team space including status, assignee, time estimate, and priority. Normalize the data: map Jira "In Progress" + Linear "In Progress" + ClickUp "in progress" to a common "Active" status. Map all three priority scales to P0-P3.

Status mapping is the hardest part because each tool has different workflow states. Create a mapping table once and maintain it as teams customize their workflows. A missing mapping should default to "Unknown" rather than silently dropping issues.

### 2. Identify cross-team dependencies and blockers

Find issues that reference other teams or are blocked by external dependencies:

> Search across all three platforms for blocked items. In Jira, find issues with status "Blocked" or labels containing "dependency". In Linear, find issues with the "blocked" state or labels matching "waiting-on-*". In ClickUp, find tasks with the "blocked" status or dependency relationships. For each blocked item, extract: the blocking reason or linked issue, which team owns the blocker, and how many days the item has been blocked. Generate a dependency report grouped by blocking team showing what they are holding up and the downstream impact.

Cross-team dependencies are the primary source of missed sprint commitments. Making blockers visible across all three tools prevents the common situation where Team A is waiting on Team B, but Team B does not know they are blocking anyone.

### 3. Generate a unified sprint velocity report

Combine completion data from all three tools into a single leadership view:

> Pull the last 6 completed sprints from each platform. From Jira, get sprint reports showing committed vs completed story points. From Linear, get cycle reports showing scope completed vs total scope. From ClickUp, get sprint list completion rates with time tracked. Normalize to a common metric: percentage of committed work completed per sprint. Generate a report showing per-team velocity trends over 6 sprints, a combined velocity chart, and the overall engineering completion rate. Flag any team whose velocity dropped more than 20% sprint-over-sprint.

Velocity comparison across teams using different estimation systems (story points vs hours vs task count) requires normalization to percentages rather than absolute numbers. Comparing "Team A completed 85% of committed work" to "Team B completed 72%" is meaningful even when they use different units.

### 4. Build a cross-team capacity planning view

Aggregate team availability and workload for quarterly planning:

> Calculate available capacity for the next quarter across all three teams. From Jira, count active team members and their average story points per sprint for the Platform team (8 engineers). From Linear, get the Product team's cycle capacity and current utilization (6 engineers). From ClickUp, get the Mobile team's time estimates and tracked hours per sprint (5 engineers). Account for planned PTO from each system's calendar integration. Output a capacity table showing: team, headcount, average sprint throughput, planned PTO days next quarter, and estimated available capacity in normalized points.

Capacity planning with real data replaces the "how much can we do next quarter?" guessing game. Accounting for PTO upfront prevents over-commitment that leads to missed deadlines.

### 5. Create a Monday morning cross-team standup summary

Produce a summary digest that replaces the 30-minute all-hands status meeting:

> Generate the weekly cross-team summary for Monday February 23, 2026. For each team, show: items completed last week, items in progress this week, blockers and dependencies, and sprint health (on track / at risk / behind). Highlight any cross-team items: Platform PRs awaiting Product team review, Mobile features blocked on Platform API changes, and Product designs pending Mobile team feedback. Format for Slack with team headers and bullet points, keeping the total under 40 lines.

The summary replaces a synchronous meeting with an asynchronous read. Team leads can comment on the Slack thread instead of sitting through a 30-minute call where they are only relevant for 5 minutes.

## Real-World Example

The VP of Engineering starts Monday by reading a single Slack message instead of opening three dashboards. The summary shows Platform completed 34 of 38 story points (89%), Product finished 28 of 31 cycle points (90%), and Mobile closed 12 of 18 tasks (67%) with 3 blocked on a Platform API that shipped Friday. The cross-team dependency report reveals that Mobile's velocity dip is not a team problem but a Platform bottleneck that resolved late in the sprint.

The quarterly planning view shows 19 engineers with 847 normalized capacity points available next quarter after accounting for 23 PTO days across the org. The 30-minute Monday standup meeting gets replaced by a 5-minute Slack thread where team leads comment on the summary. Over the first month, the VP estimates they save 6 hours per week across leadership by eliminating redundant status meetings and manual dashboard checking.
