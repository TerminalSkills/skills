---
title: Download and Convert Media from Any Platform
slug: download-and-convert-media-from-any-platform
description: >-
  A freelance video editor needs to collect source material from YouTube,
  Instagram, Telegram channels, and image galleries — then convert everything
  to consistent formats for editing. She combines yt-dlp for video, gallery-dl
  for images, Telethon for Telegram exports, and ffmpeg for format conversion
  into a unified download-and-convert workflow.
skills:
  - yt-dlp
  - ffmpeg
  - gallery-dl
  - telegram-export
category: content
tags:
  - video
  - download
  - convert
  - media
  - youtube
  - telegram
  - instagram
---

# Download and Convert Media from Any Platform

Marta is a freelance video editor building a highlight reel for a conference organizer. The source material is scattered everywhere: keynote recordings on YouTube, speaker photos on Instagram, behind-the-scenes clips in a Telegram channel, and infographic assets from a design gallery on Imgur. She needs to pull everything down, convert videos to a consistent MP4 format for her NLE (DaVinci Resolve only likes H.264), and organize the files by type.

She doesn't want to click through 50 browser tabs saving files one by one. She wants a pipeline.

## Step 1: Download YouTube Videos with yt-dlp

The conference organizer shares a YouTube playlist with 12 keynote recordings. Some are 4K, some 1080p. Marta needs them all at 1080p max in MP4 — not the WebM containers that YouTube typically serves.

```bash
# download_youtube.sh — Download conference keynotes, force MP4 output
# The --merge-output-format flag tells yt-dlp to mux into MP4 container
# even when the best available streams are WebM/VP9

mkdir -p media/youtube

yt-dlp \
  -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
  --merge-output-format mp4 \
  --embed-thumbnail \
  --embed-metadata \
  --write-auto-sub --sub-lang en --convert-subs srt \
  --download-archive media/youtube/.archive.txt \
  -o "media/youtube/%(playlist_index)03d_%(title).80B.%(ext)s" \
  "https://youtube.com/playlist?list=PLxxxxxxxxxxxxxx"
```

The `--merge-output-format mp4` flag handles the WebM-to-MP4 problem at download time — yt-dlp downloads the best video and audio streams separately, then muxes them into an MP4 container. If the streams are VP9+Opus (common on YouTube), yt-dlp calls ffmpeg internally to re-mux or re-encode as needed.

The `--download-archive` file means she can re-run this command tomorrow if the organizer adds more videos to the playlist, and it'll only grab the new ones.

But some videos might still end up as WebM if yt-dlp can't merge them cleanly. She runs a cleanup pass.

## Step 2: Convert Any Remaining WebM Files to MP4

After downloading, Marta checks for any stray WebM files and converts them to H.264+AAC — the universal format that works in every editor, every phone, every browser.

```bash
# convert_webm.sh — Batch convert WebM → MP4 with H.264/AAC
# CRF 20 preserves quality for editing (lower than the default 23)
# -movflags +faststart enables instant playback in browsers/editors

cd media/youtube

for f in *.webm; do
  [ -f "$f" ] || continue    # skip if no WebM files exist

  output="${f%.webm}.mp4"

  # Check if already H.264 (rare for WebM, but possible)
  codec=$(ffprobe -v quiet -select_streams v:0 \
    -show_entries stream=codec_name -of csv=p=0 "$f")

  if [ "$codec" = "h264" ]; then
    # Stream copy — instant, no quality loss
    ffmpeg -i "$f" -c copy -movflags +faststart "$output"
  else
    # Re-encode VP9 → H.264 (takes time but necessary for compatibility)
    ffmpeg -i "$f" \
      -c:v libx264 -crf 20 -preset medium \
      -c:a aac -b:a 192k \
      -movflags +faststart \
      "$output"
  fi

  echo "Converted: $f → $output"
done
```

The script probes each file first with `ffprobe` to avoid unnecessary re-encoding. If a WebM somehow contains H.264 already, it just copies the streams (instant). Otherwise, it re-encodes VP9 to H.264 at CRF 20 — slightly higher quality than the default 23, because this footage will go through another round of encoding in the final edit.

## Step 3: Download Speaker Photos from Instagram

The conference Instagram account posted portraits of each speaker. Marta needs high-res versions, not the compressed thumbnails from screenshots.

```bash
# download_instagram.sh — Download speaker photos from Instagram posts
# gallery-dl handles Instagram's authentication and pagination

mkdir -p media/instagram

# Using cookies from the browser (Instagram requires login for full-res)
gallery-dl \
  --cookies-from-browser chrome \
  --filter "extension in ('jpg', 'jpeg', 'png', 'webp')" \
  --download-archive media/instagram/.archive.sqlite3 \
  -d media/instagram \
  "https://www.instagram.com/conference_account/"
```

gallery-dl extracts cookies directly from the installed Chrome browser — no manual cookie export needed. The filter ensures it only downloads images, skipping any Reels or video posts. The archive database prevents re-downloading on future runs.

For WebP images that DaVinci Resolve can't import directly, a quick ffmpeg batch conversion:

```bash
# convert_webp.sh — Convert WebP images to JPEG for editor compatibility
cd media/instagram

for f in *.webp; do
  [ -f "$f" ] || continue
  ffmpeg -i "$f" -q:v 2 "${f%.webp}.jpg"    # -q:v 2 = high quality JPEG
  echo "Converted: $f → ${f%.webp}.jpg"
done
```

## Step 4: Export Media from a Telegram Channel

The organizer's team shared behind-the-scenes clips and backstage photos in a private Telegram channel. Telegram Desktop's export works, but it's manual and slow. Marta uses Telethon for a targeted, automated download.

```python
# download_telegram.py — Download photos and videos from a Telegram channel
# Filters by media type and date range to get only conference-related content

from telethon import TelegramClient
from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
import asyncio
import os
from datetime import datetime, timezone

API_ID = 12345678                # from my.telegram.org
API_HASH = "your_api_hash"
CHANNEL = "@conference_backstage"
OUTPUT_DIR = "media/telegram"

# Conference dates — only download media from this window
START_DATE = datetime(2025, 3, 15, tzinfo=timezone.utc)
END_DATE = datetime(2025, 3, 18, tzinfo=timezone.utc)

async def download_channel_media():
    """
    Download photos and videos from a Telegram channel within a date range.
    Skips audio messages, stickers, and documents to keep only visual media.
    """
    client = TelegramClient("session", API_ID, API_HASH)
    await client.start()

    os.makedirs(f"{OUTPUT_DIR}/photos", exist_ok=True)
    os.makedirs(f"{OUTPUT_DIR}/videos", exist_ok=True)

    entity = await client.get_entity(CHANNEL)
    photo_count = 0
    video_count = 0

    async for msg in client.iter_messages(entity, offset_date=END_DATE, limit=None):
        if msg.date < START_DATE:
            break    # past our date range

        if not msg.media:
            continue

        if isinstance(msg.media, MessageMediaPhoto):
            await msg.download_media(file=f"{OUTPUT_DIR}/photos/")
            photo_count += 1

        elif isinstance(msg.media, MessageMediaDocument):
            mime = msg.media.document.mime_type
            if mime and mime.startswith("video"):
                await msg.download_media(file=f"{OUTPUT_DIR}/videos/")
                video_count += 1

        if (photo_count + video_count) % 20 == 0:
            print(f"Progress: {photo_count} photos, {video_count} videos...")

    print(f"Done: {photo_count} photos, {video_count} videos downloaded")
    await client.disconnect()

asyncio.run(download_channel_media())
```

The script filters by date range (only the 3 conference days) and by media type (photos and videos only — no stickers, voice messages, or PDFs). Telethon handles Telegram's rate limits automatically, sleeping when needed.

## Step 5: Download Assets from an Imgur Gallery

The design team put all infographic assets in an Imgur album. gallery-dl handles Imgur natively.

```bash
# download_imgur.sh — Download all images from an Imgur album
mkdir -p media/imgur

gallery-dl \
  --download-archive media/imgur/.archive.sqlite3 \
  -d media/imgur \
  "https://imgur.com/a/ALBUM_ID"
```

## Step 6: Unified Conversion Pass

After downloading from all sources, Marta runs one final normalization script to ensure every video file is H.264/MP4 and every image is JPEG or PNG.

```bash
# normalize_all.sh — Final pass to normalize all media to editor-friendly formats
# Run from the media/ root directory

echo "=== Normalizing video files ==="
find . -name "*.webm" -o -name "*.mkv" -o -name "*.mov" -o -name "*.avi" | while read f; do
  output="${f%.*}.mp4"
  [ -f "$output" ] && continue    # skip if MP4 version exists

  ffmpeg -i "$f" \
    -c:v libx264 -crf 20 -preset medium \
    -c:a aac -b:a 192k \
    -movflags +faststart \
    "$output" 2>/dev/null

  echo "Video: $(basename "$f") → $(basename "$output")"
done

echo "=== Normalizing image files ==="
find . -name "*.webp" -o -name "*.avif" | while read f; do
  output="${f%.*}.jpg"
  [ -f "$output" ] && continue

  ffmpeg -i "$f" -q:v 2 "$output" 2>/dev/null
  echo "Image: $(basename "$f") → $(basename "$output")"
done

echo "=== Summary ==="
echo "MP4 videos: $(find . -name '*.mp4' | wc -l)"
echo "JPEG images: $(find . -name '*.jpg' -o -name '*.jpeg' | wc -l)"
echo "PNG images: $(find . -name '*.png' | wc -l)"
```

The `find` command recursively processes all subdirectories, so it catches files from every source — YouTube, Instagram, Telegram, Imgur. The `[ -f "$output" ] && continue` guard prevents double-processing if the script is run multiple times.

At the end of this pipeline, Marta has a clean `media/` directory with everything in editor-compatible formats, organized by source, ready to import into DaVinci Resolve.
