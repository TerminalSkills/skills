---
name: telegram-export
description: >-
  Exports and downloads Telegram chats, media, and channel content. Use when a
  user asks to export Telegram chat history, download media from Telegram
  channels or groups, archive Telegram conversations, backup Telegram messages,
  extract images, videos or links from Telegram, bulk download from Telegram
  channels, or migrate Telegram data. Covers Telegram Desktop's built-in export
  and Python scripts built on the Telethon library.
license: Apache-2.0
compatibility: 'Python 3.8+ with Telethon 1.x, or Telegram Desktop (Linux, macOS, Windows)'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: content
  repository: https://codeberg.org/Lonami/Telethon
  tags:
    - telegram
    - telethon
    - export
    - media
    - backup
---

# telegram-export

## Overview

Export messages, media, and data from Telegram chats, groups, and channels. This skill covers two approaches: Telegram Desktop's built-in export (GUI, good for personal use) and Telethon (Python library for programmatic access through Telegram's MTProto API, signed in as your own account). Use cases range from personal chat backups to bulk media download from channels to data analysis of group conversations.

## Instructions

### Step 1: Get Telegram API Credentials

All programmatic approaches require API credentials from Telegram.

1. Go to https://my.telegram.org and log in with your phone number.
2. Click "API development tools."
3. Create a new application — fill in app title and short name (anything works).
4. Save your `api_id` (integer) and `api_hash` (string).

The credentials are free and tied to your Telegram account: one `api_id` per phone number. The `api_hash` is a secret that Telegram does not let you revoke, so keep both in environment variables (`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`), never in a script.

### Step 2: Install Telethon

Telethon is the most popular Python library for Telegram's MTProto API. The 1.x line (1.45.0, September 2026) is in maintenance mode but still follows Telegram's API changes. Its GitHub repository was archived in February 2026; the source now lives on Codeberg.

```bash
python3 -m venv .venv && source .venv/bin/activate   # Debian/Ubuntu refuse pip outside a virtual environment
pip install telethon cryptg
python -c "import telethon; print(telethon.__version__)"
```

`cryptg` is optional: it does the encryption in C instead of Python, which is what makes large media downloads fast.

### Step 3: Basic Client Setup

```python
# tg_login.py — sign in once; later runs reuse archive.session
import asyncio, os
from telethon import TelegramClient

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]

async def main():
    # "archive" is the session name: auth is stored in archive.session
    async with TelegramClient("archive", API_ID, API_HASH) as client:
        me = await client.get_me()
        print(f"Logged in as {me.first_name} (ID: {me.id})")

asyncio.run(main())
```

On first run, Telethon prompts for your phone number, the verification code Telegram sends you, and the two-step verification password if one is set. After that, `archive.session` stores the auth key — no re-login needed as long as the script runs from the same directory. Never name a script `telethon.py`: it shadows the library.

### Step 4: List Available Chats and Channels

Public chats can be addressed by username (`"@telegram"`) or `t.me` link. Private groups have neither: take their ID from this listing and pass it as an integer.

```python
# list_chats.py — every chat, group and channel of the account
import asyncio, os
from telethon import TelegramClient

async def main():
    async with TelegramClient("archive", int(os.environ["TELEGRAM_API_ID"]), os.environ["TELEGRAM_API_HASH"]) as client:
        async for dialog in client.iter_dialogs():
            # supergroups are both is_group and is_channel, so test is_group first
            kind = "Group" if dialog.is_group else "Channel" if dialog.is_channel else "User"
            print(f"[{kind}] {dialog.name} | ID: {dialog.id}")

asyncio.run(main())
```

### Step 5: Export Chat Messages

```python
# export_messages.py — write every message of a chat to JSON Lines, oldest first
# usage: python export_messages.py @telegram telegram_news.jsonl
import asyncio, json, os, sys
from telethon import TelegramClient

def media_kind(msg):
    for kind in ("photo", "video", "voice", "audio", "document"):
        if getattr(msg, kind):
            return kind
    return None

async def export_chat(chat, output_file):
    chat = int(chat) if chat.lstrip("-").isdigit() else chat
    count = 0
    async with TelegramClient("archive", int(os.environ["TELEGRAM_API_ID"]), os.environ["TELEGRAM_API_HASH"]) as client:
        with open(output_file, "w", encoding="utf-8") as f:
            # reverse=True yields oldest first; the default is newest first
            async for msg in client.iter_messages(chat, reverse=True):
                record = {
                    "id": msg.id,
                    "date": msg.date.isoformat(),
                    "sender_id": msg.sender_id,
                    "text": msg.raw_text or "",       # msg.text would add Markdown markup
                    "reply_to": msg.reply_to_msg_id,
                    "views": msg.views,
                    "forwards": msg.forwards,
                    "media": media_kind(msg),
                    "file_name": msg.file.name if msg.file else None,
                }
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                count += 1
    print(f"Exported {count} messages to {output_file}")

asyncio.run(export_chat(sys.argv[1], sys.argv[2]))
```

Writing one JSON object per line keeps memory flat on channels with hundreds of thousands of posts. `iter_messages` also accepts `limit=`, `search=`, `from_user=`, `min_id=` (resume after the last exported ID) and `filter=` (for example `InputMessagesFilterPhotos` from `telethon.tl.types`).

### Step 6: Download Media from Chats and Channels

```python
# download_media.py — download media of chosen kinds from a date range; safe to re-run
# usage: python download_media.py @telegram ./telegram_news 2026-01-01 2026-10-01
import asyncio, os, sys
from datetime import datetime, timezone
from telethon import TelegramClient

async def download_media(chat, output_dir, start, end, kinds=("photo", "video")):
    chat = int(chat) if chat.lstrip("-").isdigit() else chat
    count = 0
    async with TelegramClient("archive", int(os.environ["TELEGRAM_API_ID"]), os.environ["TELEGRAM_API_HASH"]) as client:
        # offset_date is an exclusive upper bound: messages before `end`, newest first
        async for msg in client.iter_messages(chat, offset_date=end):
            if msg.date < start:
                break                                   # past the range, stop
            if not msg.file or not any(getattr(msg, kind) for kind in kinds):
                continue
            target = os.path.join(output_dir, f"{msg.date:%Y-%m}", f"{msg.id}{msg.file.ext or ''}")
            if os.path.exists(target):
                continue                                # downloaded on an earlier run
            os.makedirs(os.path.dirname(target), exist_ok=True)
            partial = await msg.download_media(file=target + ".part")
            os.replace(partial, target)                 # only complete files get the final name
            count += 1
            print(f"[{count}] {msg.date:%Y-%m-%d %H:%M} {target} ({(msg.file.size or 0) / 1e6:.1f} MB)")
    print(f"Downloaded {count} files to {output_dir}")

start, end = (datetime.fromisoformat(d).replace(tzinfo=timezone.utc) for d in sys.argv[3:5])
asyncio.run(download_media(sys.argv[1], sys.argv[2], start, end))
```

Valid `kinds` are the message properties `photo`, `video`, `voice`, `audio` and `document` (`document` matches every non-photo file; `photo` also matches a link's preview image and a changed chat photo). Passing a directory as `file=` lets Telethon pick the original file name, but a re-run then saves duplicates as `name (1).ext`; naming files by message ID avoids that. `download_media(..., progress_callback=fn)` calls `fn(received_bytes, total_bytes)` for large files.

### Step 7: Takeout Session for Large Exports

Telegram has a dedicated export mode ("takeout") with lower flood limits. Telethon sends the history requests through it; file downloads stay ordinary requests. Wrap the loops from steps 5 and 6 in it when archiving large chats:

```python
from telethon import errors

try:
    # enable only what the export needs: contacts, users, chats, megagroups, channels, files
    async with client.takeout(channels=True, megagroups=True, files=True) as takeout:
        async for msg in takeout.iter_messages(chat, reverse=True, wait_time=0):
            ...   # same body as before
except errors.TakeoutInitDelayError as e:
    print(f"Telegram requires a wait of {e.seconds} s before this session may start a takeout")
```

`TakeoutInitDelayError` is part of the flow, not a failure: Telegram can delay an export for security reasons and notifies the account's other devices in the meantime. Wait `e.seconds` and run again from the same session file.

### Step 8: Telegram Desktop Export (No Code)

Telegram Desktop has a built-in export feature — no API credentials or code needed.

1. Open Telegram Desktop.
2. Go to **Settings → Advanced → Export Telegram data** (whole account), or open one chat's **⋮** menu and choose **Export chat history**.
3. Select what to export: chat types (personal chats, private or public groups and channels) and media (photos, videos, voice messages, stickers, files).
4. Choose format: **Human-readable HTML**, **Machine-readable JSON**, or both.
5. Set the media size limit and date range if needed.
6. Click "Export" and wait.

The export folder holds `result.json` (or HTML pages) with media sorted into `photos/`, `video_files/`, `voice_messages/` and `files/` (inside `chats/chat_N/` for a whole-account export). This is the simplest approach for personal chat backups, but it cannot be automated or run headlessly, and a newly signed-in desktop session may have to wait before Telegram allows the export.

## Examples

### Example 1: Archive an entire Telegram channel with all media
**User prompt:** "I want to download everything from a Telegram channel — all messages, photos, and videos. The channel has about 5,000 posts."

With `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` set and the scripts from steps 3, 5 and 6 saved:

```bash
python tg_login.py                                   # once: phone, code, 2FA password
python export_messages.py @telegram telegram_news.jsonl
python download_media.py @telegram ./telegram_news 2013-01-01 2026-10-01
du -sh telegram_news && wc -l telegram_news.jsonl
```

The result is one JSON object per post in `telegram_news.jsonl` and media grouped by month, named by message ID:

```text
Exported 5012 messages to telegram_news.jsonl
[1] 2026-09-28 14:02 ./telegram_news/2026-09/5127.mp4 (18.4 MB)
[2] 2026-09-21 09:30 ./telegram_news/2026-09/5124.jpg (0.2 MB)
...
Downloaded 3274 files to ./telegram_news
```

If the download stops (network drop, a long flood wait), run the same command again: finished files are skipped.

### Example 2: Extract all shared links from a group chat for research
**User prompt:** "My team shares a lot of articles in our Telegram group. Extract all URLs that have been shared in the last 6 months so I can build a reading list."

The group is private, so its ID comes from `list_chats.py` (`[Group] Platform Team | ID: -1001892043317`). Links are read from message entities, which also catches links hidden behind text — a regex over the text misses those.

```python
# export_links.py — unique URLs shared in a chat during the last 180 days
import asyncio, os
from datetime import datetime, timedelta, timezone
from telethon import TelegramClient
from telethon.tl.types import MessageEntityTextUrl, MessageEntityUrl

CHAT = -1001892043317
CUTOFF = datetime.now(timezone.utc) - timedelta(days=180)

async def main():
    links, scanned = set(), 0
    async with TelegramClient("archive", int(os.environ["TELEGRAM_API_ID"]), os.environ["TELEGRAM_API_HASH"]) as client:
        async for msg in client.iter_messages(CHAT):
            if msg.date < CUTOFF:
                break
            scanned += 1
            for entity, text in msg.get_entities_text():
                if isinstance(entity, MessageEntityTextUrl):
                    links.add(entity.url)            # link behind a word or phrase
                elif isinstance(entity, MessageEntityUrl):
                    links.add(text)                  # URL typed in the message
    with open("links.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(links)) + "\n")
    print(f"Extracted {len(links)} unique URLs from {scanned} messages to links.txt")

asyncio.run(main())
```

Output: `Extracted 318 unique URLs from 2140 messages to links.txt`, and `links.txt` with one URL per line, sorted.

## Guidelines

- Always use Telethon over direct HTTP scraping — it uses Telegram's official MTProto protocol and handles encryption and pagination properly.
- Treat `archive.session` like a password: it signs in to the account without a code. Keep it and the API credentials out of Git and out of shared folders; terminate a leaked session from the list of active sessions in Telegram's settings.
- Export only chats you are a member of and entitled to copy. Chat exports contain other people's personal data — store them accordingly and do not republish private conversations.
- Telegram puts accounts that sign in through unofficial API clients under observation and bans those used for flooding or spamming. Export at the pace the library sets; do not strip the waits to go faster.
- Flood waits are only partly automatic: Telethon sleeps through waits up to `flood_sleep_threshold` (60 seconds by default) and raises `FloodWaitError` with `.seconds` for longer ones. Raise the threshold (`TelegramClient(..., flood_sleep_threshold=3600)`) or catch the error, sleep and resume.
- `iter_messages` pages through history by itself and, when more than 3,000 messages are requested, waits a second between requests. A history of 100K+ messages takes a while — print progress and write results as you go.
- Resolving usernames is rate-limited (flood waits start around 50 lookups in a short period). Resolve a chat once and reuse it, or use numeric IDs.
- Telegram Desktop export is the simplest option for one-time personal backups — no code, no API setup. Use Telethon when you need automation, filtering, or integration with other tools.
- Large downloads take time even with `cryptg`. Plan for hours on big channels and make every script resumable, as in step 6.
