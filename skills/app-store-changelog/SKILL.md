---
name: app-store-changelog
description: >-
  Writes the App Store "What's New in This Version" text for an app update from the repository's
  commit history: finds the range since the last shipped version, separates changes users can notice
  from internal work, drafts plain-text notes within Apple's 4,000-character limit and review
  guidelines, and returns a trace from every sentence back to its commits. Use when someone asks to
  "write release notes for the App Store", "generate What's New from git", "summarize changes since
  the last tag for the store listing", or needs the same notes cut to Google Play's 500 characters.
license: Apache-2.0
compatibility: "A Git repository of an iOS, iPadOS, macOS, tvOS, watchOS or visionOS app. Bash and Git 2.x for the commands, Python 3 for character counts. A fastlane metadata folder is used when present but not required."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: development
  tags: ["app-store", "release-notes", "changelog", "ios", "git"]
---

# App Store Changelog

## Overview

This skill turns the commits between two releases into the text shown under "What's New" on an app's product page and in the Updates list. It delivers one plain-text note per locale with its character count, a table tracing each sentence to commits, and the list of changes left out with the reason.

Facts from Apple's documentation that shape the work:

- The field holds up to 4,000 characters per localization and is plain text.
- It does not exist for the first version of an app and is required for every update.
- It can only be changed as part of a new version submission. After release the text is frozen, so mistakes stay until the next version. Promotional Text (170 characters) is the field that can change at any time.
- App Review Guideline 2.3.12: new features and product changes must be described clearly; a generic line is acceptable only for simple bug fixes, security updates and performance work.

## Instructions

### 1. Gather context

Look in the repository before asking:

- `fastlane/metadata/*/release_notes.txt` shows the locales in use and the voice and length of earlier notes.
- `CHANGELOG.md`, release tags, and the marketing version (`MARKETING_VERSION` in the Xcode project or an xcconfig file).

Then confirm with the user: the commit being shipped; the last version that actually reached the store (a tag may belong to a build that was rejected or only went to TestFlight); the locales needed; any feature that is merged but switched off.

### 2. Fix the range

```bash
git tag --sort=-creatordate | head -5          # recent tags, newest first
git describe --tags --abbrev=0                 # nearest tag reachable from HEAD
git describe --tags --abbrev=0 HEAD^           # previous tag when HEAD itself is already tagged
```

Without tags, find the commits that changed the version number and use the previous one as the start:

```bash
git log --date=short --pretty='format:%h %ad %s' -G'MARKETING_VERSION' -- '*.pbxproj' '*.xcconfig'
```

Prefer a commit or tag over a date: `--since=2026-09-01` counts from the current time of day on that date and silently drops commits made earlier that morning.

### 3. List what changed

Save this as `release-range.sh` outside the repository (or paste the commands one by one) and run it from the repository root. It only reads.

```bash
#!/usr/bin/env bash
# Usage: release-range.sh [FROM_REF] [TO_REF]
set -euo pipefail
to="${2:-HEAD}"
from="${1:-}"
if [ -z "$from" ]; then
  from="$(git describe --tags --abbrev=0 "$to" 2>/dev/null || true)"
  # the release commit may already carry the new tag: step back one tag
  if [ -n "$from" ] && [ "$(git rev-parse "$from^{commit}")" = "$(git rev-parse "$to^{commit}")" ]; then
    from="$(git describe --tags --abbrev=0 "$to^" 2>/dev/null || true)"
  fi
fi
range="${from:+$from..}$to"
echo "## Range: $range  ($(git rev-list --count --no-merges "$range") commits, no merges)"
echo; echo "## Commits (oldest first)"
git log --reverse --no-merges --date=short --pretty='format:%h %ad %s' "$range"
echo; echo; echo "## Reverts in range"
git log --no-merges --grep='^Revert' --pretty='format:%h %s' "$range"
echo; echo; echo "## Files changed per area"
if [ -n "$from" ]; then
  git diff --name-only "$from" "$to" | awk -F/ '{print (NF>1 ? $1"/"$2 : $1)}' | sort | uniq -c | sort -rn
  echo; echo "## User-facing strings touched"
  git diff --stat "$from" "$to" -- '*.xcstrings' '*.strings' '*.stringsdict' '*/strings.xml' | cat
fi
```

For any commit whose subject does not explain itself, read it: `git show --stat --format='%h %s%n%b' 21b6016`, then the diff of the files that matter. In repositories that merge pull requests, `git log --merges --first-parent --pretty='format:%h %s: %b' v2.3.0..HEAD` lists them; GitHub's default merge commit keeps the pull-request title in the body, which is why `%b` is there.

### 4. Decide what users can notice

| Evidence | Treatment |
|---|---|
| Feature, fix or speed-up in screens, widgets, notifications, sync | Candidate for the notes |
| CI, tests, refactors, build settings, tooling | Leave out |
| Dependency update | Leave out, unless it fixes something users saw |
| Commit and its revert both inside the range | Leave out both |
| Code behind a flag that ships switched off | Leave out; describing a feature the build does not show is misleading (2.3.1) |
| Fix for a bug introduced inside the same range | Leave out; users never saw the bug |
| Vague subject ("wip", "fix crash", "update") | Read the diff; ask the user if it is still unclear |
| Changed strings files | Use them to learn what the interface calls the feature |

Check flags with `git grep -n 'exportEnabled' v2.4.0 -- '*.swift'` (flag name and ref from the project). A flag controlled from a server cannot be read from the repository: ask.

### 5. Write the notes

- Open with the one change most users will care about. Apple's guidance is to list changes in order of importance, and the product page shows only the opening lines until the reader expands the text.
- Describe what the user can now do or what no longer goes wrong, in the words the interface uses. One idea per line.
- Use headings such as "New" and "Fixed" only when there are more than four items. Bullets are a typed "•" or "-"; Markdown and HTML are not rendered.
- Name every significant change (2.3.12). "Bug fixes and performance improvements" alone is only for releases that contain nothing else.
- Keep out: names of other mobile platforms or stores (2.3.10), prices (they differ by storefront), features not in this build, ticket numbers, library names, internal code names, and details of a security hole beyond "security improvements".
- Most notes need 200–800 characters. The limit is 4,000.
- For each further locale translate the meaning, reuse the app's own localized terms from its strings files, and count again; translations run longer.

### 6. Check before handing over

```bash
for f in fastlane/metadata/*/release_notes.txt; do
  printf '%s %s chars\n' "$f" "$(python3 -c 'import sys; print(len(open(sys.argv[1], encoding="utf-8").read().strip()))' "$f")"
done
grep -n -i -E 'android|google play|\$[0-9]|€ ?[0-9]|coming soon' fastlane/metadata/*/release_notes.txt || echo "no flagged terms"
```

Then confirm that every sentence maps to at least one commit in the range, that no left-out item is described, and that the wording matches the interface. Count with the Python line rather than `wc -m`, whose result depends on the shell locale.

### 7. Deliver

Reply with the note per locale, the count, the trace table and the left-out list. Write files only where the project already keeps them:

| Destination | Where the text goes |
|---|---|
| fastlane deliver | `fastlane/metadata/en-US/release_notes.txt`, one folder per locale (`de-DE`, `fr-FR`, `ja`, `zh-Hans`) |
| App Store Connect API | attribute `whatsNew` in `PATCH /v1/appStoreVersionLocalizations/{id}` |
| App Store Connect website | the What's New field of the new version, per language |
| Google Play via fastlane supply | `fastlane/metadata/android/en-US/changelogs/156.txt` (file named after the version code), at most 500 characters per language |

Do not upload or submit unless asked. When the release adds features, offer a draft for the separate Notes for Review field, where guideline 2.3.1 requires new functionality to be described specifically.

## Examples

### Example 1: tagged release with typed commit subjects

Tidepool 2.4.0 (a tide-times app) is ready; the last store version is tagged `v2.3.0`. Output of `release-range.sh`, shortened:

```text
## Range: v2.3.0..HEAD  (13 commits, no merges)
e9bebca 2026-08-11 feat(alerts): tide alerts for saved spots (#412)
1bc978c 2026-08-13 fix(map): pin jumps to wrong harbour after rotating device (#415)
728aa0c 2026-08-14 chore(deps): bump swift-collections to 1.2.1
5249aa8 2026-08-19 ci: cache derived data on main
54d3444 2026-08-21 feat(widget): lock screen widget with next high tide (#421)
3c1afb3 2026-08-25 refactor(store): split SpotStore into reader and writer
9a72212 2026-08-27 perf(chart): draw tide curve off the main thread (#426)
21b6016 2026-09-01 feat(export): CSV export of tide log (#430)
29c84c9 2026-09-02 fix(chart): tide times shown one hour early after daylight saving change (#433)
3a0ddbb 2026-09-03 fix(alerts): alert sound missing on first launch (#434)
2d72cc9 2026-09-04 feat(onboarding): new welcome carousel (#436)
e4871f6 2026-09-05 Revert "feat(onboarding): new welcome carousel (#436)"
e3a5568 2026-09-08 chore: release 2.4.0
```

`git show 21b6016` shows that the export is hidden behind `Flags.exportEnabled`, and `git grep` finds `static let exportEnabled = false`, so it stays out. The note for `en-US` (408 characters):

```text
Tide alerts are here. Pick any saved spot and Tidepool will notify you ahead of the next high or low tide.

Also new:
• A Lock Screen widget that shows the next high tide at a glance.
• The tide chart scrolls more smoothly on long date ranges.

Fixed:
• The map pin no longer jumps to another harbour when you rotate your device.
• Tide times are no longer shown an hour early after a daylight saving change.
```

| Line in the note | Commits |
|---|---|
| Tide alerts | e9bebca |
| Lock Screen widget | 54d3444 |
| Smoother chart | 9a72212 |
| Map pin fix | 1bc978c |
| Tide times fix | 29c84c9 |

Left out: 21b6016 (flag off); 2d72cc9 and e4871f6 (reverted); 3a0ddbb (repairs the alerts added in this same range, so no user met the bug); 728aa0c, 5249aa8, 3c1afb3, e3a5568 (internal). The German note, translated from this one, came to 470 characters.

### Example 2: no tags, vague commit subjects, a second store with a 500 limit

Larder (a pantry inventory app) has no tags. The version-bump search returns:

```text
a469e17 2026-08-03 Bump version to 1.6.1
d3581b6 2026-07-02 Bump version to 1.6.0
```

`release-range.sh d3581b6 HEAD` lists six commits: `wip`, `fix crash`, `update pods`, `expiry sort`, `typo`, and the bump. Reading the diffs: `wip` and `fix crash` both touch `Larder/Scanner/BarcodeScanner.swift` and together stop a crash when camera access was denied; `expiry sort` changes the list screen and adds the string "Sort by expiry date"; `typo` only edits the README.

Note for the App Store (166 characters):

```text
You can now sort your pantry by expiry date, so what needs using up is at the top.

Fixed: the barcode scanner no longer crashes if camera access hasn't been allowed.
```

At 166 characters it is also under Google Play's 500 and names no platform, so the Android release can reuse it unchanged. Question sent back to the user: did the scanner crash ship in 1.6.0? If it was introduced and repaired between the two bumps, the "Fixed" line is dropped.

## Guidelines

- The text cannot be corrected after release without shipping a new version. Have a person read the final wording before submission.
- Never describe a change that is not in the build under review: flagged-off, reverted or unmerged work stays out even if the team is excited about it.
- A commit list is not a release note. Several commits usually become one sentence, and many become none.
- Do not invent a reason or a benefit the commits do not support ("50% faster") unless a measurement exists in the repository or from the user.
- How Apple counts emoji and combined characters against the limit is not documented; stay well below 4,000 rather than aiming at it.
- Squash merges hide detail in the body: use `%b` in the log format when subjects are thin. Monorepos need a path filter (`-- apps/ios`) on every command.
- Google Play's guidance asks that release notes inform about the update and not promote or solicit actions; drop calls to rate the app there.
- Not for a public developer changelog (keep `CHANGELOG.md` with its own conventions) and not for the first version of an app, which has no What's New field.
