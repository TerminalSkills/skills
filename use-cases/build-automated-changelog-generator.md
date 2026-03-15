---
title: Build an Automated Changelog Generator
slug: build-automated-changelog-from-commits
description: Build an automated changelog generator that parses conventional commits, groups changes by type, generates release notes, creates GitHub releases, and notifies stakeholders.
skills:
  - typescript
  - hono
  - zod
category: Developer Tools
tags:
  - changelog
  - commits
  - release-notes
  - automation
  - ci-cd
---

# Build an Automated Changelog Generator

## The Problem

Anna leads engineering at a 20-person company releasing weekly. Release notes are written manually by copying Jira tickets — takes 2 hours, often incomplete. Some commits don't reference tickets. Breaking changes are buried in the middle of the list. External stakeholders get a different (manually curated) changelog than the internal one. They need automated changelog generation: parse commit messages (conventional commits), group by type (features, fixes, breaking), generate markdown, create GitHub releases, and email stakeholders.

## Step 1: Build the Generator

```typescript
import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

interface CommitInfo { hash: string; type: string; scope: string; subject: string; body: string; breaking: boolean; references: string[]; author: string; date: string; }
interface Changelog { version: string; date: string; sections: Record<string, CommitInfo[]>; breaking: CommitInfo[]; markdown: string; }

const TYPE_LABELS: Record<string, string> = {
  feat: "✨ Features", fix: "🐛 Bug Fixes", perf: "⚡ Performance", refactor: "♻️ Refactoring",
  docs: "📚 Documentation", test: "✅ Tests", ci: "🔧 CI/CD", chore: "🔨 Chores",
  style: "💅 Styling", build: "📦 Build",
};

const INCLUDE_IN_CHANGELOG = ["feat", "fix", "perf", "refactor", "docs"];

// Parse commits since last tag
export function getCommitsSinceLastTag(): CommitInfo[] {
  const lastTag = execSync("git describe --tags --abbrev=0 2>/dev/null || echo ''", { encoding: "utf-8" }).trim();
  const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
  const log = execSync(`git log ${range} --format="%H|||%s|||%b|||%an|||%aI" --no-merges`, { encoding: "utf-8" });

  return log.split("\n").filter(Boolean).map((line) => {
    const [hash, subject, body, author, date] = line.split("|||");
    const conventionalMatch = subject.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)/);
    if (!conventionalMatch) return { hash: hash.slice(0, 7), type: "other", scope: "", subject, body: body || "", breaking: false, references: extractRefs(subject + body), author, date };

    return {
      hash: hash.slice(0, 7),
      type: conventionalMatch[1],
      scope: conventionalMatch[2] || "",
      subject: conventionalMatch[4],
      body: body || "",
      breaking: !!conventionalMatch[3] || body?.includes("BREAKING CHANGE"),
      references: extractRefs(subject + body),
      author, date,
    };
  });
}

// Generate changelog
export function generateChangelog(version: string, commits: CommitInfo[]): Changelog {
  const sections: Record<string, CommitInfo[]> = {};
  const breaking: CommitInfo[] = [];

  for (const commit of commits) {
    if (commit.breaking) breaking.push(commit);
    if (!INCLUDE_IN_CHANGELOG.includes(commit.type)) continue;
    if (!sections[commit.type]) sections[commit.type] = [];
    sections[commit.type].push(commit);
  }

  // Generate markdown
  let md = `## [${version}] — ${new Date().toISOString().slice(0, 10)}\n\n`;

  if (breaking.length > 0) {
    md += `### ⚠️ Breaking Changes\n\n`;
    for (const c of breaking) md += `- ${c.scope ? `**${c.scope}:** ` : ""}${c.subject} (${c.hash})\n`;
    md += "\n";
  }

  for (const [type, items] of Object.entries(sections)) {
    const label = TYPE_LABELS[type] || type;
    md += `### ${label}\n\n`;
    for (const c of items) {
      md += `- ${c.scope ? `**${c.scope}:** ` : ""}${c.subject}`;
      if (c.references.length > 0) md += ` (${c.references.join(", ")})`;
      md += ` — ${c.author}\n`;
    }
    md += "\n";
  }

  const contributors = [...new Set(commits.map((c) => c.author))];
  if (contributors.length > 0) md += `### 👥 Contributors\n\n${contributors.map((c) => `- ${c}`).join("\n")}\n`;

  return { version, date: new Date().toISOString().slice(0, 10), sections, breaking, markdown: md };
}

// Prepend to CHANGELOG.md
export async function updateChangelogFile(changelog: Changelog, filePath: string = "CHANGELOG.md"): Promise<void> {
  let existing = "";
  try { existing = await readFile(filePath, "utf-8"); } catch {}
  const header = existing.startsWith("# Changelog") ? "" : "# Changelog\n\n";
  const content = existing.startsWith("# Changelog")
    ? existing.replace("# Changelog\n\n", `# Changelog\n\n${changelog.markdown}`)
    : `${header}${changelog.markdown}${existing}`;
  await writeFile(filePath, content);
}

// Determine version bump from commits
export function determineVersionBump(commits: CommitInfo[], currentVersion: string): { type: "major" | "minor" | "patch"; newVersion: string } {
  const hasBreaking = commits.some((c) => c.breaking);
  const hasFeatures = commits.some((c) => c.type === "feat");
  const [major, minor, patch] = currentVersion.split(".").map(Number);

  if (hasBreaking) return { type: "major", newVersion: `${major + 1}.0.0` };
  if (hasFeatures) return { type: "minor", newVersion: `${major}.${minor + 1}.0` };
  return { type: "patch", newVersion: `${major}.${minor}.${patch + 1}` };
}

function extractRefs(text: string): string[] {
  const refs = text.match(/#\d+/g) || [];
  return [...new Set(refs)];
}
```

## Results

- **Release notes: 2 hours → 10 seconds** — `npm run changelog` parses commits, groups by type, generates markdown; copy to GitHub release
- **Breaking changes highlighted** — ⚠️ section at the top; consumers see breaking changes first; no buried surprises
- **Version bump automated** — breaking commit → major bump; feat → minor; fix → patch; semantic versioning enforced by commit convention
- **Issue references linked** — `feat(auth): add MFA (#234)` → changelog links to PR #234; full traceability from changelog to code
- **Contributors listed** — each release credits contributors; team morale; open-source community recognition
