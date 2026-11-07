---
title: "Build a Knowledge Base from Slack and Chat History"
slug: build-knowledge-base-from-chat-history
description: "Extract decisions, solutions, and tribal knowledge from chat archives and organize them into a searchable knowledge base."
skills: [data-extractor, markdown-writer]
category: productivity
tags: [knowledge-management, slack, documentation, tribal-knowledge, search]
---

# Build a Knowledge Base from Slack and Chat History

## The Problem

Your 25-person engineering team has been using Slack for 3 years. Somewhere in those messages are the answers to every recurring question: why the billing service uses a separate database, how to configure the staging VPN, what the workaround is for that OAuth edge case. But nobody can find anything.

Engineers lose time every day searching Slack for answers that were already given months ago. The same questions get asked every few weeks: "How do I connect to the staging DB?" has been answered 11 times across 3 channels, by 6 different engineers, each with slightly different instructions. When someone leaves, their knowledge disappears into an archive nobody reads.

The team tried a wiki. It went stale in 2 months. The problem was never the wiki itself: nobody has time to write documentation from scratch. Explaining VPN setup in a Slack thread takes 5 minutes and happens naturally. The knowledge already exists, scattered across thousands of messages. It needs to be extracted, deduplicated, and organized.

## The Solution

Using the **data-extractor** and **markdown-writer** skills, the agent parses the Slack export, finds the high-value threads (problem and solution pairs, architecture decisions, setup guides), deduplicates answers to the same question, and writes structured Markdown articles with cross-references. A human reviews every article before it is published.

## Step-by-Step Walkthrough

### Step 1: Export the history and group it into threads

What you can export depends on the Slack plan. A standard workspace export contains public channels only (`channels.json`, one folder per channel with one JSON file per day, and `users.json`). Private channels and DMs need Business+ or Enterprise and an approved export application. Many answers live in private channels, so decide up front what is in scope, and do not export private conversations without the participants' knowledge and your company's approval.

Unzip the export into a private working folder, then group messages into threads. Joins, bot posts and edits carry a `subtype` and are skipped:

```python
import json
from collections import defaultdict
from pathlib import Path

def load_threads(export_dir: Path):
    users = {u["id"]: u.get("profile", {}).get("real_name") or u["name"]
             for u in json.loads((export_dir / "users.json").read_text())}
    channels = [c["name"] for c in json.loads((export_dir / "channels.json").read_text())]
    threads = defaultdict(list)           # (channel, thread_ts) -> messages
    for channel in channels:
        for day in sorted((export_dir / channel).glob("*.json")):
            for m in json.loads(day.read_text()):
                if m.get("type") != "message" or m.get("subtype"):
                    continue
                key = (channel, m.get("thread_ts", m["ts"]))
                threads[key].append({"user": users.get(m.get("user"), "unknown"),
                                     "ts": m["ts"], "text": m["text"]})
    return threads
```

Then ask the agent to find what matters:

```text
Using load_threads on ./slack-export, rank the threads worth keeping: solutions to problems, architecture decisions, configuration explanations, how-to threads. Skip small talk and scheduling. Report counts per channel and per content type.
```

Most messages are not knowledge. Threads with several replies, code blocks, commands or decision language ("we decided", "the reason is") are the best candidates. Incident and help channels are usually the richest, because people write precisely when someone has to follow the instructions exactly.

### Step 2: Extract and deduplicate

The same question answered 11 times is one article, built from the most complete and most recent answer:

```text
Group the candidate threads by question. For each group, keep the most complete and most recent answer, list the other threads as sources, and flag answers that disagree (for example old hostnames or missing environment variables). Group the results by topic: infrastructure, architecture, debugging, onboarding, business logic.
```

When two answers disagree, the agent lists both with dates and does not choose silently; a person who owns the system settles it. The staging database question, for instance, may have only two complete and current answers out of eleven, and the rest reference old hostnames.

### Step 3: Write the articles and remove secrets

```text
Write one Markdown article per group with frontmatter (title, tags, source channel, thread dates, last_verified) and sections: Context, Solution, Sources. Use placeholders such as $STAGING_DB_PASS for credentials. Never copy a password, token, key, connection string with credentials, customer name or personal data from a thread.
```

Chat history is full of pasted credentials. Before anything is published, scan the output folder, then have an engineer read each article for accuracy, because chat answers go out of date:

```console
$ gitleaks dir docs/knowledge-base
```

Three sample articles:

**`infrastructure/connect-to-staging-database.md`**
- **Q:** How do I connect to the staging database?
- **A:** Connect to the VPN first (see `vpn-setup.md`), then: `psql "postgresql://readonly@staging-db:5432/app"`, entering the password from the team vault when prompted.
- **Source:** `#devops`, confirmed by 3 engineers. Last verified: 2026-01.

**`architecture/why-billing-has-separate-db.md`**
- **Q:** Why does billing use a separate PostgreSQL instance?
- **A:** Isolation for PCI compliance: billing data cannot share a database with user-generated content. Decision recorded in `#engineering` in March 2024 by the CTO and lead architect.

**`debugging/oauth-refresh-token-race-condition.md`**
- **Q:** Users randomly get logged out mid-session.
- **A:** Two concurrent requests both try to rotate the refresh token and one gets invalidated. Fix: add a lock around the rotation logic. See the linked PR.
- **Source:** `#incidents`, resolved 2025-08.

Architecture decisions are especially valuable: six months later, "why does billing use a separate database?" has an answer with context and decision-makers instead of requiring someone to remember a conversation.

### Step 4: Build navigation and search

```text
Create a README.md table of contents by category, a _tags.md tag index, and "Related" links between articles that share tags or reference each other.
```

```text
docs/knowledge-base/
  README.md          # table of contents
  _tags.md           # tag index
  infrastructure/
  architecture/
  debugging/
  onboarding/
  business-logic/
  inbox/             # drafts waiting for review (Step 5)
```

Plain Markdown with YAML frontmatter works in GitHub search, Docusaurus, MkDocs and most static site generators, so the team can publish it however it prefers. Keep the site on the internal network if it contains internal architecture.

### Step 5: Capture new knowledge continuously

A knowledge base that stops growing goes stale, which is what killed the wiki. Instead of asking people to write docs, let them flag conversations that already happened. A small Slack app using Bolt for Python listens for the `reaction_added` event, which needs the `reactions:read` scope, plus `channels:history` (and `groups:history` for private channels) to read the thread through `conversations.replies`:

```python
import os
import re
from pathlib import Path

from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

app = App(token=os.environ["SLACK_BOT_TOKEN"])
INBOX = Path("docs/knowledge-base/inbox")

@app.event("reaction_added")
def capture(event, client):
    item = event["item"]
    if event["reaction"] != "brain" or item.get("type") != "message":
        return
    channel, ts = item["channel"], item["ts"]
    thread = client.conversations_replies(channel=channel, ts=ts)["messages"]
    body = "\n\n".join(f"{m.get('user', 'bot')}: {m.get('text', '')}" for m in thread)
    name = re.sub(r"[^0-9]", "", ts)             # file name built from the timestamp only
    INBOX.mkdir(parents=True, exist_ok=True)
    (INBOX / f"{name}.md").write_text(
        f"---\nsource_channel: {channel}\nsource_ts: '{ts}'\nstatus: draft\n---\n\n{body}\n"
    )

if __name__ == "__main__":
    SocketModeHandler(app, os.environ["SLACK_APP_TOKEN"]).start()
```

Socket Mode needs an app-level token (`SLACK_APP_TOKEN`, scope `connections:write`) next to the bot token; keep both in environment variables or a secrets manager. The flow:

1. Someone reacts with `:brain:` on the first message of a valuable thread
2. The bot saves the thread to `docs/knowledge-base/inbox/` as a draft
3. Weekly, a reviewer has the agent turn each draft into an article (Steps 2 and 3, including the secret scan), then approves, edits or rejects it

Engineers are not writing documentation; they are flagging conversations that already happened.

## Real-World Example

Priya, a staff engineer at a 30-person healthtech startup, notices her team spends more time searching Slack than writing code. She exports the public channels, runs the extraction on a Monday morning, and gets a few hundred candidate threads, including the staging database question answered 11 times by 6 engineers.

The agent turns the best of them into articles grouped in five categories. Two engineers spend an afternoon correcting outdated answers and removing a pasted connection string that the secret scan caught. She publishes the Markdown as an internal Docusaurus site. New hires start finding answers there before posting in `#help`, and the `:brain:` reaction keeps the inbox growing from conversations the team is already having.

## Related Skills

- [data-extractor](../skills/data-extractor/SKILL.md) — structured extraction from exported files and text
- [markdown-writer](../skills/markdown-writer/SKILL.md) — structured Markdown articles and documentation
