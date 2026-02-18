---
name: obsidian
description: >-
  Build plugins, automate workflows, and manage knowledge bases in Obsidian. Use
  when a user asks to create Obsidian plugins, set up vault structures, automate
  note-taking workflows, build templates with Templater, write Dataview queries,
  create custom CSS themes, integrate Obsidian with external tools, build
  publishing pipelines, manage Zettelkasten or PKM systems, implement daily
  notes workflows, or extend Obsidian with community plugins. Covers plugin
  development, vault architecture, automation, and publishing.
license: Apache-2.0
compatibility: 'Node.js 18+ (plugin dev), Obsidian 1.4+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: productivity
  tags:
    - obsidian
    - knowledge-management
    - pkm
    - note-taking
    - plugins
---

# Obsidian

## Overview

Extend and automate Obsidian — the local-first knowledge management app built on plain Markdown files. This skill covers vault architecture for scalable PKM systems, plugin development (TypeScript), Dataview queries for dynamic views, Templater automation, custom CSS/themes, and publishing pipelines. Everything stays as files on disk — portable, version-controllable, and yours.

## Instructions

### Step 1: Vault Architecture

**Zettelkasten (atomic notes):**
```
vault/
├── 0-inbox/           # Capture first, organize later
├── 1-fleeting/        # Quick thoughts, raw ideas
├── 2-literature/      # Notes from sources
├── 3-permanent/       # Refined, atomic, linked notes
├── 4-projects/        # Active project folders
├── 5-areas/           # Ongoing responsibilities
├── 6-resources/       # Reference material
├── 7-archive/         # Completed/inactive items
├── templates/         # Note templates
└── attachments/       # Images, PDFs, files
```

**PARA method:** `Projects/`, `Areas/`, `Resources/`, `Archive/`, `_templates/`.

Configure `.obsidian/app.json`: set `newFileFolderPath` to inbox, `attachmentFolderPath` to attachments, enable `alwaysUpdateLinks`. Use descriptive titles for atomic notes, `YYYY-MM-DD` prefix for date-based notes.

### Step 2: Templates with Templater

Install the Templater community plugin. Place templates in `templates/`.

**Daily note** (`templates/daily.md`):
```markdown
---
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [daily]
---
# <% tp.date.now("dddd, MMMM D, YYYY") %>
## Top 3 Priorities
- [ ]
## Notes
## Completed Today
```

**Meeting note** (`templates/meeting.md`):
```markdown
---
date: <% tp.date.now("YYYY-MM-DD") %>
type: meeting
tags: [meeting]
---
# Meeting: <% tp.file.title %>
**Date:** <% tp.date.now("YYYY-MM-DD HH:mm") %>
**Attendees:**
## Agenda
## Notes
## Action Items
- [ ]
```

Configure Templater: set template folder, enable trigger on new file creation, map folder templates (e.g., `0-inbox` → `templates/inbox.md`).

### Step 3: Dataview Queries

Install the Dataview community plugin to query your vault like a database.

```dataview
-- Open tasks across vault
TASK WHERE !completed SORT file.mtime DESC LIMIT 50

-- Active projects dashboard
TABLE status, deadline, file.mtime AS "Last Modified"
FROM #project WHERE status = "active" SORT deadline ASC

-- Recently modified notes (last 7 days)
TABLE file.mtime AS "Modified" WHERE file.mtime >= date(today) - dur(7 days) SORT file.mtime DESC LIMIT 20

-- Orphan notes (no incoming links)
LIST WHERE length(file.inlinks) = 0
  AND !contains(file.path, "templates") AND !contains(file.path, "attachments")
```

**DataviewJS** for complex logic:
```dataviewjs
const pages = dv.pages('#project AND -"templates"');
const overdue = pages.where(p => p.status === "active" && p.deadline && dv.date(p.deadline) < dv.date("today"));
dv.header(3, `Overdue Projects (${overdue.length})`);
dv.table(["Project", "Deadline", "Days Overdue"],
  overdue.map(p => [p.file.link, p.deadline, Math.floor((Date.now() - new Date(p.deadline)) / 86400000)])
);
```

### Step 4: Plugin Development

```bash
git clone https://github.com/obsidianmd/obsidian-sample-plugin my-plugin
cd my-plugin && npm install
```

**Basic plugin** (`main.ts`):
```typescript
import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, MarkdownView } from "obsidian";

interface MyPluginSettings { defaultFolder: string; enableFeature: boolean; }
const DEFAULT_SETTINGS: MyPluginSettings = { defaultFolder: "inbox", enableFeature: true };

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();
    this.addRibbonIcon("dice", "My Plugin", () => new Notice("Hello from My Plugin!"));
    this.addCommand({ id: "do-something", name: "Do something useful", callback: () => this.doSomething() });
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.extension === "md") console.log(`New: ${file.path}`);
    }));
    this.addSettingTab(new MyPluginSettingTab(this.app, this));
  }

  async doSomething() {
    const file = this.app.workspace.getActiveFile();
    if (!file) { new Notice("No active file"); return; }
    const content = await this.app.vault.read(file);
    await this.app.vault.modify(file, content + "\n\n---\nProcessed by My Plugin");
    new Notice("Done!");
  }

  async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
  async saveSettings() { await this.saveData(this.settings); }
}

class MyPluginSettingTab extends PluginSettingTab {
  plugin: MyPlugin;
  constructor(app: App, plugin: MyPlugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Default folder").addText((t) =>
      t.setValue(this.plugin.settings.defaultFolder).onChange(async (v) => {
        this.plugin.settings.defaultFolder = v; await this.plugin.saveSettings();
      }));
  }
}
```

Build: `npm run dev` — copy `main.js`, `manifest.json`, `styles.css` to `vault/.obsidian/plugins/my-plugin/`.

### Step 5: CSS Snippets & Themes

Place in `vault/.obsidian/snippets/my-theme.css`, enable in Settings → Appearance.

```css
.markdown-rendered h1 { color: var(--text-accent); border-bottom: 2px solid var(--interactive-accent); }
.markdown-source-view.mod-cm6 .cm-contentContainer { max-width: 800px; margin: 0 auto; }
.callout[data-callout="goal"] { --callout-color: 59, 130, 246; --callout-icon: target; }
.tag { background: var(--interactive-accent); color: var(--text-on-accent); border-radius: 12px; padding: 2px 8px; }
```

### Step 6: Automation & Integration

**Obsidian URI scheme:**
```
obsidian://open?vault=MyVault&file=path/to/note
obsidian://new?vault=MyVault&file=inbox/New Note&content=Hello
```

**Git sync** (`.gitignore` for vault):
```
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/plugins/*/data.json
.trash/
```

Auto-commit: `*/30 * * * * cd /path/to/vault && git add -A && git diff --cached --quiet || git commit -m "backup $(date +%Y-%m-%d_%H:%M)" && git push`

**Local REST API plugin** (programmatic access on port 27123):
```bash
curl http://localhost:27123/vault/projects/my-project.md -H "Authorization: Bearer KEY"
curl -X PUT http://localhost:27123/vault/inbox/new-note.md -H "Authorization: Bearer KEY" \
  -H "Content-Type: text/markdown" -d "# New Note\n\nContent here"
```

**Publishing with Quartz:**
```bash
npx quartz create && npx quartz build --serve && npx quartz sync
```

## Examples

### Example 1: Full PKM vault setup with daily notes workflow

**User prompt:** "Set up a Zettelkasten vault for my team's knowledge base. I need a daily notes template with priorities and meeting links, a project template with status tracking, Dataview queries for an active projects dashboard and orphan note finder, and Git auto-sync every 30 minutes."

The agent will create the folder structure (0-inbox through 7-archive plus templates and attachments), write a daily note Templater template with date frontmatter, priority checkboxes, and a meetings section, create a project template with status/deadline fields, add Dataview queries to a dashboard note (active projects table sorted by deadline, orphan notes list), set up `.gitignore` to exclude workspace and plugin data files, and create a cron-based auto-commit script that runs every 30 minutes.

### Example 2: Custom plugin for automated link suggestions

**User prompt:** "Build an Obsidian plugin that adds a command to show related notes based on shared tags. When I run the command, it should find the top 5 notes that share the most tags with the current note and display them in a notice."

The agent will scaffold a plugin from the sample template, implement an `onload` method that registers a command called "Show related notes". The command handler will read the active file's frontmatter tags via `metadataCache`, iterate over all markdown files in the vault, score each by counting overlapping tags, sort by score descending, take the top 5 results, and display their names and shared tag count in an Obsidian Notice popup.

## Guidelines

- **Keep atomic notes short and linked** — each permanent note should capture a single idea with links to related notes; this makes the vault scale without becoming a disorganized dump.
- **Use frontmatter consistently** — always include `date`, `tags`, and `status` fields so Dataview queries work reliably across the entire vault.
- **Test plugins in a separate vault** — use a dedicated test vault during development to avoid corrupting your real notes; symlink the plugin output folder for fast iteration.
- **Avoid deeply nested folders** — rely on links, tags, and Dataview over folder hierarchy; deep nesting makes notes harder to find and reduces the value of the graph view.
- **Pin Obsidian and plugin versions in shared vaults** — when multiple people use the same vault via Git, document the required Obsidian version and plugin versions to prevent compatibility issues.
- **Back up `.obsidian/plugins` selectively** — commit `manifest.json` and `main.js` for essential plugins but exclude `data.json` files that contain user-specific settings.
