---
name: telegram-export
description: >-
  Export and download Telegram chats, media, and channel content. Use when a
  user asks to export Telegram chat history, download media from Telegram
  channels or groups, archive Telegram conversations, backup Telegram messages,
  extract images or videos from Telegram, bulk download from Telegram channels,
  scrape Telegram content, or migrate Telegram data. Covers Telegram Desktop
  export, Telethon-based scripting, and TDLib approaches.
license: Apache-2.0
compatibility: 'Python 3.8+ with Telethon, or Telegram Desktop (Linux, macOS, Windows)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags:
    - telegram
    - export
    - download
    - chat
    - media
    - archive
    - backup
---

# telegram-export

## Overview

Export messages, media, and data from Telegram chats, groups, and channels. This skill covers three approaches: Telegram Desktop's built-in export (GUI, good for personal use), Telethon (Python library for programmatic access), and channel scraping for public content. Use cases range from personal chat backups to bulk media download from channels to data analysis of group conversations.

## Instructions

### Step 1: Get Telegram API Credentials

All programmatic approaches require API credentials from Telegram.

1. Go to https://my.telegram.org/auth and log in with your phone number.
2. Click "API development tools."
3. Create a new application — fill in app title and short name (anything works).
4. Save your `api_id` (integer) and `api_hash` (string).

These credentials are free, permanent, and tied to your Telegram account.

### Step 2: Install Telethon

Telethon is the most popular Python library for Telegram's MTProto API.

```bash
pip install telethon

# Optional: for media processing
pip install pillow cryptg    # cryptg speeds up encryption 2-3x
```

### Step 3: Basic Client Setup

```python
# telegram_client.py — Telethon client initialization and authentication
from telethon import TelegramClient
import asyncio

api_id = 12345678           # your api_id from my.telegram.org
api_hash = "your_api_hash"  # your api_hash

async def main():
    # Session file stores auth — you only log in once
    client = TelegramClient("my_session", api_id, api_hash)
    await client.start()     # prompts for phone + code on first run

    me = await client.get_me()
    print(f"Logged in as {me.first_name} (ID: {me.id})")

    await client.disconnect()

asyncio.run(main())
```

On first run, Telethon prompts for your phone number and the verification code Telegram sends you. After that, the session file (`my_session.session`) stores the auth token — no re-login needed.

### Step 4: Export Chat Messages

```python
# export_messages.py — Export all messages from a chat to JSON
from telethon import TelegramClient
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
import asyncio
import json
from datetime import datetime

api_id = 12345678
api_hash = "your_api_hash"

async def export_chat(chat_name, output_file="messages.json"):
    """
    Export all messages from a chat/group/channel to JSON.

    Args:
        chat_name: Username, invite link, or chat title to export
        output_file: Path for the JSON output file
    """
    client = TelegramClient("my_session", api_id, api_hash)
    await client.start()

    entity = await client.get_entity(chat_name)
    messages = []

    async for msg in client.iter_messages(entity, limit=None):
        message_data = {
            "id": msg.id,
            "date": msg.date.isoformat(),
            "sender_id": msg.sender_id,
            "text": msg.text or "",
            "reply_to": msg.reply_to_msg_id if msg.reply_to else None,
            "forwards": msg.forwards,
            "views": msg.views,
        }

        # Classify media type
        if msg.media:
            if isinstance(msg.media, MessageMediaPhoto):
                message_data["media_type"] = "photo"
            elif isinstance(msg.media, MessageMediaDocument):
                mime = msg.media.document.mime_type
                if mime.startswith("video"):
                    message_data["media_type"] = "video"
                elif mime.startswith("audio"):
                    message_data["media_type"] = "audio"
                else:
                    message_data["media_type"] = "document"
                message_data["mime_type"] = mime

        messages.append(message_data)

    # Chronological order (oldest first)
    messages.reverse()

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False, indent=2)

    print(f"Exported {len(messages)} messages to {output_file}")
    await client.disconnect()

asyncio.run(export_chat("@channel_username"))
```

### Step 5: Download Media from Chats and Channels

```python
# download_media.py — Download all media (photos, videos, documents) from a chat
from telethon import TelegramClient
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
import asyncio
import os

api_id = 12345678
api_hash = "your_api_hash"

async def download_media(chat_name, output_dir="./media", media_types=None):
    """
    Download media files from a Telegram chat, group, or channel.

    Args:
        chat_name: Username (@channel), invite link, or chat title
        output_dir: Directory to save downloaded files
        media_types: List of types to download: 'photo', 'video', 'audio', 'document'
                     None means download everything
    """
    if media_types is None:
        media_types = ["photo", "video", "audio", "document"]

    client = TelegramClient("my_session", api_id, api_hash)
    await client.start()

    entity = await client.get_entity(chat_name)
    os.makedirs(output_dir, exist_ok=True)

    count = 0
    async for msg in client.iter_messages(entity, limit=None):
        if not msg.media:
            continue

        # Determine media type
        if isinstance(msg.media, MessageMediaPhoto) and "photo" in media_types:
            path = await msg.download_media(file=output_dir)
            count += 1
        elif isinstance(msg.media, MessageMediaDocument):
            mime = msg.media.document.mime_type
            if mime.startswith("video") and "video" in media_types:
                path = await msg.download_media(file=output_dir)
                count += 1
            elif mime.startswith("audio") and "audio" in media_types:
                path = await msg.download_media(file=output_dir)
                count += 1
            elif "document" in media_types:
                path = await msg.download_media(file=output_dir)
                count += 1

        if count % 50 == 0 and count > 0:
            print(f"Downloaded {count} files...")

    print(f"Done! Downloaded {count} files to {output_dir}")
    await client.disconnect()

# Download only photos and videos from a channel
asyncio.run(download_media("@channel_name", media_types=["photo", "video"]))
```

### Step 6: Download with Date Filtering and Progress

```python
# download_filtered.py — Download media with date range and progress tracking
from telethon import TelegramClient
import asyncio
from datetime import datetime, timezone

api_id = 12345678
api_hash = "your_api_hash"

async def download_date_range(chat_name, start_date, end_date, output_dir="./media"):
    """
    Download media from a specific date range.

    Args:
        chat_name: Chat/channel to download from
        start_date: Start of range (datetime)
        end_date: End of range (datetime)
        output_dir: Output directory
    """
    client = TelegramClient("my_session", api_id, api_hash)
    await client.start()

    entity = await client.get_entity(chat_name)
    count = 0

    # offset_date is the upper bound — Telegram returns messages BEFORE this date
    async for msg in client.iter_messages(entity, offset_date=end_date, limit=None):
        if msg.date < start_date:
            break    # past our range, stop

        if msg.media:
            await msg.download_media(file=output_dir)
            count += 1
            print(f"[{count}] {msg.date.strftime('%Y-%m-%d %H:%M')} — downloaded")

    print(f"Downloaded {count} files from {start_date.date()} to {end_date.date()}")
    await client.disconnect()

# Download January 2025 media
asyncio.run(download_date_range(
    "@channel_name",
    start_date=datetime(2025, 1, 1, tzinfo=timezone.utc),
    end_date=datetime(2025, 2, 1, tzinfo=timezone.utc),
))
```

### Step 7: Telegram Desktop Export (No Code)

Telegram Desktop has a built-in export feature — no API credentials or code needed.

1. Open Telegram Desktop.
2. Go to **Settings → Advanced → Export Telegram data**.
3. Select what to export: messages, photos, videos, voice messages, stickers, etc.
4. Choose format: **HTML** (human-readable) or **JSON** (machine-readable).
5. Set file size limit and date range if needed.
6. Click "Export" and wait.

The export creates a folder with `result.json` (or HTML files) and a `files/` directory containing all media. This is the simplest approach for personal chat backups, but it cannot be automated or run headlessly.

### Step 8: List Available Chats and Channels

```python
# list_chats.py — List all chats, groups, and channels you're a member of
from telethon import TelegramClient
import asyncio

api_id = 12345678
api_hash = "your_api_hash"

async def list_dialogs():
    """List all conversations with message counts and types."""
    client = TelegramClient("my_session", api_id, api_hash)
    await client.start()

    async for dialog in client.iter_dialogs():
        chat_type = "Channel" if dialog.is_channel else "Group" if dialog.is_group else "User"
        print(f"[{chat_type}] {dialog.name} | ID: {dialog.entity.id} | Messages: {dialog.message.id}")

    await client.disconnect()

asyncio.run(list_dialogs())
```

### Step 9: Export Specific Message Types

```python
# export_links.py — Extract all URLs shared in a chat
from telethon import TelegramClient
import asyncio
import re

api_id = 12345678
api_hash = "your_api_hash"

URL_PATTERN = re.compile(r'https?://[^\s<>"{}|\\^`\[\]]+')

async def extract_links(chat_name, output_file="links.txt"):
    """
    Extract all URLs from messages in a chat.

    Args:
        chat_name: Chat to scan for links
        output_file: File to save extracted URLs
    """
    client = TelegramClient("my_session", api_id, api_hash)
    await client.start()

    entity = await client.get_entity(chat_name)
    links = set()

    async for msg in client.iter_messages(entity, limit=None):
        if msg.text:
            found = URL_PATTERN.findall(msg.text)
            links.update(found)

    with open(output_file, "w") as f:
        for link in sorted(links):
            f.write(link + "\n")

    print(f"Extracted {len(links)} unique URLs to {output_file}")
    await client.disconnect()

asyncio.run(extract_links("@channel_name"))
```

## Examples

### Example 1: Archive an entire Telegram channel with all media
**User prompt:** "I want to download everything from a Telegram channel — all messages, photos, and videos. The channel has about 5,000 posts."

The agent will:
1. Set up Telethon client with the user's API credentials.
2. Run the media download script with `limit=None` to get all posts.
3. Export messages to JSON in parallel for the text archive.
4. Organize downloads by date: `{channel_name}/{year}-{month}/` structure.
5. The archive handles Telegram's rate limits automatically — Telethon manages flood waits internally.
6. Report total files downloaded, disk usage, and message count.

### Example 2: Extract all shared links from a group chat for research
**User prompt:** "My team shares a lot of articles in our Telegram group. Extract all URLs that have been shared in the last 6 months so I can build a reading list."

The agent will:
1. Connect to the group using Telethon.
2. Filter messages by date (last 6 months) and extract URLs using regex.
3. Deduplicate URLs and optionally categorize by domain.
4. Save the result as a clean text file with one URL per line.
5. Report how many unique URLs were found across how many messages.

## Guidelines

- Always use Telethon over direct HTTP scraping — it uses Telegram's official MTProto protocol, respects rate limits automatically, and handles encryption properly.
- Store API credentials in environment variables or a config file, never hardcode them in scripts that might be shared or committed.
- Use `iter_messages(limit=None)` for full exports — Telethon handles pagination and rate limiting automatically. For very large channels (100K+ messages), add progress tracking.
- Enable `cryptg` (`pip install cryptg`) for 2-3x faster encryption performance during large downloads.
- Telegram Desktop export is the simplest option for one-time personal backups — no code, no API setup. Use Telethon when you need automation, filtering, or integration with other tools.
- Respect rate limits — Telethon handles `FloodWaitError` automatically by sleeping, but downloading thousands of large files will take time. Plan for hours on large channels.
