---
name: yt-dlp
description: >-
  Download video and audio from YouTube and other platforms with yt-dlp. Use
  when a user asks to download YouTube videos, extract audio from videos,
  download playlists, get subtitles, download specific formats or qualities,
  batch download, archive channels, extract metadata, embed thumbnails,
  download from social media platforms (Twitter, Instagram, TikTok), or
  build media ingestion pipelines. Covers format selection, audio extraction,
  playlists, subtitles, metadata, and automation.
license: Apache-2.0
compatibility: "Python 3.8+ or standalone binary (Linux, macOS, Windows)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: audio
  tags: ["yt-dlp", "youtube", "download", "audio", "video", "media", "extraction"]
---

# yt-dlp

## Overview

Download and extract media from YouTube and 1000+ other sites using yt-dlp — the actively maintained fork of youtube-dl. This skill covers audio extraction (MP3/FLAC/WAV), video download with quality selection, playlist handling, subtitle download, metadata extraction, thumbnail embedding, batch operations, channel archiving, and integration with processing pipelines (ffmpeg, whisper).

## Instructions

### Step 1: Installation

```bash
# pip (recommended)
pip install yt-dlp

# Standalone binary
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod +x /usr/local/bin/yt-dlp

# Update
yt-dlp -U

# Verify
yt-dlp --version
```

**ffmpeg is required** for merging formats and audio conversion:
```bash
apt install -y ffmpeg    # Ubuntu/Debian
brew install ffmpeg      # macOS
```

### Step 2: Audio Extraction

```bash
# Download best audio, convert to MP3
yt-dlp -x --audio-format mp3 "https://youtube.com/watch?v=VIDEO_ID"

# Best audio as FLAC (lossless)
yt-dlp -x --audio-format flac "URL"

# Best audio as WAV
yt-dlp -x --audio-format wav "URL"

# MP3 with specific quality (0=best, 9=worst)
yt-dlp -x --audio-format mp3 --audio-quality 0 "URL"

# Keep original format (no conversion)
yt-dlp -x "URL"

# Download audio + embed thumbnail as album art
yt-dlp -x --audio-format mp3 --embed-thumbnail "URL"

# Download audio + embed metadata (title, artist, etc.)
yt-dlp -x --audio-format mp3 --embed-metadata --embed-thumbnail "URL"

# Custom output filename
yt-dlp -x --audio-format mp3 -o "%(title)s.%(ext)s" "URL"
yt-dlp -x --audio-format mp3 -o "%(uploader)s - %(title)s.%(ext)s" "URL"
```

### Step 3: Video Download

```bash
# Best quality (video + audio merged)
yt-dlp "URL"

# List available formats
yt-dlp -F "URL"
# Output: ID  EXT  RESOLUTION  FPS  FILESIZE  CODEC  BITRATE

# Download specific format by ID
yt-dlp -f 137+140 "URL"    # 1080p video + best audio

# Best video up to 1080p
yt-dlp -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" "URL"

# Best video up to 720p, prefer MP4
yt-dlp -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]" "URL"

# Only 4K if available
yt-dlp -f "bestvideo[height>=2160]+bestaudio" "URL"

# Smallest file
yt-dlp -f "worstvideo+worstaudio/worst" "URL"

# MP4 output (re-mux if needed)
yt-dlp --merge-output-format mp4 "URL"
```

### Step 4: Playlists & Channels

```bash
# Download entire playlist
yt-dlp "https://youtube.com/playlist?list=PLAYLIST_ID"

# Playlist: audio only
yt-dlp -x --audio-format mp3 "PLAYLIST_URL"

# Download specific items from playlist
yt-dlp --playlist-start 5 --playlist-end 10 "PLAYLIST_URL"    # Items 5-10
yt-dlp --playlist-items 1,3,5,7-10 "PLAYLIST_URL"             # Specific items

# Download entire channel
yt-dlp "https://youtube.com/@ChannelName/videos"

# Download channel with organized folders
yt-dlp -o "%(uploader)s/%(playlist)s/%(title)s.%(ext)s" "CHANNEL_URL"

# Only videos from last 30 days
yt-dlp --dateafter today-30days "CHANNEL_URL"

# Skip already downloaded (archive file)
yt-dlp --download-archive archive.txt "PLAYLIST_URL"
# Subsequent runs skip already downloaded videos
```

### Step 5: Subtitles

```bash
# Download video + subtitles
yt-dlp --write-sub --sub-lang en "URL"

# Download auto-generated subtitles
yt-dlp --write-auto-sub --sub-lang en "URL"

# All available subtitles
yt-dlp --write-sub --all-subs "URL"

# Subtitles only (no video)
yt-dlp --skip-download --write-sub --sub-lang en "URL"

# Convert subtitles to SRT
yt-dlp --write-sub --sub-lang en --convert-subs srt "URL"

# Embed subtitles into video file
yt-dlp --embed-subs --sub-lang en "URL"

# List available subtitle languages
yt-dlp --list-subs "URL"
```

### Step 6: Metadata & Information

```bash
# Print video info (no download)
yt-dlp --dump-json "URL" | python3 -m json.tool

# Extract specific fields
yt-dlp --print "%(title)s | %(duration)s | %(view_count)s" "URL"

# Get thumbnail URL
yt-dlp --get-thumbnail "URL"

# Download thumbnail only
yt-dlp --skip-download --write-thumbnail "URL"

# Download description
yt-dlp --skip-download --write-description "URL"

# Download comments
yt-dlp --skip-download --write-comments "URL"

# Get video info as JSON for a playlist
yt-dlp --dump-json --flat-playlist "PLAYLIST_URL"
```

### Step 7: Output Templates

```bash
# Available fields: title, uploader, upload_date, duration, view_count, like_count, ext, id, etc.

# Organized by channel and date
yt-dlp -o "%(uploader)s/%(upload_date)s - %(title)s.%(ext)s" "URL"

# Podcast-style naming
yt-dlp -x --audio-format mp3 -o "podcasts/%(playlist)s/%(playlist_index)03d - %(title)s.%(ext)s" "PLAYLIST_URL"

# Sanitize filenames (remove special chars)
yt-dlp -o "%(title).100B.%(ext)s" "URL"    # Limit title to 100 bytes

# Number files in playlist
yt-dlp -o "%(playlist_index)03d - %(title)s.%(ext)s" "PLAYLIST_URL"
```

### Step 8: Batch Operations

```bash
# Download from a list of URLs
cat urls.txt
# https://youtube.com/watch?v=VIDEO1
# https://youtube.com/watch?v=VIDEO2
# https://youtube.com/watch?v=VIDEO3

yt-dlp -a urls.txt -x --audio-format mp3

# With archive (skip already downloaded)
yt-dlp -a urls.txt --download-archive done.txt -x --audio-format mp3

# Rate limiting (be nice to servers)
yt-dlp --rate-limit 5M --sleep-interval 5 --max-sleep-interval 30 -a urls.txt

# Retry on failure
yt-dlp --retries 10 --fragment-retries 10 "URL"

# Parallel downloads (playlist items)
yt-dlp -N 4 "PLAYLIST_URL"    # 4 concurrent downloads
```

### Step 9: Other Platforms

yt-dlp supports 1000+ sites beyond YouTube:

```bash
# Twitter/X
yt-dlp "https://twitter.com/user/status/123456789"

# Instagram (post, reel, story)
yt-dlp "https://www.instagram.com/p/POST_ID/"

# TikTok
yt-dlp "https://www.tiktok.com/@user/video/123456789"

# Reddit (video posts)
yt-dlp "https://www.reddit.com/r/subreddit/comments/abc123/"

# Twitch (VODs, clips)
yt-dlp "https://www.twitch.tv/videos/123456789"

# SoundCloud
yt-dlp "https://soundcloud.com/artist/track-name"

# Vimeo
yt-dlp "https://vimeo.com/123456789"

# Podcast RSS feed
yt-dlp "https://feeds.example.com/podcast.xml"

# List supported sites
yt-dlp --list-extractors
```

### Step 10: Pipeline Integration

```bash
# Download → extract audio → transcribe with Whisper
yt-dlp -x --audio-format wav -o "temp.%(ext)s" "URL"
whisper temp.wav --model small --output_format srt

# Download podcast → normalize → generate waveform
yt-dlp -x --audio-format wav -o "episode.%(ext)s" "URL"
sox episode.wav normalized.wav norm -1 highpass 80
audiowaveform -i normalized.wav -o waveform.json --pixels-per-second 20

# Python integration
import subprocess, json

def get_video_info(url):
    result = subprocess.run(
        ["yt-dlp", "--dump-json", url],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)

def download_audio(url, output_dir="./"):
    subprocess.run([
        "yt-dlp", "-x", "--audio-format", "mp3",
        "--audio-quality", "0",
        "--embed-thumbnail", "--embed-metadata",
        "-o", f"{output_dir}/%(title)s.%(ext)s",
        url
    ], check=True)

# Node.js integration
import { execSync } from "child_process";

function downloadAudio(url: string, outputDir: string) {
  execSync(
    `yt-dlp -x --audio-format mp3 --audio-quality 0 -o "${outputDir}/%(title)s.%(ext)s" "${url}"`,
    { stdio: "inherit" }
  );
}

function getVideoInfo(url: string) {
  const result = execSync(`yt-dlp --dump-json "${url}"`).toString();
  return JSON.parse(result);
}
```

### Step 11: Configuration File

Save defaults in `~/.config/yt-dlp/config`:

```
# Default format: best 1080p MP4
-f bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]

# Output template
-o %(uploader)s/%(title)s.%(ext)s

# Embed metadata
--embed-metadata
--embed-thumbnail

# Archive
--download-archive ~/.local/share/yt-dlp/archive.txt

# Rate limiting
--rate-limit 10M
--sleep-interval 3

# Subtitles
--write-auto-sub
--sub-lang en
--convert-subs srt
```
