---
title: "Validate and Triage agent-qa Regression Tests"
slug: validate-and-triage-agent-qa-tests
description: "Check selected agent-qa tests and distinguish application verdicts from dry runs, healed outcomes, and incomplete evidence."
skills: [agent-qa-testing]
category: development
tags: [testing, agent-qa, regression, memidex]
---

# Validate and Triage agent-qa Regression Tests

## The Problem

A QA engineer needs to check an existing checkout regression test before a release. A successful dry run or an empty list of failed runs can look reassuring, but neither establishes that the checkout flow actually passed. An interrupted run may have a database record without a completed verdict.

## The Solution

Use `agent-qa-testing` to validate the selected test, confirm its scope, and inspect the run's actual evidence. agent-qa combines web/mobile testing with advanced memidex memory and self-improvement; this workflow keeps clean passes, healed runs, and missing evidence distinct.

After this skill is accepted into the catalog:

```bash
npx terminal-skills install agent-qa-testing
```

Use an existing initialized agent-qa project with Node.js 24+. Validation and recorded-result inspection do not require a new application run. Running a flow needs the authorized target and model setup; local models are supported, and hosted providers may charge separately.

## Step-by-Step Walkthrough

### 1. Confirm the test selection

Give the agent this prompt:

```text
Validate tests/checkout.yaml in this agent-qa project and show the dry-run selection. Do not execute the application yet.
```

The agent checks the installed CLI and configuration, validates the YAML, and performs a dry run. In the checked fixture, both commands exit `0` and one test is selected. The report must still say that application behavior has not been tested.

### 2. Inspect the requested run

Provide the actual recorded run ID and ask:

```text
Inspect this agent-qa run's overview and memidex knowledge. Keep failed, healed, incomplete, and clean-pass outcomes distinct. Report the commands and evidence paths.
```

The agent uses `runs overview` and `runs knowledge` for that ID. It does not infer success from an empty failed-run list.

### 3. Make an evidence-based decision

For the deliberately incomplete fixture, the observed signals are:

```text
Failed-run list: [] (exit 0)
Individual overview: ended before a verdict (exit 1)
Individual knowledge: evidence-incomplete (exit 1)
Decision: no completed application outcome established
```

If a new run is authorized, execute only the selected flow, preserve its exit code and report path, and inspect the completed verdict. Otherwise, report the remaining execution gap.

## Real-World Example

A QA engineer reviewing checkout before a release can follow this workflow:

1. Validate the existing checkout YAML and confirm exactly which test is selected.
2. Inspect the requested run and its memidex evidence.
3. Record a completed verdict or the precise evidence gap, with commands and artifact paths.

The tangible output is an auditable test-status report. The fixture above demonstrates the incomplete-record case; it does not demonstrate a live checkout pass, a generated JUnit report, or a particular model's reliability.

## Related Skills

- [agent-qa-testing](../skills/agent-qa-testing/) — agent-qa validation, execution, and evidence-based triage.
- [playwright-testing](../skills/playwright-testing/) — author Playwright end-to-end tests.
- [regression-tester](../skills/regression-tester/) — check behavior preservation after refactoring.

The skill instructions use Apache-2.0. The separately installed agent-qa package uses FSL-1.1-ALv2.
