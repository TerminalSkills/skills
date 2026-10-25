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
compatibility: 'Python 3.8+ (Linux, macOS, Windows); tested with gallery-dl 1.32.17'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://codeberg.org/mikf/gallery-dl
  category: content
  tags: "gallery-dl, images, download, scrape, reddit"
---

# gallery-dl

## Overview

gallery-dl is a command-line tool for downloading image galleries and collections from over 100 websites — including Instagram, Twitter/X, Reddit, Pixiv, DeviantArt, Tumblr, Flickr, ArtStation, Imgur, and dozens of image boards. It handles authentication, pagination, metadata extraction, and flexible file naming. Think of it as yt-dlp but for images and galleries.

## Instructions

### Step 1: Installation

```bash
# pip (recommended); needs Python 3.8+
pip install gallery-dl

# macOS / Linux with Homebrew
brew install gallery-dl

# Update
pip install -U gallery-dl

# Verify
gallery-dl --version
```

A standalone `gallery-dl.bin` is attached to each release at https://codeberg.org/mikf/gallery-dl/releases (the project's home; the GitHub mirror redirects there). Download it together with `SHA256SUMS`, run `sha256sum -c --ignore-missing SHA256SUMS`, then `chmod +x` it. Video support through yt-dlp is automatic when `yt-dlp` is installed in the same environment.

### Step 2: Basic Downloads

```bash
# Download from a gallery/post URL
gallery-dl "https://www.instagram.com/p/C8aBcDeFgHi/"
gallery-dl "https://www.reddit.com/r/EarthPorn/top/?t=month"
gallery-dl "https://www.pixiv.net/en/artworks/100000000"
gallery-dl "https://imgur.com/a/k3TpL9x"

# Download entire user profile
gallery-dl "https://www.instagram.com/natgeo/"
gallery-dl "https://x.com/nasa/media"
gallery-dl "https://www.deviantart.com/sakimichan"
gallery-dl "https://www.pixiv.net/en/users/11"

# Download into ./downloads (gallery-dl adds its own category folders below it)
gallery-dl -d ./downloads "https://imgur.com/a/k3TpL9x"

# Verbose output; list available keywords for templates and filters
gallery-dl -v "https://imgur.com/a/k3TpL9x"
gallery-dl -K "https://imgur.com/a/k3TpL9x"
```

### Step 3: Output Templates and Organization

gallery-dl uses a powerful template system for organizing downloaded files into directories.

```bash
# Custom filename template (-f is short for the filename option)
gallery-dl -f "{category}_{id}_{title}.{extension}" "https://imgur.com/a/k3TpL9x"

# Directory layout: the value of -o is parsed as JSON, so use double quotes inside single quotes
gallery-dl -o 'directory=["{category}", "{subcategory}"]' "https://imgur.com/a/k3TpL9x"

# Several options at once
gallery-dl -d ./media -o 'directory=["{category}", "{user}", "{date:%Y-%m}"]' "https://www.deviantart.com/sakimichan"
```

Single quotes inside the list (`['{category}']`) are not JSON and make gallery-dl fail with `Single '{' encountered in format string`.

Default directory structure: `./gallery-dl/{category}/{subcategory}/`

### Step 4: Authentication

Many sites require login for full access (age-restricted content, private profiles, higher rate limits).

```bash
# Username + password (prefer a config file or --netrc over typing a password on the command line)
gallery-dl -u "$PIXIV_USER" -p "$PIXIV_PASSWORD" "https://www.pixiv.net/en/users/11"

# Cookie-based authentication (recommended for most sites)
# Export cookies from your browser using a browser extension (e.g., "Get cookies.txt")
gallery-dl --cookies cookies.txt "https://www.instagram.com/natgeo/"

# Browser cookie extraction (auto-extracts from installed browser)
gallery-dl --cookies-from-browser firefox "https://x.com/nasa/media"
gallery-dl --cookies-from-browser chrome "https://x.com/nasa/media"

# OAuth (for Tumblr, DeviantArt, Reddit, etc.)
gallery-dl oauth:reddit          # prints an authorization URL, then saves the token
gallery-dl oauth:deviantart
gallery-dl oauth:tumblr   # also: oauth:flickr, oauth:smugmug, oauth:pixiv, oauth:mastodon:<instance>
```

### Step 5: Filtering and Selection

```bash
# Use -K on a URL to see the keys a filter can use (they differ per site)
gallery-dl -K "https://www.reddit.com/r/EarthPorn/top/?t=year"

# Only images, only large ones (--filter keys are the filename-specific ones from -K)
gallery-dl --filter "extension in ('jpg', 'jpeg', 'png', 'gif', 'webp') and width >= 1920 and height >= 1080" "https://www.reddit.com/r/EarthPorn/top/?t=year"

# Date window on posts (ISO date or Unix timestamp); older posts end the run for date-ordered feeds
gallery-dl --date-after 2025-01-01 --date-before 2026-01-01 "https://www.deviantart.com/sakimichan"

# Size limits
gallery-dl --filesize-min 500k --filesize-max 20M "https://imgur.com/a/k3TpL9x"

# Limit which files are downloaded
gallery-dl --range "1-50" "https://imgur.com/a/k3TpL9x"     # first 50 files
gallery-dl --range "10-20" "https://imgur.com/a/k3TpL9x"    # files 10 through 20

# Stop a feed after 3 files in a row were already downloaded
gallery-dl -A 3 --download-archive archive.sqlite3 "https://x.com/nasa/media"

# Overwrite existing files (default: skip)
gallery-dl --no-skip "https://imgur.com/a/k3TpL9x"
```

### Step 6: Configuration File

gallery-dl supports a JSON configuration file at `~/.config/gallery-dl/config.json` (or `~/.gallery-dl.conf`; `gallery-dl --config-status` lists the paths it checks).

```json
{
  "extractor": {
    "base-directory": "./gallery-dl/",
    "archive": "~/.gallery-dl/archive.sqlite3",
    "sleep": [3.0, 5.0],

    "instagram": {
      "cookies": ["firefox"],
      "directory": ["instagram", "{username}"],
      "filename": "{date:%Y%m%d}_{shortcode}_{num:>02}.{extension}"
    },

    "twitter": {
      "cookies": ["chrome"],
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
    "part-directory": "~/.cache/gallery-dl-parts/"
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
gallery-dl --download-archive archive.sqlite3 "https://x.com/nasa/media"

# Skipped files are printed with a leading "#". To redownload, delete the archive file
# or run with --no-skip.
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
      "command": ["magick", "{_path}", "-resize", "1920x1080>", "{_path}"]
    },
    {
      "name": "zip",
      "compression": "store",
      "extension": "cbz"
    }
  ]
}
```

### Step 9: Supported Sites

Instagram, Twitter/X, Reddit, Tumblr, TikTok, Bluesky, Mastodon, Pixiv, DeviantArt, ArtStation, Newgrounds, Imgur, Flickr, SmugMug, Danbooru, Gelbooru, E621, MangaDex, Webtoons, Tapas, Unsplash, 500px, Patreon, Kemono and many more. `gallery-dl --list-extractors` prints every extractor class.

### Step 10: Batch Downloads

```bash
# Download from URL list file
gallery-dl -i urls.txt

# Combine with rate limiting
gallery-dl -i urls.txt --limit-rate 2M --sleep 3-5

# Download with metadata export (one .json file next to each file)
gallery-dl -i urls.txt --write-metadata

# Collect URLs that failed
gallery-dl -i urls.txt -e failed.txt
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
2. Add `--date-after` for the last year and `--write-metadata` for JSON sidecars. If `width` is not a key for the site, `-K` shows the right name.
3. Run: `gallery-dl --filter "width >= 1920 and height >= 1080" --date-after 2025-10-24 --download-archive dataset_archive.sqlite3 --write-metadata "https://www.reddit.com/r/EarthPorn/top/?t=year"`
4. The JSON metadata files include title, author, score, dimensions, and original URL — useful for dataset labeling.

## Guidelines

- Always use `--download-archive` when downloading from profiles or feeds that update over time; it prevents re-downloading previously saved files on subsequent runs.
- Set up authentication (cookies or OAuth) before downloading from platforms that gate content behind login — Instagram, Pixiv, Patreon, and Twitter all limit unauthenticated access.
- Use `--cookies-from-browser` instead of manual cookie export when possible — it auto-extracts fresh cookies and handles session tokens.
- Apply rate limiting (`"rate": "2M"` under `downloader` and `"sleep": [3.0, 5.0]` under `extractor` in config, or `--limit-rate` / `--sleep` on the command line) to avoid triggering anti-bot measures.
- Test with `--range "1-5"` first to verify your configuration and filename templates before running a full download.
- Respect each site's terms and the rights of the artists; downloaded galleries are usually copyrighted. Site layouts change often, so if an extractor breaks, run `pip install -U gallery-dl` first.
- gallery-dl handles images and galleries; use yt-dlp for dedicated video sites.
