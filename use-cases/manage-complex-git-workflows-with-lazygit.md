---
title: Manage Complex Git Workflows with lazygit
slug: manage-complex-git-workflows-with-lazygit
description: Give a development team one shared lazygit setup and exact key sequences for squashing, cherry-picking and undoing, so history stays clean without Git acrobatics.
skills:
  - lazygit
  - git-commit-pro
  - github
category: productivity
tags:
  - lazygit
  - git
  - interactive-rebase
  - custom-commands
  - conventional-commits
---

## The Problem

Tomás Herrera leads seven developers at Parcelwise, a startup that builds route-planning software for couriers. Every pull request arrives with a trail of `wip` commits. Reviewers spend the first ten minutes of each review working out which commit matters, and the release notes generator skips about a third of the changes because the commit messages do not follow any format.

The team knows the history should be cleaned up before review, but interactive rebase scares half of them. Twice a month somebody drops the wrong commit or ends up in a half-finished rebase, and a colleague loses close to an hour helping them recover it from the reflog. Two developers already use lazygit, each with a different private configuration, so they cannot help the others either.

Tomás wants one setup for everyone: the same tool, the same shortcuts, the same commit format, and written instructions a new hire can follow on day one.

## The Solution

The agent uses the **lazygit** skill to install the tool, write and validate a shared configuration with custom commands, and spell out the keys for each workflow. The **git-commit-pro** skill supplies the Conventional Commits format for the commit shortcut and for the agent's own commits. The **github** skill covers the `gh` command line used for the pull request shortcut. The agent never operates the lazygit screen: whatever it has to do in Git itself, it does with plain `git`.

## Step-by-Step Walkthrough

### 1. Install the tools and check the prerequisites

**Prompt:** "Install lazygit and delta on my Mac and make sure gh is logged in."

```bash
brew install lazygit git-delta
lazygit --version
git --version
gh auth status
```

lazygit 0.65.1 needs Git 2.32 or later; the machine has 2.43. `gh auth status` confirms the GitHub session that the pull request shortcut and the pull request icons depend on.

### 2. Write one configuration for all team repositories

**Prompt:** "All our repositories are cloned under ~/code/parcelwise. Same settings for every one of them: delta diffs, VS Code, no force pushes, a shortcut for conventional commits and one that opens a pull request."

The agent writes `lazygit/team.yml` in the team's `dev-setup` repository:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/jesseduffield/lazygit/master/schema/config.json
git:
  mainBranches: [main, develop]
  disableForcePushing: true
  diffRenderers:
    - command: delta --dark --paging=never
os:
  editPreset: vscode
customCommands:
  - key: <ctrl+g>
    context: files
    description: Conventional commit
    prompts:
      - type: menu
        title: Commit type
        key: Type
        options:
          - value: feat
          - value: fix
          - value: chore
      - type: input
        title: Scope (optional)
        key: Scope
      - type: input
        title: Subject
        key: Subject
    command: >-
      git commit -m {{ printf "%s%s: %s" .Form.Type
      (and .Form.Scope (printf "(%s)" .Form.Scope)) .Form.Subject | quote }}
  - key: <ctrl+u>
    context: localBranches
    description: Open pull request with gh
    command: gh pr create --fill --head {{ .SelectedLocalBranch.Name | quote }}
    output: terminal
```

Then it saves the schema check from the lazygit skill as `check_lazygit_config.py`, validates the file, puts it in place and commits it:

```bash
cd ~/code/parcelwise/dev-setup
pip install jsonschema pyyaml
python3 check_lazygit_config.py lazygit/team.yml
cp lazygit/team.yml ~/code/parcelwise/.lazygit.yml
git add lazygit/team.yml check_lazygit_config.py
git commit -m "chore(tooling): add shared lazygit configuration"
```

The check prints nothing, which means the file matches the schema.

The copy goes into the parent directory on purpose. lazygit reads `.lazygit.yml` from the directories above a repository, not from the repository root.

### 3. Squash work-in-progress commits before review

**Prompt:** "I have three messy commits on feature/RTE-218-time-windows. How do I make them one commit in lazygit?"

The agent looks at the branch first:

```bash
git log --oneline -4
```

```text
1fd000e wip: tests
70c9ada wip: handle midnight
728cf30 feat(routing): add delivery time windows
2066e55 chore: bump osrm client
```

Its answer to Tomás: open `lazygit`, press `4` for the Commits panel, select `wip: tests`, press `v`, press `j` once, press `s`, confirm with `enter`. Press `r` to tidy the message. The two `wip` commits are melded into `feat(routing): add delivery time windows`.

### 4. Bring a fix onto the release branch

**Prompt:** "Cherry-pick the refund rounding fix onto release/2026.09 for me, and tell me how I would do it myself next time."

The agent does its own part with plain Git:

```bash
git switch release/2026.09
git cherry-pick b550314
git log --oneline -1
```

For next time: in the Commits panel press `C` on the commit, check out `release/2026.09` in the Local branches panel with `space`, go back to Commits, press `V` and confirm with `enter`.

### 5. Recover from a rebase gone wrong

**Prompt:** "I dropped the wrong commit in lazygit a minute ago. Is it gone?"

The answer: press `z` in lazygit and confirm with `enter`. lazygit reads the reflog and returns the branch to the state before the last action. The agent verifies afterwards:

```bash
git log --oneline -4
git reflog -3
```

Undo covers commits, rebases and checkouts. It does not bring back discarded file changes or a dropped stash, and a push cannot be undone.

## Real-World Example

Tomás rolled the setup out on a Monday. Each developer ran the two lines from the `dev-setup` README, `brew install lazygit git-delta` and the `cp` command, which took under five minutes per person.

After four weeks the numbers looked like this. Out of 46 merged pull requests, 41 had a single, clearly named commit per logical change, compared with 12 out of 44 in the month before. The release notes generator picked up 96 percent of the merged changes instead of roughly two thirds, because `ctrl+g` produces messages such as `fix(billing): round refunds half-up` without anybody typing the format by hand. Nobody needed a colleague to rescue a rebase: the three incidents that did happen were fixed by the developers themselves with `z`.

The written key sequences from steps 3 to 5 went into the onboarding document. The next new hire squashed and opened a first pull request on day two.

## Related Skills

- [lazygit](/skills/lazygit) — installs the tool, provides the shared configuration, custom commands and the key sequences for squash, cherry-pick and undo
- [git-commit-pro](/skills/git-commit-pro) — defines the Conventional Commits format behind the `ctrl+g` shortcut and the agent's own commit messages
- [github](/skills/github) — checks the `gh` session and supplies `gh pr create` for the pull request shortcut
