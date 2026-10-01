---
name: coderabbit
description: >-
  CodeRabbit reviews pull requests with AI on GitHub, GitLab, Azure DevOps and Bitbucket, and reviews local changes from a CLI before they are pushed. Use when a user asks to set up automated PR reviews, write or validate a .coderabbit.yaml, add path-specific review instructions, control a review with @coderabbitai commands, or run coderabbit review from the terminal or a coding agent.
license: Apache-2.0
compatibility: "CodeRabbit account connected to GitHub, GitLab, Azure DevOps or Bitbucket; the optional CLI runs on macOS, Linux and Windows"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["code-review", "ai", "pull-request", "automation", "github"]
---
# CodeRabbit — AI-Powered Code Review

## Overview

CodeRabbit is a hosted AI code review service. Once installed on a repository it reviews every new pull request: a summary and walkthrough at the top, inline comments with suggested fixes, and the findings of the linters and security scanners it runs for you. Behaviour is configured in a `.coderabbit.yaml` at the repository root, steered per pull request with `@coderabbitai` comments, and the same review engine is available locally through the `coderabbit` CLI (the docs' short alias `cr` is created only by the vendor's install script, not by the installs shown below).

## Instructions

### Setup

1. Sign up at https://app.coderabbit.ai with a GitHub, GitLab, Azure DevOps or Bitbucket account.
2. Add the repositories CodeRabbit may access (on GitHub this installs the CodeRabbit app on the selected repositories).
3. Commit a `.coderabbit.yaml` to the repository root. The file on the branch under review is the one used for that review.
4. Open a pull request — the review arrives as comments from `@coderabbitai`.

Plans: reviews of public repositories are free. Private repositories get a 14-day trial; after it the Free plan keeps PR summaries plus IDE and CLI reviews, and full PR reviews need a paid plan (Essentials, Team, Advanced, Enterprise). Prices and per-developer hourly review limits are on https://www.coderabbit.ai/pricing.

### Configuration

```yaml
# .coderabbit.yaml — Project-level configuration
# yaml-language-server: $schema=https://coderabbit.ai/integrations/schema.v2.json
language: en-US

# Max 250 characters
tone_instructions: >
  Be direct. Show the exact code fix, not just the problem.
  Prioritize: security > bugs > performance > style.
  Don't nitpick formatting — the linter handles that.

early_access: true                         # Enable experimental features

reviews:
  profile: chill                           # quiet | chill (default) | assertive
  request_changes_workflow: true           # Approve the PR once its comments are resolved
  high_level_summary: true                 # Summary in the PR description
  review_status: true                      # Say when a review was skipped, and why
  auto_review:
    enabled: true
    drafts: false                          # Skip draft PRs
    base_branches:                         # Regex; the default branch is always reviewed
      - develop
      - "release/.*"
    ignore_title_keywords:
      - WIP

  # Path-specific instructions — different rules for different code
  path_instructions:
    - path: "src/server/**/*.ts"
      instructions: |
        Backend review checklist:
        - Input validation with Zod on all endpoints
        - SQL injection prevention (parameterized queries only)
        - Authentication check on protected routes
        - Rate limiting on public endpoints
        - Error responses don't leak internal details
        - Database transactions for multi-step operations

    - path: "src/app/**/*.tsx"
      instructions: |
        Frontend review checklist:
        - Server components preferred (no unnecessary "use client")
        - Loading states and error boundaries
        - Accessibility: labels, alt text, ARIA attributes
        - No inline styles (use Tailwind classes)

    - path: "**/*.test.ts"
      instructions: |
        Test review checklist:
        - Tests describe user behavior, not implementation
        - Edge cases covered: empty state, error state, boundary values
        - Mocks are minimal and well-documented

    - path: "drizzle/migrations/**"
      instructions: |
        Migration safety:
        - No DROP COLUMN without data backup plan
        - Indexes on foreign keys
        - Default values for new NOT NULL columns

  path_filters:
    - "!**/*.lock"                         # Skip lock files
    - "!**/generated/**"                   # Skip generated code
    - "!**/*.min.js"                       # Skip minified files

  tools:                                   # Linters and scanners run during the review
    eslint:
      enabled: true
    gitleaks:
      enabled: true                        # Secret scanning

chat:
  auto_reply: true                         # Reply to developer questions without a mention
```

Coding-standard files already in the repository — `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md` and similar — are picked up automatically as review criteria for their directory. Add other files with `knowledge_base.code_guidelines.filePatterns`; do not list them under `path_instructions`, which would only make CodeRabbit review those files.

### Interaction in PRs

Commands are comments that mention the bot. The handle is `@coderabbitai`.

```markdown
@coderabbitai review              Incremental review of what changed since the last one
@coderabbitai full review         Review the whole pull request from scratch
@coderabbitai pause               Stop automatic reviews on this PR
@coderabbitai resume              Start them again
@coderabbitai resolve             Mark all CodeRabbit comments as resolved (top-level comment only)
@coderabbitai approve             Resolve its threads and approve (needs request_changes_workflow)
@coderabbitai summary             Regenerate the summary in the PR description
@coderabbitai configuration       Post the resolved configuration as YAML, with the source of each setting
@coderabbitai autofix             Apply fixes for the review findings
@coderabbitai generate docstrings Add docstrings for the changed functions
@coderabbitai help                List every command
```

Put `@coderabbitai ignore` anywhere in the PR description to switch automatic reviews off for that pull request. Anything else after the mention is a question to the reviewer — `@coderabbitai why is this query flagged as N+1?`. Review preferences stated in chat are stored as learnings and applied to later reviews.

### CLI: review before pushing

```bash
# Homebrew
brew install coderabbit

# Linux without Homebrew: release archive, verified against the published checksums (arm64: coderabbit-linux-arm64.zip)
VERSION=0.8.2
curl -fsSLO "https://cli.coderabbit.ai/releases/$VERSION/coderabbit-linux-x64.zip"
curl -fsSLO "https://cli.coderabbit.ai/releases/$VERSION/SHA256SUMS"
sha256sum --check --ignore-missing SHA256SUMS      # coderabbit-linux-x64.zip: OK
unzip coderabbit-linux-x64.zip -d "$HOME/.local/bin"   # this directory must be on PATH
coderabbit --version
```

```bash
coderabbit auth login                    # Browser sign-in; add --region eu for an EU account
coderabbit review                        # Committed, staged and unstaged changes vs the base branch
coderabbit review --uncommitted          # Only work that is not committed yet
coderabbit review --base develop         # Compare against another base branch
coderabbit review --agent                # One JSON object per line, for coding agents
coderabbit config validate               # Check .coderabbit.yaml against the schema (no sign-in needed)
coderabbit doctor                        # Diagnose installation, auth and connectivity
```

In CI or another headless environment, create an Agentic API key in the CodeRabbit dashboard, store it as the secret `CODERABBIT_API_KEY`, and run `coderabbit review --agent --api-key "$CODERABBIT_API_KEY"`. Each `--agent` finding carries `severity` (`critical`, `major`, `minor`, `trivial`, `info`, `none`), `fileName` and `codegenInstructions`.

## Examples

**Example 1: Add CodeRabbit to a repository and check the config**

User: "Set up CodeRabbit for our Next.js monorepo. Reviews should run on PRs to main and develop, skip drafts and generated code."

The agent writes `.coderabbit.yaml` (the file above, with `base_branches: [develop]` and the team's paths), then validates it before committing:

```bash
coderabbit config validate .coderabbit.yaml
```

```text
✔ .coderabbit.yaml is valid against the current CodeRabbit schema.
```

A mistake is reported with its line, and the command exits with status 1:

```text
✖ .coderabbit.yaml is invalid:
  Line 2  tone_instructions: must contain at most 250 characters
  Line 4  reviews.profile: must be one of quiet, chill, assertive
```

After the file is merged, the agent tells the user to comment `@coderabbitai configuration` on the next pull request to confirm the settings were picked up.

**Example 2: Review local changes from a coding agent, then fix the findings**

User: "Before I push, run CodeRabbit on my branch and fix whatever it finds."

```bash
coderabbit auth status                   # must show a signed-in user
coderabbit review --agent --base main > findings.ndjson
jq -c 'select(.type == "finding") | {severity, fileName}' findings.ndjson
```

```text
{"severity":"major","fileName":"src/server/orders/refund.ts"}
{"severity":"minor","fileName":"src/app/checkout/page.tsx"}
```

The agent reads `findings.ndjson` line by line, applies the `codegenInstructions` of the `critical` and `major` findings, and runs the review again until none of those remain. It reports the lower-severity findings to the user without changing the code. Every run counts against the hourly review limit, so fix in batches.

## Guidelines

1. **Path-specific instructions** — Different code needs different review rules; backend security checks don't apply to CSS files. Each `instructions` block may be up to 20,000 characters, `tone_instructions` only 250.
2. **Exclude generated code** — Use `path_filters` to skip lock files, generated types, and minified code; it reduces noise and the excluded files do not count toward the files-per-review limit.
3. **Request changes workflow** — With `request_changes_workflow: true` CodeRabbit approves the PR automatically once its comments are resolved, the latest commit is reviewed and no pre-merge check fails. Whether an unapproved PR can be merged is decided by the repository's branch protection, not by CodeRabbit.
4. **Custom tone** — Set `tone_instructions` to match your team culture; "direct and specific" saves developer time. Use `reviews.profile: quiet` when only the most important findings are wanted.
5. **Complement, don't replace** — CodeRabbit handles mechanical review (security, patterns, style); humans review architecture and business logic.
6. **Validation has limits** — `coderabbit config validate` checks types and allowed values but does not report a misspelled key (`request_changes_worklow` passes). Confirm the effective settings with `@coderabbitai configuration` on a PR.
7. **Base branch filtering** — PRs to the default branch are always reviewed; `base_branches` only adds more (regex), so feature-to-feature PRs stay unreviewed unless a pattern matches them.
8. **Iterate on instructions** — Start with minimal `path_instructions`; add rules when you see repeated issues CodeRabbit misses.
9. **Configuration precedence** — Sources do not merge by default: a repository `.coderabbit.yaml` replaces the settings from the web UI unless `inheritance: true` is set.
10. **Code leaves your machine** — CodeRabbit is a hosted service: the code under review, from a PR or from the CLI, is processed in its cloud. CodeRabbit states it does not train models on customer code; for code that must not leave the network, only the Enterprise plan offers self-hosting.
11. **Rate limits and credits** — Reviews are limited per developer per hour by plan. `coderabbit review --use-credits` authorizes pay-as-you-go charges for an over-limit review — never pass it without the user's consent.
