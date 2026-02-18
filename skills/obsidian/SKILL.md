---
name: obsidian
description: >-
  Build plugins, automate workflows, and manage knowledge bases in Obsidian.
  Use when a user asks to create Obsidian plugins, set up vault structures,
  automate note-taking workflows, build templates with Templater, write
  Dataview queries, create custom CSS themes, integrate Obsidian with external
  tools, build publishing pipelines, manage Zettelkasten or PKM systems,
  implement daily notes workflows, or extend Obsidian with community plugins.
  Covers plugin development, vault architecture, automation, and publishing.
license: Apache-2.0
compatibility: "Node.js 18+ (plugin dev), Obsidian 1.4+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: ["obsidian", "knowledge-management", "pkm", "note-taking", "plugins", "markdown"]
---

# Obsidian

## Overview

Extend and automate Obsidian — the local-first knowledge management app built on plain Markdown files. This skill covers vault architecture for scalable PKM systems, plugin development (TypeScript), Dataview queries for dynamic views, Templater automation, custom CSS/themes, and publishing pipelines. Everything stays as files on disk — portable, version-controllable, and yours.

## Instructions

### Step 1: Vault Architecture

Design a vault structure based on the user's needs. Common patterns:

**Zettelkasten (atomic notes):**
```
vault/
├── 0-inbox/           # Capture first, organize later
├── 1-fleeting/        # Quick thoughts, raw ideas
├── 2-literature/      # Notes from sources (books, articles, papers)
├── 3-permanent/       # Refined, atomic, linked notes
├── 4-projects/        # Active project folders
├── 5-areas/           # Ongoing responsibilities (health, finance, work)
├── 6-resources/       # Reference material, how-tos
├── 7-archive/         # Completed/inactive items
├── templates/         # Note templates
└── attachments/       # Images, PDFs, files
```

**PARA method:**
```
vault/
├── Projects/       # Active projects with deadlines
├── Areas/          # Ongoing areas of responsibility
├── Resources/      # Topics of interest, reference
├── Archive/        # Completed/inactive
└── _templates/
```

**Configure `.obsidian/app.json`** for consistency:
```json
{
  "newFileLocation": "folder",
  "newFileFolderPath": "0-inbox",
  "attachmentFolderPath": "attachments",
  "alwaysUpdateLinks": true,
  "strictLineBreaks": true
}
```

**Naming conventions:**
- Atomic notes: descriptive titles (`Spaced repetition improves long-term retention.md`)
- Date-based: `YYYY-MM-DD` prefix for daily/meeting notes
- No special characters in filenames (cross-platform compatibility)

### Step 2: Templates with Templater

Install the Templater community plugin. Create templates in the `templates/` folder.

**Daily note template** (`templates/daily.md`):
```markdown
---
date: <% tp.date.now("YYYY-MM-DD") %>
tags: [daily]
---

# <% tp.date.now("dddd, MMMM D, YYYY") %>

## 🎯 Top 3 Priorities
- [ ] 
- [ ] 
- [ ] 

## 📝 Notes


## 📅 Meetings
<%* const meetings = tp.obsidian.app.vault.getAbstractFileByPath(`meetings/${tp.date.now("YYYY-MM-DD")}`); %>

## ✅ Completed Today
- 

## 💭 Reflections

```

**Meeting note template** (`templates/meeting.md`):
```markdown
---
date: <% tp.date.now("YYYY-MM-DD") %>
type: meeting
attendees: []
tags: [meeting]
---

# Meeting: <% tp.file.title %>

**Date:** <% tp.date.now("YYYY-MM-DD HH:mm") %>
**Attendees:** 

## Agenda
1. 

## Notes


## Action Items
- [ ] 

## Decisions Made
- 
```

**Project note template** (`templates/project.md`):
```markdown
---
date: <% tp.date.now("YYYY-MM-DD") %>
status: active
deadline: 
tags: [project]
---

# <% tp.file.title %>

## Goal


## Key Results
- [ ] 
- [ ] 

## Tasks
- [ ] 

## Notes


## Links
- 
```

**Configure Templater** in settings:
- Template folder: `templates`
- Trigger on new file creation: enable
- Folder templates: map `0-inbox` → `templates/inbox.md`, etc.

### Step 3: Dataview Queries

Install the Dataview community plugin. Query your vault like a database.

**List all open tasks across the vault:**
```dataview
TASK
WHERE !completed
SORT file.mtime DESC
LIMIT 50
```

**Active projects dashboard:**
```dataview
TABLE status, deadline, file.mtime AS "Last Modified"
FROM #project
WHERE status = "active"
SORT deadline ASC
```

**Recently modified notes:**
```dataview
TABLE file.mtime AS "Modified", file.size AS "Size"
WHERE file.mtime >= date(today) - dur(7 days)
SORT file.mtime DESC
LIMIT 20
```

**Meeting notes by month:**
```dataview
LIST
FROM #meeting
WHERE date >= date("2026-02-01") AND date < date("2026-03-01")
SORT date DESC
```

**Orphan notes (no incoming links):**
```dataview
LIST
WHERE length(file.inlinks) = 0
  AND !contains(file.path, "templates")
  AND !contains(file.path, "attachments")
SORT file.ctime ASC
```

**DataviewJS** for complex logic:
```dataviewjs
const pages = dv.pages('#project AND -"templates"');
const active = pages.where(p => p.status === "active");
const overdue = active.where(p => p.deadline && dv.date(p.deadline) < dv.date("today"));

dv.header(3, `⚠️ Overdue Projects (${overdue.length})`);
dv.table(["Project", "Deadline", "Days Overdue"], 
  overdue.map(p => [
    p.file.link,
    p.deadline,
    Math.floor((Date.now() - new Date(p.deadline)) / 86400000)
  ])
);
```

### Step 4: Plugin Development

Scaffold a new Obsidian plugin:

```bash
# Clone the sample plugin
git clone https://github.com/obsidianmd/obsidian-sample-plugin my-plugin
cd my-plugin
npm install
```

**Project structure:**
```
my-plugin/
├── main.ts           # Plugin entry point
├── manifest.json     # Plugin metadata
├── styles.css        # Plugin styles
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
└── versions.json
```

**manifest.json:**
```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "minAppVersion": "1.4.0",
  "description": "Does something useful",
  "author": "Your Name",
  "isDesktopOnly": false
}
```

**Basic plugin** (`main.ts`):
```typescript
import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, MarkdownView } from "obsidian";

interface MyPluginSettings {
  defaultFolder: string;
  enableFeature: boolean;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  defaultFolder: "inbox",
  enableFeature: true,
};

export default class MyPlugin extends Plugin {
  settings: MyPluginSettings;

  async onload() {
    await this.loadSettings();

    // Add a ribbon icon
    this.addRibbonIcon("dice", "My Plugin", () => {
      new Notice("Hello from My Plugin!");
    });

    // Add a command
    this.addCommand({
      id: "do-something",
      name: "Do something useful",
      callback: () => this.doSomething(),
    });

    // Register event listeners
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") {
          console.log(`New file created: ${file.path}`);
        }
      })
    );

    // Add settings tab
    this.addSettingTab(new MyPluginSettingTab(this.app, this));
  }

  async doSomething() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file");
      return;
    }

    const content = await this.app.vault.read(activeFile);
    // Process content...
    const modified = content + "\n\n---\nProcessed by My Plugin";
    await this.app.vault.modify(activeFile, modified);
    new Notice("Done!");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class MyPluginSettingTab extends PluginSettingTab {
  plugin: MyPlugin;

  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default folder")
      .setDesc("Where new notes are created")
      .addText((text) =>
        text.setValue(this.plugin.settings.defaultFolder)
          .onChange(async (value) => {
            this.plugin.settings.defaultFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Enable feature")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableFeature)
          .onChange(async (value) => {
            this.plugin.settings.enableFeature = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
```

**Build and test:**
```bash
npm run dev  # Watches for changes, rebuilds automatically
# Copy main.js, manifest.json, styles.css to vault/.obsidian/plugins/my-plugin/
# Enable in Obsidian → Settings → Community plugins
```

**Working with the Editor** (CodeMirror 6):
```typescript
import { EditorView } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";

// Get the editor view
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view) {
  const editor = view.editor;
  const cursor = editor.getCursor();
  const selection = editor.getSelection();

  // Insert text at cursor
  editor.replaceRange("inserted text", cursor);

  // Replace selection
  editor.replaceSelection("replacement");
}
```

**Modal dialog:**
```typescript
import { Modal, App } from "obsidian";

class MyModal extends Modal {
  result: string;
  onSubmit: (result: string) => void;

  constructor(app: App, onSubmit: (result: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Enter a value" });

    const input = contentEl.createEl("input", { type: "text" });
    input.focus();

    const btn = contentEl.createEl("button", { text: "Submit" });
    btn.addEventListener("click", () => {
      this.onSubmit(input.value);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
```

### Step 5: Custom CSS & Themes

Create a CSS snippet: vault → `.obsidian/snippets/my-theme.css`.

**Custom heading styles:**
```css
/* Colorful headings */
.markdown-rendered h1 { color: var(--text-accent); border-bottom: 2px solid var(--interactive-accent); padding-bottom: 0.3em; }
.markdown-rendered h2 { color: var(--text-accent-hover); }

/* Readable line width */
.markdown-source-view.mod-cm6 .cm-contentContainer { max-width: 800px; margin: 0 auto; }

/* Custom callout */
.callout[data-callout="goal"] { --callout-color: 59, 130, 246; --callout-icon: target; }

/* Tag pills */
.tag { background: var(--interactive-accent); color: var(--text-on-accent); border-radius: 12px; padding: 2px 8px; font-size: 0.85em; }

/* Focus mode: hide sidebars */
body.focus-mode .mod-left-split,
body.focus-mode .mod-right-split { display: none; }
```

Enable in Settings → Appearance → CSS snippets.

**Full theme development:**
```css
/* theme.css - place in vault/.obsidian/themes/MyTheme/theme.css */
/* manifest.json required alongside */
.theme-dark {
  --background-primary: #1a1b26;
  --background-secondary: #16161e;
  --text-normal: #a9b1d6;
  --text-accent: #7aa2f7;
  --interactive-accent: #7aa2f7;
}

.theme-light {
  --background-primary: #f5f5f5;
  --background-secondary: #e8e8e8;
  --text-normal: #1a1b26;
  --text-accent: #2e7de9;
  --interactive-accent: #2e7de9;
}
```

### Step 6: Automation & Integration

**Obsidian URI scheme** (open notes from external tools):
```
obsidian://open?vault=MyVault&file=path/to/note
obsidian://new?vault=MyVault&file=inbox/New Note&content=Hello
obsidian://search?vault=MyVault&query=tag:project
```

**Sync vault with Git** (for version control):
```bash
# .gitignore for Obsidian vault
.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/plugins/*/data.json
.trash/
```

Auto-commit script:
```bash
#!/bin/bash
cd /path/to/vault
git add -A
git diff --cached --quiet || git commit -m "vault backup $(date +%Y-%m-%d_%H:%M)"
git push
```

Run on cron: `*/30 * * * * /path/to/vault-sync.sh`

**Obsidian Local REST API plugin** (programmatic access):
```bash
# With the Local REST API plugin enabled (port 27123):
# List files
curl http://localhost:27123/vault/ \
  -H "Authorization: Bearer YOUR_API_KEY"

# Read a note
curl http://localhost:27123/vault/projects/my-project.md \
  -H "Authorization: Bearer YOUR_API_KEY"

# Create/update a note
curl -X PUT http://localhost:27123/vault/inbox/new-note.md \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: text/markdown" \
  -d "# New Note\n\nContent here"

# Search
curl "http://localhost:27123/search/simple/?query=project%20status" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Build a CI/CD publishing pipeline:**
```bash
# Convert Obsidian vault to a static site (e.g., with Quartz)
npx quartz create
# Configure in quartz.config.ts
npx quartz build --serve  # Local preview
npx quartz sync           # Deploy to GitHub Pages
```

### Step 7: Advanced Patterns

**Periodic notes system** (daily → weekly → monthly → yearly rollups):

Weekly template referencing dailies:
```markdown
---
date: <% tp.date.now("YYYY-[W]ww") %>
tags: [weekly]
---

# Week <% tp.date.now("ww, YYYY") %>

## Daily Summaries
<%*
for (let i = 0; i < 7; i++) {
  const d = tp.date.now("YYYY-MM-DD", i - tp.date.now("d") + 1);
  const file = tp.file.find_tfile(d);
  if (file) {
    tR += `- [[${d}]]\n`;
  }
}
%>

## Week Wins
- 

## Week Challenges
- 

## Next Week Focus
- 
```

**Kanban board via metadata:**
```dataview
TABLE WITHOUT ID
  file.link AS "Task",
  status AS "Status",
  priority AS "Priority"
FROM #task
WHERE status != "done"
SORT choice(priority, "high", 1, "medium", 2, "low", 3) ASC
GROUP BY status
```

**Spaced repetition** (with Spaced Repetition plugin):
```markdown
## Flashcards

What is the CAP theorem?
?
The CAP theorem states that a distributed system can only guarantee two of three properties: Consistency, Availability, and Partition tolerance.

---

Explain ACID properties::Atomicity (all-or-nothing), Consistency (valid state), Isolation (concurrent independence), Durability (committed = permanent)
```

**Metadata-driven link suggestions** (plugin pattern):
```typescript
// In your plugin: suggest links based on shared tags
async suggestLinks(file: TFile): Promise<TFile[]> {
  const metadata = this.app.metadataCache.getFileCache(file);
  const tags = metadata?.frontmatter?.tags || [];

  const allFiles = this.app.vault.getMarkdownFiles();
  const scored = allFiles
    .filter((f) => f.path !== file.path)
    .map((f) => {
      const fMeta = this.app.metadataCache.getFileCache(f);
      const fTags = fMeta?.frontmatter?.tags || [];
      const overlap = tags.filter((t: string) => fTags.includes(t)).length;
      return { file: f, score: overlap };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 10).map((s) => s.file);
}
```
