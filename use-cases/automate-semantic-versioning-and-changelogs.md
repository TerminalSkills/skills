---
title: "Automate Semantic Versioning and Changelogs Across Your Repos"
slug: automate-semantic-versioning-and-changelogs
description: "Set up conventional commits, automated version bumping, and changelog generation so releases are consistent and effortless."
skills: [git-commit-pro, changelog-generator, cicd-pipeline]
category: productivity
tags: [versioning, changelog, semver, release-management, conventional-commits]
---

# Automate Semantic Versioning and Changelogs Across Your Repos

## The Problem

A team maintains 8 packages in a monorepo. Version numbers are bumped manually — sometimes the developer forgets, sometimes they bump a patch when it should be a minor. Changelogs are written by hand the night before a release, usually missing half the changes. Three times last quarter, a breaking change shipped as a patch version, breaking downstream consumers who trusted the version number.

Nobody trusts the version numbers anymore. Downstream teams pin exact versions instead of using semver ranges, which means they fall months behind on updates — including security patches. Customers have stopped reading changelogs because they're incomplete. The version system — the one mechanism that's supposed to communicate what changed and whether it's safe to upgrade — has become meaningless noise. When a consumer sees `2.3.1 -> 2.3.2`, they should be able to upgrade with confidence. Instead, they've learned that any bump might break them.

## The Solution

Using **git-commit-pro** to enforce conventional commits, **changelog-generator** to produce accurate changelogs from the existing commit history, and **cicd-pipeline** to run release automation (release-please) and publishing from GitHub Actions on merge to main, the entire release pipeline becomes deterministic: the commit message determines the version bump, the version bump determines the changelog, and the changelog ships automatically. No human judgment, no forgotten steps, no incorrect bumps.

## Step-by-Step Walkthrough

### Step 1: Audit the Damage

Before fixing the process, quantify the problem. Vague statements like "our versioning is inconsistent" don't drive action. Concrete numbers like "3 breaking changes shipped as patches" do:

```text
Analyze the last 200 commits in our monorepo. Categorize them by what they
actually did: bug fixes, new features, breaking changes, refactors, docs,
chores. Show me what the version history should have looked like if we had
used semver correctly. How many incorrect version bumps did we ship?
```

The audit of 200 commits reveals the breakdown:

| Category | Count |
|---|---|
| Bug fixes | 67 |
| Features | 41 |
| Breaking changes | 12 |
| Refactors | 48 |
| Docs updates | 19 |
| Chores | 13 |

And 8 version bumps that were wrong — each one a broken promise to downstream consumers:

- **3 breaking changes shipped as patches** — consumers running `npm update` pulled in breaking changes thinking it was safe. Two of these caused production outages for downstream teams.
- **2 features shipped as patches** — consumers on automated minor-bump schedules missed new capabilities because they weren't expecting them in a patch
- **3 patches that should have been chores** — no-op version bumps (docs changes, CI tweaks) that polluted the release history and triggered unnecessary downstream updates

A "what versions should have been" table shows the divergence. The `billing` package is 3 major versions behind where it should be — three separate breaking changes were hidden in patch releases. Consumers who trusted the version number got burned three times.

### Step 2: Enforce Conventional Commits

```text
Configure commitlint and husky for our monorepo so every commit must follow
the conventional commits spec. Our scopes should match our package names:
api, web, shared, cli, docs, auth, billing, notifications. Add a commit
message template that developers see when they run git commit. Include
the BREAKING CHANGE footer format.
```

The setup is three small pieces (commitlint 21 and husky 9):

```bash
npm install -D husky @commitlint/cli @commitlint/config-conventional
npx husky init   # adds the "prepare": "husky" script and .husky/pre-commit
echo 'npx --no -- commitlint --edit $1' > .husky/commit-msg
git config commit.template .gitmessage   # optional; commit .gitmessage with the format and examples
```

```javascript
// commitlint.config.mjs
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-empty": [2, "never"],
    "scope-enum": [2, "always", ["api", "web", "shared", "cli", "docs", "auth", "billing", "notifications"]],
  },
};
```

The `commit-msg` hook rejects a bad message locally, before it enters history. A commit like `fixed stuff` fails with `subject may not be empty`, `type may not be empty` and `scope may not be empty`, and `fix(foo): x` fails with `scope must be one of [api, web, shared, ...]`. The accepted forms look like `fix(billing): correct proration calculation for annual plans`, or for a breaking change:

```text
feat(shared)!: store money amounts in minor units

BREAKING CHANGE: Money.amount is now an integer number of cents.
```

Add the same `commitlint --from origin/main --to HEAD` check to CI as a backstop, since local hooks can be skipped with `--no-verify`. Squash-merge repos should lint the pull request title instead, because the squash commit message is what release automation reads.

### Step 3: Generate Accurate Changelogs

This step backfills history for the commits that predate the new format; from Step 4 on, release-please writes each package's `CHANGELOG.md` itself.

```text
Generate a CHANGELOG.md for each package based on the last 6 months of
commits. Group entries by version, with sections for Features, Bug Fixes,
Breaking Changes, and Performance Improvements. Link each entry to its
commit hash and PR number. For breaking changes, include a migration guide
section explaining what consumers need to update.
```

Eight CHANGELOG.md files get generated, one per package. Each has properly grouped entries with commit links and PR references. The billing package changelog is the most revealing — 3 breaking changes that were previously invisible now have clear "Before/After" code examples showing exactly what consumers need to update:

```markdown
## Breaking Changes

### `calculateProration()` parameter order changed

**Before:**
calculateProration(amount, startDate, endDate)

**After:**
calculateProration({ amount, startDate, endDate, plan })

Migration: Update all call sites to use the options object.
Affected versions: 2.1.0+
```

For the first time, downstream teams can actually see what broke and how to fix it. The migration guides transform breaking changes from "figure out what happened" to "follow these steps." Three downstream teams update their integration within a day of receiving the changelog — previously these updates took weeks because nobody knew what had changed.

### Step 4: Automate the Release Pipeline

```text
Set up release-please in manifest mode for our monorepo. Each package under
packages/ is versioned independently from conventional commits, with its own
CHANGELOG.md, git tag and GitHub Release. Publish changed packages to npm with
provenance and post the result to Slack.
```

`standard-version`, the usual tool for this, is deprecated, and its README recommends release-please for GitHub users. release-please does not bump versions on every merge. It keeps one open "release PR" that collects the version bumps and changelog entries; merging that PR creates the tags and GitHub Releases. The rule is the same as before: `fix:` is a patch, `feat:` a minor, and a `!` or `BREAKING CHANGE:` footer a major (for versions below 1.0.0 a breaking change still bumps the major unless you set `"bump-minor-pre-major": true`). Two config files describe the packages:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "plugins": ["node-workspace"],
  "packages": {
    "packages/api": {},
    "packages/web": {},
    "packages/shared": {},
    "packages/cli": {},
    "packages/docs": {},
    "packages/auth": {},
    "packages/billing": {},
    "packages/notifications": {}
  }
}
```

```json
{
  "packages/api": "2.4.1",
  "packages/web": "2.4.0",
  "packages/shared": "2.9.3",
  "packages/cli": "1.7.0",
  "packages/docs": "1.2.0",
  "packages/auth": "1.5.2",
  "packages/billing": "2.1.4",
  "packages/notifications": "1.0.6"
}
```

The manifest holds each package's current version and release-please keeps it up to date. The workflow:

```yaml
# .github/workflows/release.yml
name: release
on:
  push:
    branches: [main]

permissions:
  contents: write
  issues: write
  pull-requests: write
  id-token: write # npm provenance

jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      releases_created: ${{ steps.release.outputs.releases_created }}
      paths_released: ${{ steps.release.outputs.paths_released }}
    steps:
      - uses: googleapis/release-please-action@v5
        id: release
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json

  publish:
    needs: release-please
    if: ${{ needs.release-please.outputs.releases_created == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org
      - run: npm ci && npm run build --workspaces --if-present
      - name: Publish released packages, shared first
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          PATHS: ${{ needs.release-please.outputs.paths_released }}
        run: |
          for p in $(jq -r 'sort_by(. != "packages/shared") | .[]' <<< "$PATHS"); do
            npm publish "$p" --provenance --access public
          done
      - name: Notify Slack
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          PATHS: ${{ needs.release-please.outputs.paths_released }}
        run: |
          curl -sf -X POST -H 'Content-Type: application/json' \
            -d "$(jq -n --arg t "Released: $PATHS" '{text: $t}')" "$SLACK_WEBHOOK_URL"
```

How it works:

1. **release-please** maps each merged commit to the package directories it touched, so a commit under `packages/api/` only bumps `api`. A PR that fixes a bug in `api` and adds a feature to `web` produces a patch for `api` and a minor for `web` in the same release PR.
2. **publish** runs only when a release PR was merged, and publishes just the released paths. `--provenance` needs the `id-token: write` permission and a GitHub-hosted runner; it lets consumers verify which workflow built the package. Prefer npm trusted publishing over a long-lived `NPM_TOKEN` if your packages support it.
3. **Slack** gets a one-line summary from an incoming-webhook secret.

The workflow may also need "Allow GitHub Actions to create and approve pull requests" under Settings > Actions > General. Commits made with the default `GITHUB_TOKEN` do not trigger other workflows, so run required checks on the release PR with a PAT or GitHub App token if your branch protection demands them.

### Step 5: Handle the Dependency Cascade

The monorepo has internal dependencies: `api`, `web`, `cli` and `auth` all depend on `shared`. The `node-workspace` plugin in the config handles the ripple. When `shared` gets a breaking change to 3.0.0, the same release PR also:

1. Updates the `shared` range in `api`, `web`, `cli` and `auth` to `^3.0.0` (`always-link-local` defaults to true, so breaking bumps are linked even when the old range would not match)
2. Gives each dependent a patch release with a changelog line for the dependency bump
3. Lists all five packages in `paths_released`

The publish step sorts `packages/shared` first so dependents never reference a version that is not on the registry yet. If your graph is deeper than one shared package, publish in topological order instead (for example with your workspace tool).

## Real-World Example

An engineering manager at a 35-person company runs the monorepo with 8 npm packages. Customers have complained that version numbers are unreliable, changelogs are incomplete, and breaking changes appear in patch releases. One downstream team pinned every dependency to an exact version out of distrust, which means they're 4 months behind on security patches — including one critical CVE that was fixed in a patch release they never pulled.

The commit audit (an illustrative run) reveals 8 incorrect version bumps in 6 months — including 3 breaking changes shipped as patches. Conventional commits get enforced, and within a week every commit follows the format. Auto-generated changelogs are accurate and complete for the first time; customer support stops fielding "what changed?" tickets.

Over the next quarter the release PRs ship every bump the commits call for, and nobody picks a version number by hand. Downstream teams start trusting semver again and move back to caret ranges. The team that was 4 months behind catches up in a single afternoon (the example team's own numbers, not a benchmark).

## Related Skills

- [git-commit-pro](/skills/git-commit-pro): conventional commit messages and enforcement
- [changelog-generator](/skills/changelog-generator): changelogs from existing history
- [cicd-pipeline](/skills/cicd-pipeline): the GitHub Actions release workflow
