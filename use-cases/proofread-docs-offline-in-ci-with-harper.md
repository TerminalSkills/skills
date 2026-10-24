---
title: Proofread Docs Offline in CI and Editors with Harper
slug: proofread-docs-offline-in-ci-with-harper
description: Add a private, instant grammar and spelling check to a documentation repo, so typos are caught in the editor and on every pull request without sending text to a cloud service.
skills:
  - harper
  - github-actions
  - lefthook
category: content
tags:
  - grammar
  - documentation
  - spellcheck
  - privacy
  - ci
---

## The Problem

Priya Raman maintains the docs for an internal developer platform: 140 Markdown pages, written by 18 engineers who are not professional writers. Every release, a reader finds "recieve" or "the the" on a page that gets read by hundreds of people. She has tried browser-based grammar tools, but the docs describe unreleased infrastructure and the security team does not allow pasting that text into a third-party service. LanguageTool self-hosted wants a multi-gigabyte data set and takes seconds per page. She wants typos caught while people write, and again on every pull request, with nothing leaving the company network.

## The Solution

Use `harper`, an offline English grammar checker. Its language server (`harper-ls`) gives each engineer live feedback in their editor, and its command-line linter (`harper-cli`) checks the same files in a pre-commit hook and in a CI job. A committed word list holds the platform's jargon, so the checker stays quiet about product names and loud about real mistakes. `lefthook` runs the check locally and `github-actions` enforces it on pull requests.

## Step-by-Step Walkthrough

### Step 1: Install harper-cli and measure the backlog

Prompt to the agent: "Install Harper's command-line linter and tell me how many problems the docs folder has right now."

```bash
curl -fsSL -o harper-cli.tar.gz https://github.com/Automattic/harper/releases/download/v2.13.0/harper-cli-x86_64-unknown-linux-gnu.tar.gz
echo "3c2db5f53d374f7b3fe70200a6675f5ba43f01b3995974fb32a39e20237e914a  harper-cli.tar.gz" | sha256sum -c -
tar -xzf harper-cli.tar.gz
install -m 0755 harper-cli ~/.local/bin/harper-cli
harper-cli lint --quiet --format compact docs/ > /tmp/harper-baseline.txt
wc -l /tmp/harper-baseline.txt
cut -d: -f4 /tmp/harper-baseline.txt | sort | uniq -c | sort -rn | head
```

The agent reports the number of findings and which rules produce most of them, for example `Spelling::SpellCheck` for unknown product names and `Capitalization::UseTitleCase` for headings.

### Step 2: Build the project vocabulary

Prompt: "Most spelling hits are our own product names. Make a shared word list and turn off the rules we do not want."

```bash
grep 'SpellCheck' /tmp/harper-baseline.txt | sed -E 's/.*spell `([^`]+)`.*/\1/' | sort -u
```

The agent reviews the list with Priya, keeps only the genuine names, and writes them one per line to `.ci/words.txt` (for example `Kubernetes`, `Grafana`, `helmfile`, `Backstage`). Real misspellings such as `recieve` are fixed in the pages instead. The agent also decides, with her, to ignore `UseTitleCase` because the docs use sentence-case headings.

```bash
harper-cli lint --quiet --format compact \
  --user-dict-path .ci/words.txt \
  --ignore UseTitleCase \
  docs/ README.md
```

Run again until the output is empty and the exit status is 0.

### Step 3: Check staged files before each commit

Prompt: "Run Harper on staged Markdown files before commit, using the same word list."

```yaml
# lefthook.yml
pre-commit:
  commands:
    prose:
      glob: "*.md"
      run: harper-cli lint --quiet --format compact --user-dict-path .ci/words.txt --ignore UseTitleCase {staged_files}
```

```bash
lefthook install
```

A commit that adds "the the" is now rejected with the file, line, column and suggestion.

### Step 4: Enforce it on pull requests

Prompt: "Add a CI job that fails when the docs have prose errors."

```yaml
# .github/workflows/docs-prose.yml
name: docs-prose
on:
  pull_request:
    paths: ["docs/**", "README.md"]
jobs:
  harper:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install harper-cli
        run: |
          curl -fsSL -o harper-cli.tar.gz https://github.com/Automattic/harper/releases/download/v2.13.0/harper-cli-x86_64-unknown-linux-gnu.tar.gz
          echo "3c2db5f53d374f7b3fe70200a6675f5ba43f01b3995974fb32a39e20237e914a  harper-cli.tar.gz" | sha256sum -c -
          tar -xzf harper-cli.tar.gz
          sudo install -m 0755 harper-cli /usr/local/bin/harper-cli
      - name: Lint prose
        run: harper-cli lint --quiet --format compact --user-dict-path .ci/words.txt --ignore UseTitleCase docs/ README.md
```

Harper exits with status 1 when it finds anything, so the job turns red without extra scripting. The release tag is pinned, so a new Harper version never changes results unannounced.

### Step 5: Give authors live feedback

Prompt: "Set up Harper in Neovim and VS Code for the team and share the vocabulary."

```lua
require('lspconfig').harper_ls.setup {
  settings = { ["harper-ls"] = {
    workspaceDictPath = ".ci/words.txt",
    linters = { SpelledNumbers = false, UseTitleCase = false },
    dialect = "American",
  } }
}
```

For VS Code the agent installs the extension with `code --install-extension elijah-potter.harper`. Authors see squiggles while typing and can add a word to the workspace dictionary from a code action.

## Real-World Example

On the first run Priya's baseline shows 212 findings across 140 pages. The agent sorts them: 131 are product and tool names, which go into `.ci/words.txt`; 64 are real mistakes (misspellings, doubled words, "a" versus "an"), which the agent fixes in one commit after Priya reviews the diff; 17 are style findings she decides to disable. The next day an engineer opens a pull request containing "We recieve the the event"; the CI job fails in under 20 seconds with the line and column, and the engineer fixes it before review. In the following month no typo reaches a released page, and the security team confirms that the checker makes no network requests.

## Related Skills

- [harper](/skills/harper) — the grammar and spell checker itself, as CLI and language server
- [github-actions](/skills/github-actions) — runs the prose check on every pull request
- [lefthook](/skills/lefthook) — runs the same check on staged files before each commit
