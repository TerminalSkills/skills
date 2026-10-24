---
title: Build a Personal Knowledge Base with Obsidian
slug: build-personal-knowledge-base-with-obsidian
description: "Design an Obsidian vault with linked notes, Dataview dashboards, Templater automation, a small custom plugin, and git backup for a developer knowledge base."
category: productivity
skills: [obsidian]
tags: [obsidian, knowledge-management, pkm, dataview, templater, automation]
---

# Build a Personal Knowledge Base with Obsidian

## The Problem

Marta is a senior developer who reads 30+ articles per week, takes meeting notes daily, and manages three side projects. Her notes are scattered across Google Docs, Apple Notes, Notion, and random text files. She can never find anything when she needs it and wants a single, local-first knowledge system that links ideas together and surfaces insights automatically.

## The Solution

Use the **obsidian** skill to scaffold a complete PKM system: a Zettelkasten-inspired vault with numbered folders, Templater-powered templates for every note type, Dataview dashboards that surface tasks and orphan notes, a script that files inbox notes by type, a small custom plugin for tag suggestions and note health scoring, and a git backup on a cron schedule.

The templates and dashboards need two community plugins, **Templater** and **Dataview**. Install both from Settings, Community plugins, Browse. Obsidian asks you to turn off Restricted mode first, because community plugins run code with access to your vault.

## Step-by-Step Walkthrough

### Step 1: Define the Vault Structure

Create a directory tree with numbered prefixes for sort order. Everything starts in the inbox and gets triaged into the correct area.

```bash
mkdir -p vault/{00-inbox,01-daily,02-meetings,03-projects,04-learning/{articles,books,courses}}
mkdir -p vault/{05-people,06-snippets,07-areas,08-archive}
mkdir -p vault/{_templates,_dashboards,_attachments,_scripts}
```

Then open `vault/` as a vault in Obsidian and set, under Settings, Files and links:

- **Default location for new notes**: "In the folder specified below", `00-inbox`
- **Default location for new attachments**: "In the folder specified below", `_attachments`

In Templater's settings, set **Template folder location** to `_templates` and **User scripts folder** to `_scripts`, and turn on **Trigger Templater on new file creation** so templates are filled in when a note is created.

### Step 2: Create Templates for Every Note Type

The daily note template links to previous and next days and auto-lists meetings using Templater. Save it as `_templates/daily.md`:

```markdown
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

## Today's Meetings
<%*
const today = tp.date.now("YYYY-MM-DD");
const meetings = app.vault.getMarkdownFiles()
  .filter(f => f.path.startsWith("02-meetings/") && f.basename.startsWith(today));
tR += meetings.length
  ? meetings.map(m => `- [[${m.basename}]]`).join("\n") + "\n"
  : "- No meetings scheduled\n";
%>

## Notes
```

Wire it up with the core **Daily notes** plugin: in its options set **New file location** to `01-daily` and **Template file location** to `_templates/daily`. Because Templater triggers on new files, the commands are filled in when the daily note is created. Obsidian's "Open today's daily note" command, or a hotkey on it, opens or creates today's note.

The meeting template, `_templates/meeting.md`, prompts for attendees and links them to people notes. The `Attendees::` line is a Dataview inline field, which is what lets the dashboard show an `attendees` column:

```markdown
---
date: <% tp.date.now("YYYY-MM-DD") %>
type: meeting
tags: [meeting]
---
# <% tp.file.title %>
Attendees:: <%* const a = await tp.system.prompt("Attendees (comma-separated)"); if (a) { tR += a.split(",").map(n => `[[${n.trim()}]]`).join(", "); } %>

## Discussion Notes

## Action Items
- [ ] @person: task, due YYYY-MM-DD
```

Give every other template a `type:` property (`literature`, `project`, `person`, `snippet`), because the inbox script in Step 4 files notes by it. The literature template keeps the author's ideas apart from your own reactions, with sections for summary, key ideas, personal thoughts and connections, and `status: unread` so it shows up in dashboards. The project template needs `type: project`, `status: active` and a `deadline: YYYY-MM-DD` property for the Active Projects table in Step 3. The person and snippet templates follow the same pattern.

Name meeting notes `YYYY-MM-DD Topic` so the daily template can find them.

### Step 3: Build the Dataview Home Dashboard

Save this as `_dashboards/home.md`. It surfaces tasks, meetings, inbox items, active projects and orphan notes.

````markdown
# Home Dashboard
## Open Tasks
```dataview
TASK
WHERE !completed AND (contains(file.path, "01-daily") OR contains(file.path, "03-projects"))
SORT file.mtime DESC
LIMIT 30
```

## This Week's Meetings
```dataview
TABLE date, attendees
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
FROM #project
WHERE status = "active"
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

The last block is `dataviewjs`, which runs JavaScript, so it only renders while Dataview's JavaScript queries setting is enabled.

### Step 4: File the Inbox Automatically

Templater loads every `.js` file in the user scripts folder as a CommonJS module, and the file name becomes the function name: `_scripts/process_inbox.js` is called as `tp.user.process_inbox()`. Use an underscore in the name, not a hyphen. Scripts can use the global `app` but not `tp`, which is why this one does not take it.

```javascript
module.exports = async () => {
  const destinations = {
    literature: "04-learning/articles",
    meeting: "02-meetings",
    project: "03-projects",
    person: "05-people",
    snippet: "06-snippets",
  };
  let moved = 0;
  const inbox = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith("00-inbox/"));
  for (const file of inbox) {
    const type = app.metadataCache.getFileCache(file)?.frontmatter?.type;
    if (destinations[type]) {
      await app.fileManager.renameFile(file, `${destinations[type]}/${file.name}`);
      moved++;
    }
  }
  return `Moved ${moved} of ${inbox.length} inbox notes`;
};
```

Call it from a template. Create `_templates/run-inbox.md` containing one line, then bind a hotkey to its Templater "Insert" command (Templater settings, Template hotkeys):

```markdown
<%* tR += await tp.user.process_inbox() %>
```

Notes are moved with `fileManager.renameFile`, so links to them are updated.

### Step 5: Build the Note Health Plugin

A custom plugin can add what the community plugins do not: suggested tags from content keywords and a health score for each note. Start from the official sample plugin, then replace its `main.ts` and `manifest.json`:

```bash
git clone https://github.com/obsidianmd/obsidian-sample-plugin vault/.obsidian/plugins/note-health
cd vault/.obsidian/plugins/note-health && npm install
```

```json
{
  "id": "note-health",
  "name": "Note Health",
  "version": "1.0.0",
  "minAppVersion": "1.4.4",
  "description": "Suggest tags from content and score note health",
  "author": "Marta",
  "isDesktopOnly": false
}
```

```typescript
import { Plugin, TFile, Notice } from "obsidian";

// Maps content keywords to suggested tags
const KEYWORD_TAGS: Record<string, string[]> = {
  react: ["frontend", "react"],
  docker: ["docker", "devops"],
  kubernetes: ["kubernetes", "devops"],
  "machine learning": ["ml", "ai"],
};

export default class NoteHealthPlugin extends Plugin {
  async onload() {
    this.addCommand({ id: "suggest-tags", name: "Suggest tags for current note",
      callback: () => this.suggestTags() });
    this.addCommand({ id: "show-health", name: "Show note health score",
      callback: () => this.showHealth() });
  }

  // Scans the note for keywords and adds the matching tags to its frontmatter
  async suggestTags() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    const content = (await this.app.vault.cachedRead(file)).toLowerCase();
    const added: string[] = [];
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const tags: string[] = Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [];
      for (const [keyword, suggestions] of Object.entries(KEYWORD_TAGS)) {
        if (!content.includes(keyword)) continue;
        for (const tag of suggestions) {
          if (!tags.includes(tag)) { tags.push(tag); added.push(tag); }
        }
      }
      fm.tags = tags;
    });
    new Notice(added.length ? `Added tags: ${added.join(", ")}` : "No new suggestions");
  }

  // Scores a note 0-100 from outgoing links, tags and recency
  health(file: TFile) {
    const cache = this.app.metadataCache.getFileCache(file);
    const links = cache?.links?.length ?? 0;
    const raw = cache?.frontmatter?.tags;
    const tags = Array.isArray(raw) ? raw.length : raw ? 1 : 0;
    const days = (Date.now() - file.stat.mtime) / 86400000;
    const score = (links > 0 ? 30 : 0) + Math.min(links * 5, 20) + (tags > 0 ? 30 : 0) + (days < 30 ? 20 : 0);
    return { score, links, tags };
  }

  showHealth() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    const h = this.health(file);
    new Notice(`Health: ${h.score}/100 | Links: ${h.links} | Tags: ${h.tags}`, 8000);
  }
}
```

Run `npm run build` to produce `main.js`, then enable **Note Health** under Settings, Community plugins. The tag command edits the note's frontmatter through `processFrontMatter`, which is available from Obsidian 1.4.4, so it never rewrites YAML by hand.

### Step 6: Configure Git Backup

Commit the vault every 30 minutes so a bad edit or a sync accident is always recoverable. Add `.obsidian/workspace.json` to `.gitignore` first, since it changes on every click.

```bash
#!/bin/bash
# vault-sync.sh: commit and push vault changes
cd "$HOME/Documents/vault" || exit 1
git add -A
if ! git diff --cached --quiet; then
  git commit -m "vault sync: $(date +%Y-%m-%d_%H:%M)"
  git push origin main || echo "Push failed, will retry next run"
fi
```

```bash
cd ~/Documents/vault || exit 1
git init -b main
git remote add origin git@github.com:youruser/vault-backup.git
echo ".obsidian/workspace.json" >> .gitignore
git add -A && git commit -m "initial vault backup" && git push -u origin main

chmod +x ~/Documents/vault-sync.sh
( crontab -l 2>/dev/null; echo "*/30 * * * * $HOME/Documents/vault-sync.sh >> $HOME/vault-sync.log 2>&1" ) | crontab -
```

Keep the remote repository private: a vault holds meeting notes and personal reflections. The Obsidian Git community plugin does the same job without cron if you prefer to stay inside the app.

## Real-World Example

Marta sets up the vault on a Sunday afternoon. She creates the directory structure, drops in the templates, installs Dataview and Templater, and pastes the dashboard into `_dashboards/home.md`.

On Monday morning she runs "Open today's daily note" and gets `01-daily/2026-10-26.md` with linked navigation and empty priority slots. At 10am she creates a meeting note. Templater prompts for attendees, she types "Alex Chen, Priya Patel", and the template generates `[[Alex Chen]]` and `[[Priya Patel]]` links. She clicks the unresolved Alex link and creates his people note from the template.

Over the week she drops six articles into `00-inbox/` with the literature template. On Friday she presses the inbox hotkey, and the typed notes move to `04-learning/articles/`.

She opens the home dashboard and sees her open tasks, the week's meetings, the unfinished articles and one orphan note that needs linking. She runs the Note Health command on a Kubernetes article: it adds the `kubernetes` and `devops` tags and reports a health score. By the end of the week the backup log shows a commit for every half hour in which she changed something.

## Related Skills

- [obsidian](../skills/obsidian/SKILL.md): vault structure, templates, Dataview and plugin development
