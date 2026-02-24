---
name: gallery-dl
description: >-
  Download images and media galleries from websites with gallery-dl. Use when a
  user asks to download images from Instagram, Twitter/X, Reddit, Pixiv,
  DeviantArt, Danbooru, Tumblr, Flickr, ArtStation, or other image hosting
  sites, bulk download image galleries, archive artist portfolios, scrape images
  with metadata, download from image boards, save entire user profiles or
  tagged collections, or build image dataset pipelines.
license: Apache-2.0
compatibility: 'Python 3.8+ (Linux, macOS, Windows)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags:
    - gallery-dl
    - images
    - download
    - scrape
    - instagram
    - twitter
    - reddit
    - pixiv
---

# gallery-dl

## Overview

gallery-dl is a command-line tool for downloading image galleries and collections from over 100 websites — including Instagram, Twitter/X, Reddit, Pixiv, DeviantArt, Tumblr, Flickr, ArtStation, Imgur, and dozens of image boards. It handles authentication, pagination, metadata extraction, and flexible file naming. Think of it as yt-dlp but for images and galleries.

## Instructions

### Step 1: Installation

```bash
# pip (recommended)
pip install gallery-dl

# With optional dependencies for broader format support
pip install gallery-dl[yt-dlp]    # adds video download support via yt-dlp

# Standalone binary (Linux)
curl -L https://github.com/mikf/gallery-dl/releases/latest/download/gallery-dl.bin -o /usr/local/bin/gallery-dl
chmod +x /usr/local/bin/gallery-dl

# macOS
brew install gallery-dl

# Update
pip install -U gallery-dl

# Verify
gallery-dl --version
```

### Step 2: Basic Downloads

```bash
# Download from a gallery/post URL
gallery-dl "https://www.instagram.com/p/POST_ID/"
gallery-dl "https://twitter.com/user/status/123456789"
gallery-dl "https://www.reddit.com/r/EarthPorn/top/?t=month"
gallery-dl "https://www.pixiv.net/en/artworks/12345678"
gallery-dl "https://imgur.com/a/ALBUM_ID"

# Download entire user profile
gallery-dl "https://www.instagram.com/username/"
gallery-dl "https://twitter.com/username/media"
gallery-dl "https://www.deviantart.com/username"
gallery-dl "https://www.pixiv.net/en/users/USER_ID"

# Download with custom output directory
gallery-dl -d ./downloads "URL"

# Download with verbose output
gallery-dl -v "URL"
```

### Step 3: Output Templates and Organization

gallery-dl uses a powerful template system for organizing downloaded files into directories.

```bash
# Custom filename template
gallery-dl -o "filename={category}_{id}_{title}.{extension}" "URL"

# Organize by site and user
gallery-dl -o "directory=['{category}', '{subcategory}']" "URL"

# Custom directory per site
gallery-dl -o "base-directory=./media" -o "directory=['{category}', '{user}', '{date:%Y-%m}']" "URL"
```

Default directory structure: `./gallery-dl/{category}/{subcategory}/`

### Step 4: Authentication

Many sites require login for full access (age-restricted content, private profiles, higher rate limits).

```bash
# Username + password
gallery-dl -u "username" -p "password" "URL"

# Cookie-based authentication (recommended for most sites)
# Export cookies from your browser using a browser extension (e.g., "Get cookies.txt")
gallery-dl --cookies cookies.txt "URL"

# Browser cookie extraction (auto-extracts from installed browser)
gallery-dl --cookies-from-browser firefox "URL"
gallery-dl --cookies-from-browser chrome "URL"

# OAuth (for Tumblr, DeviantArt, Reddit, etc.)
gallery-dl oauth:reddit          # opens browser for OAuth flow
gallery-dl oauth:deviantart
gallery-dl oauth:tumblr
```

### Step 5: Filtering and Selection

```bash
# Download only images (skip videos)
gallery-dl --filter "extension in ('jpg', 'jpeg', 'png', 'gif', 'webp')" "URL"

# Download only videos
gallery-dl --filter "extension in ('mp4', 'webm', 'mov')" "URL"

# Minimum image dimensions
gallery-dl --filter "width >= 1920 and height >= 1080" "URL"

# Date range
gallery-dl --filter "date >= datetime(2024, 1, 1)" "URL"

# Limit number of downloads
gallery-dl --range "1-50" "URL"       # first 50 items
gallery-dl --range "10-20" "URL"      # items 10 through 20

# Skip files that already exist
gallery-dl --no-skip "URL"    # download even if exists (default: skip)
```

### Step 6: Configuration File

gallery-dl supports a JSON configuration file at `~/.config/gallery-dl/config.json` (or `~/.gallery-dl.conf`).

```json
{
  "extractor": {
    "base-directory": "./gallery-dl/",
    "archive": "~/.gallery-dl/archive.sqlite3",

    "instagram": {
      "cookies-from-browser": "firefox",
      "directory": ["instagram", "{user}"],
      "filename": "{date:%Y%m%d}_{shortcode}_{num:>02}.{extension}",
      "posts": {
        "include": ["image", "video", "sidecar"]
      }
    },

    "twitter": {
      "cookies-from-browser": "chrome",
      "directory": ["twitter", "{user[name]}"],
      "filename": "{date:%Y%m%d}_{tweet_id}_{num:>02}.{extension}",
      "retweets": false,
      "text-tweets": false
    },

    "reddit": {
      "directory": ["reddit", "{subreddit}", "{id}"],
      "comments": 0,
      "morecomments": false
    },

    "pixiv": {
      "directory": ["pixiv", "{user[name]}"],
      "filename": "{id}_p{num:>02}.{extension}",
      "ugoira": true
    }
  },

  "downloader": {
    "rate": "2M",
    "retries": 3,
    "timeout": 30.0,
    "part": true,
    "part-directory": "/tmp/.gallery-dl/"
  },

  "output": {
    "log": {
      "level": "info",
      "format": "{message}"
    }
  },

  "postprocessor": [
    {
      "name": "metadata",
      "mode": "json"
    }
  ]
}
```

### Step 7: Archive and Deduplication

The archive feature tracks downloaded files in a SQLite database, preventing re-downloads on subsequent runs.

```bash
# Use archive file (skip already downloaded)
gallery-dl --download-archive archive.sqlite3 "URL"

# Clear archive for specific URL
gallery-dl --clear-archive archive.sqlite3 "URL"
```

In config:
```json
{
  "extractor": {
    "archive": "~/.gallery-dl/archive.sqlite3"
  }
}
```

### Step 8: Post-Processing

gallery-dl can run post-processors on downloaded files — metadata export, conversion, classification.

```json
{
  "postprocessor": [
    {
      "name": "metadata",
      "mode": "json",
      "directory": "metadata/"
    },
    {
      "name": "exec",
      "command": ["convert", "{_path}", "-resize", "1920x1080>", "{_path}"]
    },
    {
      "name": "zip",
      "compression": "store",
      "extension": "cbz"
    }
  ]
}
```

### Step 9: Supported Sites (Partial List)

Major platforms supported by gallery-dl:

- **Social media:** Instagram, Twitter/X, Reddit, Tumblr, TikTok
- **Art platforms:** Pixiv, DeviantArt, ArtStation, Newgrounds
- **Image hosting:** Imgur, Flickr, SmugMug, Google Photos
- **Image boards:** Danbooru, Gelbooru, Safebooru, E621, Konachan
- **Manga/comics:** MangaDex, Webtoon, Tapas, Dynasty Scans
- **Stock/photography:** Unsplash, 500px
- **Other:** Patreon, Kemono, Cohost, Mastodon, Bluesky, Pillowfort

Full list: `gallery-dl --list-extractors`

### Step 10: Batch Downloads

```bash
# Download from URL list file
gallery-dl -i urls.txt

# Combine with rate limiting
gallery-dl -i urls.txt --rate-limit 2M --sleep 3-5

# Download with metadata export
gallery-dl -i urls.txt --write-metadata
```

## Examples

### Example 1: Archive an artist's complete portfolio from multiple platforms
**User prompt:** "Download all artwork from this artist — they post on Pixiv, Twitter, and DeviantArt. I want everything organized by platform with metadata saved."

The agent will:
1. Set up a config with per-platform directory organization: `{category}/{user}/{date:%Y-%m}/`
2. Enable archive tracking to avoid duplicates: `--download-archive artist_archive.sqlite3`
3. Run gallery-dl for each platform URL with metadata post-processor enabled.
4. The archive database ensures running the same command later only downloads new posts.
5. Report total files downloaded per platform and total disk usage.

### Example 2: Build an image dataset from Reddit
**User prompt:** "I need to collect high-resolution landscape photos from r/EarthPorn for a machine learning dataset. Only images above 1920x1080, from the last year, save metadata as JSON."

The agent will:
1. Configure gallery-dl with dimension filter: `--filter "width >= 1920 and height >= 1080"`
2. Add date filter for the last year and metadata post-processor.
3. Run: `gallery-dl --filter "width >= 1920 and height >= 1080" --download-archive dataset_archive.sqlite3 -o "postprocessor=[{'name': 'metadata', 'mode': 'json'}]" "https://www.reddit.com/r/EarthPorn/top/?t=year"`
4. The JSON metadata files include title, author, score, dimensions, and original URL — useful for dataset labeling.

## Guidelines

- Always use `--download-archive` when downloading from profiles or feeds that update over time; it prevents re-downloading previously saved files on subsequent runs.
- Set up authentication (cookies or OAuth) before downloading from platforms that gate content behind login — Instagram, Pixiv, Patreon, and Twitter all limit unauthenticated access.
- Use `--cookies-from-browser` instead of manual cookie export when possible — it auto-extracts fresh cookies and handles session tokens.
- Apply rate limiting (`"rate": "2M"` and `"sleep": "3-5"` in config) to avoid triggering anti-bot measures.
- Test with `--range "1-5"` first to verify your configuration and filename templates before running a full download.
- gallery-dl pairs well with yt-dlp — gallery-dl handles images and galleries, yt-dlp handles video. Together they cover most content download scenarios.
