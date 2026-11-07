---
title: "Build a Telegram Bot That Collects Daily Standup Reports"
slug: build-telegram-bot-for-team-standup-reports
description: "Create a Telegram bot that automates daily standup collection, compiles team updates, and posts summaries to a group channel."
skills:
  - telegram-bot-builder
  - template-engine
  - batch-processor
category: automation
tags:
  - telegram
  - standup
  - team-management
  - reporting
---

# Build a Telegram Bot That Collects Daily Standup Reports

## The Problem

A remote development team of 12 people across 4 time zones tries to do daily standups via a Telegram group chat. Some people post at 8 AM their time, others at noon, and two or three consistently forget. The manager scrolls through a mix of standup updates, unrelated discussions, and memes trying to piece together who did what. There is no structured format, and compiling a weekly summary for stakeholders takes 45 minutes of copy-pasting every Friday.

## The Solution

**telegram-bot-builder** supplies the Bot API patterns (private conversations, scheduled jobs, posting to a group), **template-engine** renders the daily message and the weekly PDF from Jinja2 templates, and **batch-processor** runs the weekly PDF build for every team in parallel. The code below uses python-telegram-bot 22 (with the `job-queue` extra), Jinja2 and WeasyPrint, and was run against mocked Telegram calls; the live Bot API calls were not exercised without a real token.

```bash
python3 -m venv .venv && .venv/bin/pip install "python-telegram-bot[job-queue]" jinja2 weasyprint
export BOT_TOKEN=...            # from @BotFather, never commit it
export STANDUP_CHAT_ID=-100...  # negative id of the group the bot was added to
```

WeasyPrint needs the Pango system library (see its install docs).

## Step-by-Step Walkthrough

### 1. Onboard members and ask the three questions

Two Bot API facts shape the design. A bot can only message a user who has started it, so each member sends `/start` to the bot in a private chat first. And Telegram does not tell a bot the user's timezone, so members register it once with `/join <team> <IANA timezone>`. The bot then schedules a weekday 09:00 prompt in that timezone, sends a reminder after 2 hours, and marks the report `no_update` after 4 hours.

> Use telegram-bot-builder to create the standup bot in `standup_bot.py`: `/join` validates the team name (letters, digits, `-`, `_`), stores team and timezone in SQLite and schedules a daily job at 09:00 in that zone; the job asks "What did you complete yesterday?", then "What are you working on today?", then "Any blockers?"; answers are capped at 500 characters; reminder after 2 hours, `no_update` after 4.

```python
import datetime as dt
import os
import re
import sqlite3
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jinja2 import Environment, FileSystemLoader, select_autoescape
from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

QUESTIONS = ["What did you complete yesterday?", "What are you working on today?", "Any blockers?"]
FIELDS = ["done", "today", "blockers"]
GROUP_ID = int(os.environ["STANDUP_CHAT_ID"])  # negative number for groups
env = Environment(loader=FileSystemLoader("templates"), autoescape=select_autoescape(["html"]))

db = sqlite3.connect("standup.db", check_same_thread=False)
db.executescript("""
CREATE TABLE IF NOT EXISTS member(user_id INTEGER PRIMARY KEY, name TEXT, team TEXT, tz TEXT);
CREATE TABLE IF NOT EXISTS report(day TEXT, user_id INTEGER, step INTEGER DEFAULT 0,
  done TEXT, today TEXT, blockers TEXT, status TEXT DEFAULT 'asking', PRIMARY KEY(day, user_id));
""")


def today_for(tz: str) -> str:
    return dt.datetime.now(ZoneInfo(tz)).date().isoformat()


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    # A bot can only message users who have started it, so onboarding happens here.
    await update.message.reply_text("Send: /join <team> <IANA timezone>, e.g. /join backend Europe/Berlin")


async def join(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    try:
        team, tz = ctx.args[0].lower(), ctx.args[1]
        if not re.fullmatch(r"[a-z0-9_-]{1,32}", team):  # the team name ends up in a PDF file name later
            raise ValueError(team)
        ZoneInfo(tz)  # Telegram does not expose the user's timezone, so ask for it
    except (IndexError, ZoneInfoNotFoundError, ValueError):
        await update.message.reply_text("Usage: /join <team: letters, digits, - _> <Area/City>")
        return
    u = update.effective_user
    db.execute("INSERT OR REPLACE INTO member VALUES (?,?,?,?)", (u.id, u.full_name, team, tz))
    db.commit()
    schedule_member(ctx.application, u.id, tz)
    await update.message.reply_text(f"Saved. I will ask at 09:00 {tz}.")


def schedule_member(app: Application, user_id: int, tz: str):
    for old in app.job_queue.get_jobs_by_name(f"ask-{user_id}"):
        old.schedule_removal()
    app.job_queue.run_daily(ask, dt.time(9, 0, tzinfo=ZoneInfo(tz)), days=(1, 2, 3, 4, 5),
                            name=f"ask-{user_id}", user_id=user_id, data=tz)


async def ask(ctx: ContextTypes.DEFAULT_TYPE):
    uid, tz = ctx.job.user_id, ctx.job.data
    day = today_for(tz)
    db.execute("INSERT OR IGNORE INTO report(day, user_id) VALUES (?,?)", (day, uid))
    db.commit()
    await ctx.bot.send_message(uid, QUESTIONS[0])
    ctx.job_queue.run_once(remind, dt.timedelta(hours=2), user_id=uid, data=day, name=f"r-{uid}-{day}")
    ctx.job_queue.run_once(give_up, dt.timedelta(hours=4), user_id=uid, data=day, name=f"g-{uid}-{day}")


async def remind(ctx: ContextTypes.DEFAULT_TYPE):
    row = db.execute("SELECT status FROM report WHERE day=? AND user_id=?", (ctx.job.data, ctx.job.user_id)).fetchone()
    if row and row[0] == "asking":
        await ctx.bot.send_message(ctx.job.user_id, "Reminder: your standup is still open.")


async def give_up(ctx: ContextTypes.DEFAULT_TYPE):
    db.execute("UPDATE report SET status='no_update' WHERE day=? AND user_id=? AND status='asking'",
               (ctx.job.data, ctx.job.user_id))
    db.commit()


async def answer(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    m = db.execute("SELECT tz FROM member WHERE user_id=?", (uid,)).fetchone()
    if not m:
        return
    day = today_for(m[0])
    r = db.execute("SELECT step FROM report WHERE day=? AND user_id=? AND status='asking'", (day, uid)).fetchone()
    if not r:
        return
    step, text = r[0], update.message.text[:500]
    db.execute(f"UPDATE report SET {FIELDS[step]}=?, step=?, status=? WHERE day=? AND user_id=?",
               (text, step + 1, "done" if step == 2 else "asking", day, uid))  # FIELDS is a constant list
    db.commit()
    await update.message.reply_text(QUESTIONS[step + 1] if step < 2 else "Thanks, recorded.")


async def post_summary(ctx: ContextTypes.DEFAULT_TYPE):
    day = dt.datetime.now(dt.timezone.utc).date().isoformat()
    rows = db.execute("""SELECT m.team, m.name, r.done, r.today, r.blockers, r.status FROM member m
        LEFT JOIN report r ON r.user_id=m.user_id AND r.day=? ORDER BY m.team, m.name""", (day,)).fetchall()
    teams: dict[str, list] = {}
    for team, name, done, today, blockers, status in rows:
        teams.setdefault(team, []).append(dict(name=name, done=done, today=today, blockers=blockers,
                                                missing=status != "done"))
    for team, people in teams.items():  # one message per team stays under the 4096-character limit
        text = env.get_template("summary.html").render(day=day, team=team, people=people)
        await ctx.bot.send_message(GROUP_ID, text, parse_mode=ParseMode.HTML)


async def on_startup(app: Application):
    for uid, tz in db.execute("SELECT user_id, tz FROM member"):
        schedule_member(app, uid, tz)
    app.job_queue.run_daily(post_summary, dt.time(14, 0, tzinfo=dt.timezone.utc), days=(1, 2, 3, 4, 5))


app = Application.builder().token(os.environ["BOT_TOKEN"]).post_init(on_startup).build()
app.add_handler(CommandHandler("start", start, filters.ChatType.PRIVATE))
app.add_handler(CommandHandler("join", join, filters.ChatType.PRIVATE))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND & filters.ChatType.PRIVATE, answer))
app.run_polling()
```

Every SQL statement uses bound parameters; the one f-string interpolates a column name from the constant `FIELDS` list, never user input. Long polling (`run_polling`) is enough for a 12-person bot; switch to a webhook with a `secret_token` only if you need to.

### 2. Post the daily summary per team

> Use template-engine to render `templates/summary.html` with Jinja2 autoescape on, and post one message per team to the group at 14:00 UTC.

```jinja
<b>Standup {{ day }} - {{ team | upper }}</b>
{% for p in people %}
<b>{{ p.name }}</b>{% if p.missing %} - no update{% else %}

Done: {{ p.done }}
Today: {{ p.today }}
Blockers: {% if p.blockers and p.blockers | lower not in ["none", "no"] %}<b>{{ p.blockers }}</b>{% else %}none{% endif %}{% endif %}
{% endfor %}
```

Telegram's HTML parse mode accepts only a small tag set (`<b>`, `<i>`, `<code>`, ...) and rejects stray `<` and `&`, which is why autoescape stays on: a blocker like `fix a & b <webhooks>` renders safely. One message per team keeps each post under the 4096-character message limit.

```text
Standup 2026-10-28 - BACKEND

Alex K.

Done: Finished order API pagination
Today: Start payment webhook retry logic
Blockers: none
```

### 3. Build weekly stakeholder PDFs in parallel

Save this as `weekly.py` with a `templates/weekly.html` (an HTML page using `@page { size: A4; margin: 2cm; }` that loops over `people` and `blockers`):

```python
import datetime as dt
import sqlite3
import sys

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

team = sys.argv[1]
end = dt.date.today()
start = end - dt.timedelta(days=6)
db = sqlite3.connect("standup.db")
rows = db.execute("""SELECT m.name, r.day, r.done, r.blockers, r.status FROM member m
    JOIN report r ON r.user_id = m.user_id WHERE m.team = ? AND r.day BETWEEN ? AND ?
    ORDER BY m.name, r.day""", (team, start.isoformat(), end.isoformat())).fetchall()
people: dict[str, list] = {}
blockers = []
for name, day, done, blocker, status in rows:
    if status == "done":
        people.setdefault(name, []).append(done)
        if blocker and blocker.lower() not in ("none", "no"):
            blockers.append({"name": name, "text": blocker})
members = db.execute("SELECT COUNT(*) FROM member WHERE team = ?", (team,)).fetchone()[0]
env = Environment(loader=FileSystemLoader("templates"), autoescape=select_autoescape(["html"]))
html = env.get_template("weekly.html").render(
    team=team, start=start, end=end, blockers=blockers,
    people=[{"name": n, "done": d} for n, d in people.items()],
    completed=sum(len(d) for d in people.values()), expected=members * 5)
HTML(string=html).write_pdf(f"weekly-{team}-{end}.pdf")
```

Then run it for every team with batch-processor's `xargs` pattern, and send each file with the Bot API's `sendDocument` (`await bot.send_document(GROUP_ID, open(path, "rb"))`), for example from a Friday job:

```bash
sqlite3 standup.db "SELECT DISTINCT team FROM member" | xargs -P 4 -I {} .venv/bin/python weekly.py {}
```

### 4. Track participation

> Add a `/stats` command for the manager that counts, per member, the share of reports with status `done` in the last 30 days and the current streak, computed in SQL. DM the manager when someone is below 60% for two weeks.

## Real-World Example

A 12-person distributed team ran this for a month. These are the example team's own numbers: participation rose from about two thirds to above 90% once each member was prompted at 09:00 local time, and the Friday summary stopped being manual work. Reviewing the stored blockers showed the QA engineer reporting the same staging blocker in 8 of 20 standups, which led to a process change.

## Tips

- Prompt at 9 AM in each person's own timezone; a prompt at 2 AM is ignored.
- Cap each answer at 500 characters so one person's essay does not dominate the summary.
- Keep at least 90 days of data; recurring blockers only show up across weeks.
- Rebuild scheduled jobs from SQLite on startup (`on_startup` above), since the job queue is in memory.

## Related Skills

- **telegram-bot-builder** for Bot API patterns and framework choices.
- **template-engine** for the Jinja2 and WeasyPrint rendering.
- **batch-processor** for the parallel per-team PDF build.
