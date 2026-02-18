---
title: Build a Personal Knowledge Base with Obsidian
slug: build-personal-knowledge-base-with-obsidian
description: "Design an Obsidian vault with linked notes, Dataview dashboards, Templater automation, spaced repetition, and a publishing pipeline for a developer knowledge base."
category: productivity
skills: [obsidian]
tags: [obsidian, knowledge-management, pkm, dataview, templater, automation]
---

# Build a Personal Knowledge Base with Obsidian

## The Problem

Marta is a senior developer who reads 30+ articles per week, takes meeting notes daily, and manages three side projects. Her notes are scattered across Google Docs, Apple Notes, Notion, and random text files. She can never find anything when she needs it and wants a single, local-first knowledge system that links ideas together and surfaces insights automatically.

## The Solution

Use the **obsidian** skill to scaffold a complete PKM system: a Zettelkasten-inspired vault with numbered folders, Templater-powered templates for every note type, Dataview dashboards that surface tasks and orphan notes, automated inbox processing, a custom plugin for tag suggestions and note health scoring, and git-based backup on a cron schedule.

## Step-by-Step Walkthrough

### Step 1: Define the Vault Structure

Create a directory tree with numbered prefixes for sort order. Everything starts in the inbox and gets triaged into the correct area.

```bash
# Create the full vault directory structure
mkdir -p vault/{00-inbox,01-daily,02-meetings,03-projects,04-learning/{articles,books,courses}}
mkdir -p vault/{05-people,06-snippets,07-areas,08-archive}
mkdir -p vault/{_templates,_dashboards,_attachments,_scripts}
mkdir -p vault/.obsidian/snippets
```

Configure Obsidian to route new files and attachments to the right places.

```json
{
  "newFileLocation": "folder",
  "newFileFolderPath": "00-inbox",
  "attachmentFolderPath": "_attachments",
  "alwaysUpdateLinks": true,
  "defaultViewMode": "source"
}
```

### Step 2: Create Templates for Every Note Type

The daily note template links to previous/next days and auto-lists scheduled meetings using Templater.

```markdown
<!-- _templates/daily.md -->
---
date: <% tp.date.now("YYYY-MM-DD") %>
type: daily
tags: [daily]
---
# <% tp.date.now("dddd, MMMM D, YYYY") %>
<< [[<% tp.date.now("YYYY-MM-DD", -1) %>]] | [[<% tp.date.now("YYYY-MM-DD", 1) %>]] >>

## Top 3 Priorities
- [ ]
- [ ]
- [ ]

## Today's Schedule
<%*
// Auto-list meetings scheduled for today
const meetings = app.vault.getMarkdownFiles()
  .filter(f => f.path.startsWith("02-meetings/") &&
    f.basename.startsWith(tp.date.now("YYYY-MM-DD")));
if (meetings.length > 0) {
  for (const m of meetings) { tR += `- [[${m.basename}]]\n`; }
} else { tR += "- No meetings scheduled\n"; }
%>

## Notes

## Reflection
**What went well?**
**What could improve?**
```

The meeting template prompts for attendees and auto-links them to people notes.

```markdown
<!-- _templates/meeting.md -->
---
date: <% tp.date.now("YYYY-MM-DD") %>
type: meeting
attendees: []
tags: [meeting]
---
# <% tp.file.title %>
**Attendees:** <%* const a = await tp.system.prompt("Attendees (comma-separated)"); if (a) { tR += a.split(",").map(n => `[[${n.trim()}]]`).join(", "); } %>

## Discussion Notes

## Action Items
- [ ] @person — task — due: YYYY-MM-DD
```

The literature note separates the author's ideas from your own reactions, critical for Zettelkasten. It includes sections for summary, key ideas, personal thoughts, and connections to existing notes -- all with `status: unread` and `to-process` tag so it appears in dashboards.

Additional templates follow the same pattern: **project.md** (goal, tasks, status log), **person.md** (company, role, meeting history via Dataview query), and **snippet.md** (language, use case, code block).

### Step 3: Build the Dataview Home Dashboard

The home dashboard uses Dataview queries to surface tasks, meetings, inbox items, active projects, reading list, and orphan notes.

````markdown
<!-- _dashboards/home.md -->
---
type: dashboard
tags: [dashboard, pinned]
---
# Home Dashboard

## Today's Tasks
```dataview
TASK
WHERE !completed AND (
  contains(file.path, "01-daily") OR
  contains(file.path, "03-projects")
)
SORT file.mtime DESC
LIMIT 30
```

## This Week's Meetings
```dataview
TABLE date, attendees, project
FROM #meeting
WHERE date >= date(today) - dur(1 day) AND date <= date(today) + dur(7 days)
SORT date ASC
```

## Inbox (needs processing)
```dataview
TABLE file.ctime AS "Added"
FROM "00-inbox"
SORT file.ctime DESC
```

## Active Projects
```dataview
TABLE status, deadline, file.mtime AS "Last Updated"
FROM #project WHERE status = "active"
SORT deadline ASC
```

## Orphan Notes (no incoming links)
```dataviewjs
const orphans = dv.pages()
  .where(p => p.file.inlinks.length === 0 && !p.file.path.startsWith("_"))
  .sort(p => p.file.ctime, "desc").limit(10);
dv.table(["Note", "Created"], orphans.map(p => [p.file.link, p.file.ctime]));
```
````

### Step 4: Set Up Automated Workflows

Configure Templater's startup script to auto-create today's daily note when the vault opens.

```javascript
// _templates/startup.js — Runs via Templater startup config
const today = tp.date.now("YYYY-MM-DD");
const existing = tp.file.find_tfile(today);
if (!existing) {
  const template = tp.file.find_tfile("daily");
  if (template) await tp.file.create_new(template, today, false, "01-daily");
}
// Open today's daily note
const todayFile = tp.file.find_tfile(today);
if (todayFile) await app.workspace.openLinkText(todayFile.path, "", false);
```

Create an inbox processor that auto-moves notes based on their frontmatter type.

```javascript
// _scripts/process-inbox.js — Register as a Templater user function
module.exports = async (tp) => {
  const inbox = app.vault.getMarkdownFiles()
    .filter(f => f.path.startsWith("00-inbox/"));
  const destinations = {
    literature: "04-learning/articles",
    meeting: "02-meetings",
    project: "03-projects",
    person: "05-people",
    snippet: "06-snippets",
  };
  for (const file of inbox) {
    const type = app.metadataCache.getFileCache(file)?.frontmatter?.type;
    if (type && destinations[type])
      await app.vault.rename(file, `${destinations[type]}/${file.name}`);
  }
  new Notice(`Processed ${inbox.length} inbox items`);
};
```

### Step 5: Build the Note Health Plugin

Create a custom plugin that suggests tags based on content keywords, finds related notes via shared tags, and scores note health (links, tags, recency). The plugin registers three commands and a status bar indicator.

```json
{
  "id": "note-health",
  "name": "Note Health",
  "version": "1.0.0",
  "minAppVersion": "1.4.0",
  "description": "Auto-suggest tags, show related notes, and score note health"
}
```

```typescript
// main.ts — Key sections of the plugin
import { Plugin, TFile, Notice } from "obsidian";

// Maps content keywords to suggested tags
const KEYWORD_TAG_MAP: Record<string, string[]> = {
  react: ["frontend", "react"],
  typescript: ["typescript", "programming"],
  docker: ["docker", "devops"],
  kubernetes: ["kubernetes", "devops"],
  api: ["api", "backend"],
  aws: ["aws", "cloud"],
  "machine learning": ["ml", "ai"],
};

export default class NoteHealthPlugin extends Plugin {
  async onload() {
    this.addCommand({ id: "suggest-tags", name: "Suggest tags for current note",
      callback: () => this.suggestTags() });
    this.addCommand({ id: "show-related", name: "Show related notes",
      callback: () => this.showRelated() });
    this.addCommand({ id: "show-health", name: "Show note health score",
      callback: () => this.showHealth() });

    // Live health score in status bar
    const statusBar = this.addStatusBarItem();
    this.registerEvent(this.app.workspace.on("active-leaf-change", async () => {
      const file = this.app.workspace.getActiveFile();
      if (file) { const h = await this.calculateHealth(file);
        statusBar.setText(`Health: ${h.score}/100`); }
    }));
  }

  // Scans note content for keywords, suggests new tags, writes to frontmatter
  async suggestTags() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    const content = (await this.app.vault.read(file)).toLowerCase();
    const existing = (this.app.metadataCache.getFileCache(file)
      ?.frontmatter?.tags || []).map((t: string) => t.toLowerCase());
    const suggested = new Set<string>();
    for (const [kw, tags] of Object.entries(KEYWORD_TAG_MAP)) {
      if (content.includes(kw)) tags.forEach(t => {
        if (!existing.includes(t)) suggested.add(t); });
    }
    if (suggested.size === 0) { new Notice("No new suggestions"); return; }
    // Update frontmatter tags array with new suggestions
    const raw = await this.app.vault.read(file);
    const newTags = [...existing, ...suggested];
    const tagLine = `tags: [${[...newTags].join(", ")}]`;
    const updated = raw.replace(/tags:.*/, tagLine);
    await this.app.vault.modify(file, updated);
    new Notice(`Added tags: ${[...suggested].join(", ")}`);
  }

  // Scores other notes by shared tags + mutual links, appends top 8 as links
  async showRelated() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    const meta = this.app.metadataCache.getFileCache(file);
    const tags = meta?.frontmatter?.tags || [];
    const links = (meta?.links || []).map(l => l.link);
    const scored = this.app.vault.getMarkdownFiles()
      .filter(f => f.path !== file.path).map(f => {
        const fm = this.app.metadataCache.getFileCache(f);
        const shared = tags.filter((t: string) => (fm?.frontmatter?.tags || []).includes(t)).length;
        return { file: f, score: shared * 2 + (links.includes(f.basename) ? 2 : 0) };
      }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
    if (scored.length === 0) return;
    const content = await this.app.vault.read(file);
    const cleaned = content.replace(/\n---\n## Related Notes[\s\S]*$/, "");
    const section = scored.map(s => `- [[${s.file.basename}]] (${s.score})`).join("\n");
    await this.app.vault.modify(file, cleaned + "\n\n---\n## Related Notes\n" + section);
  }

  // Scores note health 0-100 based on links, tags, and recency
  async calculateHealth(file: TFile) {
    const meta = this.app.metadataCache.getFileCache(file);
    const links = meta?.links || [];
    const tags = meta?.frontmatter?.tags || [];
    const daysSince = (Date.now() - file.stat.mtime) / 86400000;
    let score = (links.length > 0 ? 25 : 0) + (tags.length > 0 ? 20 : 0)
      + (daysSince < 30 ? 15 : 0) + Math.min(links.length * 5, 20);
    return { score: Math.min(score, 100), linkCount: links.length,
      tagCount: tags.length, hasRecentUpdate: daysSince < 30 };
  }

  async showHealth() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    const h = await this.calculateHealth(file);
    new Notice(`Health: ${h.score}/100 | Links: ${h.linkCount} | Tags: ${h.tagCount}`, 8000);
  }
}
```

### Step 6: Configure Git Backup

Set up automatic commits every 30 minutes so the vault is always backed up.

```bash
#!/bin/bash
# vault-sync.sh — Auto-commit and push vault changes
VAULT_PATH="$HOME/Documents/vault"
cd "$VAULT_PATH" || exit 1
git add -A
if ! git diff --cached --quiet; then
  CHANGED=$(git diff --cached --stat | tail -1)
  git commit -m "vault sync: $(date +%Y-%m-%d_%H:%M) — $CHANGED"
  git push origin main 2>/dev/null || echo "Push failed — will retry"
fi
```

```bash
# One-time setup
cd ~/Documents/vault
git init
git remote add origin git@github.com:youruser/vault-backup.git
git add -A && git commit -m "initial vault backup" && git push -u origin main

# Schedule the cron job (every 30 minutes)
chmod +x vault-sync.sh
crontab -l | { cat; echo "*/30 * * * * /path/to/vault-sync.sh >> /tmp/vault-sync.log 2>&1"; } | crontab -
```

## Real-World Example

Marta sets up the vault on a Sunday afternoon. She copies the directory structure, drops in the templates, installs the Dataview and Templater community plugins, and pastes the dashboard into `_dashboards/home.md`.

On Monday morning she opens Obsidian. The startup script fires and creates `01-daily/2025-04-14.md` with linked navigation and empty priority slots. At 10am she creates a meeting note -- Templater prompts for attendees, she types "Alex Chen, Priya Patel", and the template generates `[[Alex Chen]]` and `[[Priya Patel]]` links automatically. She clicks the unresolved Alex link and creates his people note from the template.

Over the week she drops six articles into `00-inbox/` with the literature template. On Friday she runs the inbox processor, which moves the typed notes to `04-learning/articles/` automatically.

She opens the home dashboard and sees: four open tasks, two meetings this week, three unfinished articles, and one orphan note that needs linking. She runs the Note Health plugin on a Kubernetes article -- it adds `kubernetes` and `devops` tags automatically and finds two related DevOps notes.

After a week, her weekly review template pulls in all seven daily notes and lists carried-over tasks. The git cron has been silently committing every 30 minutes -- she checks the log and sees 42 commits, each with a summary of changed files.
