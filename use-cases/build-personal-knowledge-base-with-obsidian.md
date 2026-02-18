---
title: Build a Personal Knowledge Base with Obsidian
slug: build-personal-knowledge-base-with-obsidian
category: productivity
tags: [obsidian, knowledge-management, pkm, dataview, templater, automation]
---

# Build a Personal Knowledge Base with Obsidian

Marta is a senior developer who reads 30+ articles per week, takes meeting notes daily, and manages three side projects alongside her day job. Her notes are scattered across Google Docs, Apple Notes, Notion, and random text files. She can never find anything when she needs it. She wants a single, local-first knowledge system that links ideas together, surfaces insights automatically, and doesn't depend on any cloud service.

She needs a fully configured Obsidian vault with structured templates, automated daily workflows, Dataview dashboards, and a custom plugin that auto-tags notes based on content.

## Prompt

```text
I want to build a serious personal knowledge base in Obsidian. I'm a developer, I learn constantly, and I need a system that actually works long-term. Here's what I need:

1. **Vault structure**: I like the Zettelkasten approach but adapted for a developer. I need areas for: daily notes, meeting notes, learning (articles, books, courses), project notes, people (contacts/CRM-like), and code snippets. I want an inbox system where everything lands first and gets processed later.

2. **Templates**: Create templates for each note type with proper frontmatter. Daily notes should link to yesterday/tomorrow and have sections for priorities, notes, and reflection. Meeting notes need attendees, action items, and auto-linking to people notes. Literature notes should capture source, key ideas, and my own thoughts separately.

3. **Dataview dashboards**: I want a "home" note that shows:
   - Today's tasks (from all notes)
   - This week's meetings
   - Recently modified notes
   - Orphan notes that need linking
   - Project status overview
   - Reading list (unfinished literature notes)

4. **Automated workflows**:
   - Auto-create daily note on vault open
   - When I tag something #to-process, it shows up in inbox dashboard
   - Weekly review template that pulls in the week's daily notes
   - Auto-move processed inbox items to correct folders

5. **Custom plugin**: Build a simple plugin that:
   - Scans a note's content and suggests tags based on keywords
   - Adds a "related notes" section at the bottom based on shared tags/links
   - Shows a "note health" score (has links? has tags? recently updated?)

6. **Git backup**: Auto-commit and push every 30 minutes.

Set everything up with actual file contents I can copy into my vault.
```

## Agent Response

```text
Here's your complete PKM system. I'll give you every file ready to drop into a vault.

## 1. Vault Structure

Create this directory tree:

vault/
├── 00-inbox/              # Everything lands here first
├── 01-daily/              # Daily journal notes
├── 02-meetings/           # Meeting notes
├── 03-projects/           # Active project folders
│   └── _project-index.md  # Dashboard for all projects
├── 04-learning/
│   ├── articles/          # Article/blog notes
│   ├── books/             # Book notes
│   └── courses/           # Course notes
├── 05-people/             # Contact/people notes
├── 06-snippets/           # Code snippets library
├── 07-areas/              # Ongoing life areas (health, finance, career)
├── 08-archive/            # Completed/inactive
├── _templates/            # All templates
├── _dashboards/           # Dataview dashboard notes
├── _attachments/          # Images, PDFs
└── .obsidian/
    └── snippets/          # Custom CSS

### .obsidian/app.json (vault config)

{
  "newFileLocation": "folder",
  "newFileFolderPath": "00-inbox",
  "attachmentFolderPath": "_attachments",
  "alwaysUpdateLinks": true,
  "showUnsupportedFiles": false,
  "defaultViewMode": "source",
  "strictLineBreaks": false
}

## 2. Templates

### _templates/daily.md

---
date: <% tp.date.now("YYYY-MM-DD") %>
type: daily
tags: [daily]
---

# <% tp.date.now("dddd, MMMM D, YYYY") %>

<< [[<% tp.date.now("YYYY-MM-DD", -1) %>]] | [[<% tp.date.now("YYYY-MM-DD", 1) %>]] >>

## 🎯 Top 3 Priorities
- [ ] 
- [ ] 
- [ ] 

## 📅 Today's Schedule
<%*
const meetings = app.vault.getMarkdownFiles()
  .filter(f => f.path.startsWith("02-meetings/") && f.basename.startsWith(tp.date.now("YYYY-MM-DD")));
if (meetings.length > 0) {
  for (const m of meetings) {
    tR += `- [[${m.basename}]]\n`;
  }
} else {
  tR += "- No meetings scheduled\n";
}
%>

## 📝 Notes


## 💡 Ideas


## ✅ Done Today
- 

## 🔍 Reflection
**What went well?**

**What could improve?**

**One thing I learned:**


### _templates/meeting.md

---
date: <% tp.date.now("YYYY-MM-DD") %>
time: <% tp.date.now("HH:mm") %>
type: meeting
attendees: []
project: 
tags: [meeting]
---

# <% tp.file.title %>

**Date:** <% tp.date.now("YYYY-MM-DD HH:mm") %>
**Attendees:** <%* const attendees = await tp.system.prompt("Attendees (comma-separated)"); if (attendees) { const names = attendees.split(",").map(n => `[[${n.trim()}]]`); tR += names.join(", "); } %>
**Project:** 

## Agenda
1. 

## Discussion Notes


## Decisions
- 

## Action Items
- [ ] @person — task — due: YYYY-MM-DD
- [ ] 

## Follow-up
- 


### _templates/literature.md

---
date: <% tp.date.now("YYYY-MM-DD") %>
type: literature
source: 
author: 
url: 
status: unread
rating: 
tags: [literature, to-process]
---

# <% tp.file.title %>

**Source:** 
**Author:** 
**Read date:** 

## Summary (author's argument)


## Key Ideas
1. 
2. 
3. 

## My Thoughts & Reactions


## Quotes
> 

## Connections
Links to existing notes:
- 

## Action Items
- [ ] 


### _templates/project.md

---
date: <% tp.date.now("YYYY-MM-DD") %>
type: project
status: active
deadline: 
tags: [project]
---

# <% tp.file.title %>

## Goal


## Success Criteria
- [ ] 
- [ ] 

## Tasks
- [ ] 

## Log
### <% tp.date.now("YYYY-MM-DD") %>
- Started project


### _templates/person.md

---
date: <% tp.date.now("YYYY-MM-DD") %>
type: person
company: 
role: 
email: 
tags: [person]
---

# <% tp.file.title %>

**Company:** 
**Role:** 
**Email:** 
**Last contact:** <% tp.date.now("YYYY-MM-DD") %>

## Context
How I know this person:

## Notes


## Meeting History
```dataview
LIST
FROM #meeting
WHERE contains(attendees, this.file.name)
SORT date DESC
```


### _templates/snippet.md

---
date: <% tp.date.now("YYYY-MM-DD") %>
type: snippet
language: 
tags: [snippet]
---

# <% tp.file.title %>

## Use Case


## Code

```
// Your code here
```

## Notes


## Related
- 


### _templates/weekly-review.md

---
date: <% tp.date.now("YYYY-MM-DD") %>
type: weekly-review
week: <% tp.date.now("YYYY-[W]ww") %>
tags: [weekly-review]
---

# Weekly Review — <% tp.date.now("YYYY [Week] ww") %>

## This Week's Daily Notes
<%*
for (let i = 6; i >= 0; i--) {
  const d = moment().subtract(i, 'days').format("YYYY-MM-DD");
  const file = tp.file.find_tfile(d);
  tR += file ? `- [[${d}]] ✅\n` : `- ${d} (no note)\n`;
}
%>

## Wins 🎉
- 

## Challenges 😤
- 

## Lessons Learned 📚
- 

## Open Tasks (carried over)
```dataview
TASK
FROM "01-daily"
WHERE !completed AND date >= date(today) - dur(7 days)
```

## Inbox Items to Process
```dataview
LIST
FROM "00-inbox"
SORT file.ctime DESC
```

## Next Week's Focus
1. 
2. 
3. 

## Energy & Wellbeing
**Average energy this week:** /10
**Exercise days:** /7
**Sleep quality:** 


## 3. Dataview Dashboards

### _dashboards/home.md — Your main dashboard

---
type: dashboard
tags: [dashboard, pinned]
cssclass: dashboard
---

# 🏠 Home Dashboard

## 📋 Today's Tasks

```dataview
TASK
WHERE !completed AND (
  contains(file.path, "01-daily") OR 
  contains(file.path, "03-projects") OR
  contains(file.path, "02-meetings")
)
SORT file.mtime DESC
LIMIT 30
```

## 📅 This Week's Meetings

```dataview
TABLE date, attendees, project
FROM #meeting
WHERE date >= date(today) - dur(1 day) AND date <= date(today) + dur(7 days)
SORT date ASC
```

## 📥 Inbox (needs processing)

```dataview
TABLE file.ctime AS "Added", file.size AS "Size"
FROM "00-inbox"
SORT file.ctime DESC
```

## 🚀 Active Projects

```dataview
TABLE status, deadline, file.mtime AS "Last Updated"
FROM #project
WHERE status = "active"
SORT deadline ASC
```

## 📖 Reading List

```dataview
TABLE author, source, status
FROM #literature
WHERE status != "completed"
SORT file.ctime DESC
LIMIT 15
```

## 🔗 Orphan Notes (no incoming links)

```dataviewjs
const orphans = dv.pages()
  .where(p => 
    p.file.inlinks.length === 0 && 
    !p.file.path.startsWith("_") &&
    !p.file.path.startsWith("00-inbox") &&
    p.file.name !== "home"
  )
  .sort(p => p.file.ctime, "desc")
  .limit(10);

if (orphans.length > 0) {
  dv.table(["Note", "Created", "Folder"],
    orphans.map(p => [p.file.link, p.file.ctime, p.file.folder])
  );
} else {
  dv.paragraph("✅ No orphan notes — everything is linked!");
}
```

## 📊 Recent Activity

```dataview
TABLE file.mtime AS "Modified", file.folder AS "Location"
FROM -"_templates" AND -"_dashboards" AND -".obsidian"
SORT file.mtime DESC
LIMIT 10
```


## 4. Automated Workflows

### Templater startup script (_templates/startup.js)

Configure Templater → "Startup Templates" → point to this file. It auto-creates today's daily note:

<%*
const today = tp.date.now("YYYY-MM-DD");
const dailyPath = `01-daily/${today}.md`;
const existing = tp.file.find_tfile(today);

if (!existing) {
  const template = tp.file.find_tfile("daily");
  if (template) {
    await tp.file.create_new(template, today, false, "01-daily");
  }
}

// Open today's daily note
const todayFile = tp.file.find_tfile(today);
if (todayFile) {
  await app.workspace.openLinkText(todayFile.path, "", false);
}
%>

### Auto-process inbox (Templater user function)

Create `_scripts/process-inbox.js` and register as a Templater user function:

module.exports = async (tp) => {
  const inbox = app.vault.getMarkdownFiles()
    .filter(f => f.path.startsWith("00-inbox/"));
  
  for (const file of inbox) {
    const metadata = app.metadataCache.getFileCache(file);
    const type = metadata?.frontmatter?.type;
    
    const destinations = {
      literature: "04-learning/articles",
      meeting: "02-meetings",
      project: "03-projects",
      person: "05-people",
      snippet: "06-snippets",
    };
    
    if (type && destinations[type]) {
      await app.vault.rename(file, `${destinations[type]}/${file.name}`);
    }
  }
  
  new Notice(`Processed ${inbox.length} inbox items`);
};

## 5. Custom Plugin — Note Health & Auto-Tags

### manifest.json

{
  "id": "note-health",
  "name": "Note Health",
  "version": "1.0.0",
  "minAppVersion": "1.4.0",
  "description": "Auto-suggest tags, show related notes, and score note health",
  "author": "Marta"
}

### main.ts

import { Plugin, TFile, Notice, MarkdownView, MarkdownPostProcessorContext } from "obsidian";

interface NoteHealth {
  hasLinks: boolean;
  hasTags: boolean;
  hasRecentUpdate: boolean;
  linkCount: number;
  tagCount: number;
  score: number; // 0-100
}

const KEYWORD_TAG_MAP: Record<string, string[]> = {
  react: ["frontend", "react"],
  typescript: ["typescript", "programming"],
  python: ["python", "programming"],
  docker: ["docker", "devops"],
  kubernetes: ["kubernetes", "devops"],
  api: ["api", "backend"],
  database: ["database"],
  testing: ["testing", "quality"],
  security: ["security"],
  performance: ["performance"],
  aws: ["aws", "cloud"],
  architecture: ["architecture", "design"],
  "ci/cd": ["cicd", "devops"],
  machine learning: ["ml", "ai"],
  design pattern: ["patterns", "architecture"],
};

export default class NoteHealthPlugin extends Plugin {
  async onload() {
    // Command: Suggest tags for current note
    this.addCommand({
      id: "suggest-tags",
      name: "Suggest tags for current note",
      callback: () => this.suggestTags(),
    });

    // Command: Show related notes
    this.addCommand({
      id: "show-related",
      name: "Show related notes",
      callback: () => this.showRelated(),
    });

    // Command: Show note health
    this.addCommand({
      id: "show-health",
      name: "Show note health score",
      callback: () => this.showHealth(),
    });

    // Status bar item showing health score
    const statusBar = this.addStatusBarItem();
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          const health = await this.calculateHealth(file);
          statusBar.setText(`♥ ${health.score}/100`);
        }
      })
    );
  }

  async suggestTags() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;

    const content = (await this.app.vault.read(file)).toLowerCase();
    const metadata = this.app.metadataCache.getFileCache(file);
    const existingTags = (metadata?.frontmatter?.tags || []).map((t: string) => t.toLowerCase());

    const suggested = new Set<string>();
    for (const [keyword, tags] of Object.entries(KEYWORD_TAG_MAP)) {
      if (content.includes(keyword.toLowerCase())) {
        tags.forEach((t) => {
          if (!existingTags.includes(t)) suggested.add(t);
        });
      }
    }

    if (suggested.size === 0) {
      new Notice("No new tag suggestions found");
      return;
    }

    const tagList = Array.from(suggested);
    new Notice(`Suggested tags: ${tagList.join(", ")}`);

    // Auto-add to frontmatter
    const fullContent = await this.app.vault.read(file);
    const newTags = [...existingTags, ...tagList];

    if (fullContent.startsWith("---")) {
      const endIdx = fullContent.indexOf("---", 3);
      const frontmatter = fullContent.substring(0, endIdx);
      const rest = fullContent.substring(endIdx);

      const tagLine = `tags: [${newTags.join(", ")}]`;
      const updated = frontmatter.includes("tags:")
        ? frontmatter.replace(/tags:.*/, tagLine) + rest
        : frontmatter + tagLine + "\n" + rest;

      await this.app.vault.modify(file, updated);
      new Notice(`Added ${tagList.length} tags: ${tagList.join(", ")}`);
    }
  }

  async showRelated() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;

    const metadata = this.app.metadataCache.getFileCache(file);
    const tags = metadata?.frontmatter?.tags || [];
    const links = (metadata?.links || []).map((l) => l.link);

    const allFiles = this.app.vault.getMarkdownFiles().filter((f) => f.path !== file.path);

    const scored = allFiles.map((f) => {
      const fMeta = this.app.metadataCache.getFileCache(f);
      const fTags = fMeta?.frontmatter?.tags || [];
      const fLinks = (fMeta?.links || []).map((l) => l.link);

      // Score: shared tags + mutual links
      const sharedTags = tags.filter((t: string) => fTags.includes(t)).length;
      const mutualLinks = links.filter((l: string) => fLinks.includes(l)).length;
      const directLink = links.includes(f.basename) || fLinks.includes(file.basename) ? 2 : 0;

      return { file: f, score: sharedTags * 2 + mutualLinks + directLink };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

    if (scored.length === 0) {
      new Notice("No related notes found. Add more tags and links!");
      return;
    }

    // Append related notes section
    const content = await this.app.vault.read(file);
    const relatedSection = "\n\n---\n## 🔗 Related Notes\n" +
      scored.map((s) => `- [[${s.file.basename}]] (relevance: ${s.score})`).join("\n");

    // Remove old related section if exists
    const cleaned = content.replace(/\n---\n## 🔗 Related Notes[\s\S]*$/, "");
    await this.app.vault.modify(file, cleaned + relatedSection);
    new Notice(`Found ${scored.length} related notes`);
  }

  async calculateHealth(file: TFile): Promise<NoteHealth> {
    const metadata = this.app.metadataCache.getFileCache(file);
    const tags = metadata?.frontmatter?.tags || [];
    const links = metadata?.links || [];
    const backlinks = (this.app.metadataCache as any).getBacklinksForFile?.(file);
    const inlinkCount = backlinks?.data ? Object.keys(backlinks.data).length : 0;

    const daysSinceUpdate = (Date.now() - file.stat.mtime) / 86400000;

    const hasLinks = links.length > 0 || inlinkCount > 0;
    const hasTags = tags.length > 0;
    const hasRecentUpdate = daysSinceUpdate < 30;

    let score = 0;
    score += hasLinks ? 25 : 0;
    score += hasTags ? 20 : 0;
    score += hasRecentUpdate ? 15 : 0;
    score += Math.min(links.length * 5, 20);    // Up to 20 for outgoing links
    score += Math.min(inlinkCount * 5, 20);      // Up to 20 for incoming links

    return {
      hasLinks,
      hasTags,
      hasRecentUpdate,
      linkCount: links.length + inlinkCount,
      tagCount: tags.length,
      score: Math.min(score, 100),
    };
  }

  async showHealth() {
    const file = this.app.workspace.getActiveFile();
    if (!file) return;
    const h = await this.calculateHealth(file);

    const report = [
      `♥ Note Health: ${h.score}/100`,
      `${h.hasLinks ? "✅" : "❌"} Links (${h.linkCount} total)`,
      `${h.hasTags ? "✅" : "❌"} Tags (${h.tagCount})`,
      `${h.hasRecentUpdate ? "✅" : "❌"} Recently updated`,
    ].join("\n");

    new Notice(report, 8000);
  }
}

Build it:

cd my-plugin
npm run build
# Copy main.js + manifest.json to vault/.obsidian/plugins/note-health/
# Enable in Settings → Community plugins

## 6. Git Backup

### vault-sync.sh

#!/bin/bash
VAULT_PATH="$HOME/Documents/vault"
cd "$VAULT_PATH" || exit 1

# Stage all changes
git add -A

# Only commit if there are changes
if ! git diff --cached --quiet; then
  CHANGED=$(git diff --cached --stat | tail -1)
  git commit -m "vault sync: $(date +%Y-%m-%d_%H:%M) — $CHANGED"
  git push origin main 2>/dev/null || echo "Push failed — will retry next sync"
fi

### .gitignore (in vault root)

.obsidian/workspace.json
.obsidian/workspace-mobile.json
.obsidian/plugins/*/data.json
.trash/
.DS_Store

### Set up the cron (every 30 minutes)

chmod +x vault-sync.sh
crontab -e
# Add this line:
*/30 * * * * /path/to/vault-sync.sh >> /tmp/vault-sync.log 2>&1

### Initial setup

cd ~/Documents/vault
git init
git remote add origin git@github.com:youruser/vault-backup.git
git add -A
git commit -m "initial vault backup"
git push -u origin main

---

That's the complete system. Drop the templates into _templates/, create the dashboard files, install Templater + Dataview plugins, build the note-health plugin, and set up the git cron. The vault will auto-create daily notes, process your inbox, surface related content, and back itself up every 30 minutes.

Start by creating a few notes in 00-inbox/ and running the weekly review template after a week — that's when the system really starts paying off.
```

Skills used: `obsidian`
