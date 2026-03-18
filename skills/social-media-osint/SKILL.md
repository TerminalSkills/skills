---
name: social-media-osint
description: >-
  Social media OSINT techniques and tools for gathering intelligence from public profiles across
  Twitter/X, LinkedIn, Instagram, and Facebook. Use when: investigating individuals or companies,
  finding social footprint, correlating usernames across platforms, mapping professional networks,
  or identifying employees and their public activity.
license: Apache-2.0
compatibility: "Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: security
  tags: [osint, social-media, sherlock, instagram, twitter, linkedin, recon, people-search]
  use-cases:
    - "Find all social media accounts for a target person using a known username"
    - "Build a public profile of a company's employees from LinkedIn and Twitter"
    - "Download public Instagram photos and extract EXIF metadata for geolocation"
    - "Investigate a suspicious account's connections, followers, and post history"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Social Media OSINT

## Overview

Social media platforms expose enormous amounts of voluntarily shared personal and professional information. This skill covers the tools and techniques to systematically gather and analyze publicly available social media intelligence without violating platform terms of service or privacy laws. The primary tools are Sherlock (username search across 400+ platforms), Instaloader (Instagram OSINT), and manual techniques using Google dorks and the Wayback Machine.

**Always verify you have authorization or a legitimate OSINT purpose before investigating individuals.**

## Instructions

### Tool 1: Sherlock — Username search across 400+ platforms

```bash
# Install
pip install sherlock-project
# or
git clone https://github.com/sherlock-project/sherlock.git
cd sherlock
pip install -r requirements.txt

# Search for a username on all supported sites
python3 sherlock username
sherlock username  # if installed via pip

# Search multiple usernames
sherlock username1 username2 username3

# Output to file
sherlock username --output username_results.txt
sherlock username --csv --output username_results.csv

# Only print found accounts (skip not found)
sherlock username --print-found

# Search specific sites only
sherlock username --site Twitter --site GitHub --site Reddit

# Use Tor for anonymity (requires Tor running on localhost:9050)
sherlock username --tor
```

```python
import subprocess
import json
import re

def sherlock_search(username, output_csv=True):
    """Run Sherlock for a username and return found accounts."""
    output_file = f"sherlock_{username}"
    cmd = ["sherlock", username, "--print-found"]
    if output_csv:
        cmd += ["--csv", "--output", f"{output_file}.csv"]

    print(f"Searching for username: {username}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

    # Parse stdout for found accounts
    found = []
    for line in result.stdout.split("\n"):
        if "[+]" in line:
            # Extract URL from the line
            url_match = re.search(r'https?://\S+', line)
            site_match = re.search(r'\[+\]\s+(\w+):', line)
            if url_match:
                found.append({
                    "site": site_match.group(1) if site_match else "unknown",
                    "url": url_match.group(0).strip(),
                })

    print(f"Found {len(found)} accounts for '{username}':")
    for account in found:
        print(f"  [{account['site']}] {account['url']}")

    return found

accounts = sherlock_search("johndoe123")
```

### Tool 2: Instaloader — Instagram OSINT

```bash
# Install
pip install instaloader

# Download public profile metadata (no login required for public accounts)
instaloader --no-pictures --no-videos --no-captions \
  --metadata-json --comments \
  INSTAGRAM_USERNAME

# Download posts with metadata
instaloader INSTAGRAM_USERNAME

# Download profile picture only
instaloader --no-posts INSTAGRAM_USERNAME

# Analyze followers (requires login for private accounts)
instaloader --login=YOUR_ACCOUNT INSTAGRAM_USERNAME
```

```python
import instaloader
import json
from datetime import datetime

def get_instagram_profile(username, download_posts=False, max_posts=50):
    """Fetch public Instagram profile data."""
    L = instaloader.Instaloader(
        download_pictures=download_posts,
        download_videos=False,
        download_video_thumbnails=False,
        save_metadata=True,
        compress_json=False,
    )

    try:
        profile = instaloader.Profile.from_username(L.context, username)

        data = {
            "username": profile.username,
            "full_name": profile.full_name,
            "biography": profile.biography,
            "followers": profile.followers,
            "following": profile.followees,
            "posts_count": profile.mediacount,
            "is_private": profile.is_private,
            "is_verified": profile.is_verified,
            "external_url": profile.external_url,
            "business_category": profile.business_category_name,
            "profile_pic_url": profile.profile_pic_url,
        }

        print(f"\n=== Instagram: @{username} ===")
        for k, v in data.items():
            if v:
                print(f"  {k}: {v}")

        if not profile.is_private and download_posts:
            posts = []
            for post in profile.get_posts():
                posts.append({
                    "shortcode": post.shortcode,
                    "date": post.date_utc.isoformat(),
                    "caption": post.caption[:200] if post.caption else "",
                    "likes": post.likes,
                    "comments": post.comments,
                    "location": str(post.location) if post.location else None,
                    "tagged_users": post.tagged_users,
                    "url": f"https://www.instagram.com/p/{post.shortcode}/",
                })
                if len(posts) >= max_posts:
                    break

            print(f"\nAnalyzed {len(posts)} posts")
            locations = [p["location"] for p in posts if p["location"]]
            if locations:
                print(f"Locations mentioned: {set(locations)}")
            tagged = [u for p in posts for u in p["tagged_users"]]
            if tagged:
                print(f"Frequently tagged: {set(tagged[:20])}")

            data["posts"] = posts

        return data
    except instaloader.exceptions.ProfileNotExistsException:
        print(f"Profile @{username} does not exist.")
        return None
    except instaloader.exceptions.PrivateProfileNotFollowedException:
        print(f"Profile @{username} is private.")
        return None

profile_data = get_instagram_profile("instagram", download_posts=True, max_posts=20)
```

### Tool 3: Google Dorks for social media discovery

```python
# Google dorks to find social media profiles and activity
# Use these queries in a browser or via a search API

SOCIAL_DORKS = {
    "linkedin_profile": 'site:linkedin.com/in/ "{first_name} {last_name}" "{company}"',
    "twitter_profile": 'site:twitter.com "{name}" OR site:x.com "{name}"',
    "instagram_profile": 'site:instagram.com "{username}"',
    "facebook_profile": 'site:facebook.com "{first_name} {last_name}"',
    "github_profile": 'site:github.com "{name}" "{company}"',
    "reddit_profile": 'site:reddit.com/user/ "{username}"',
    "youtube_channel": 'site:youtube.com/c/ OR site:youtube.com/@  "{name}"',
    "twitter_mentions": 'site:twitter.com "@{username}"',
    "cached_profile": 'cache:twitter.com/{username}',
    "linkedin_employees": 'site:linkedin.com/in/ "* at {company}"',
    "email_on_twitter": 'site:twitter.com "{email}"',
    "domain_on_linkedin": 'site:linkedin.com "{domain}" employees',
}

def build_google_dork(template, **kwargs):
    """Generate a Google dork search URL."""
    query = template.format(**kwargs)
    encoded = query.replace('"', '%22').replace(' ', '+')
    return f"https://www.google.com/search?q={encoded}"

# Examples
print(build_google_dork(SOCIAL_DORKS["linkedin_profile"],
                        first_name="John", last_name="Smith", company="Acme Corp"))
print(build_google_dork(SOCIAL_DORKS["linkedin_employees"], company="Example Corporation"))
```

### Tool 4: Wayback Machine — archived social profiles

```python
import requests

def wayback_search(url, limit=10):
    """
    Search the Wayback Machine CDX API for archived snapshots of a URL.
    Useful for recovering deleted profiles, old profile photos, and historical content.
    """
    cdx_url = "https://web.archive.org/cdx/search/cdx"
    params = {
        "url": url,
        "output": "json",
        "limit": limit,
        "fl": "timestamp,statuscode,original",
        "filter": "statuscode:200",
        "collapse": "timestamp:6",  # One per month
    }
    resp = requests.get(cdx_url, params=params, timeout=30)
    data = resp.json()

    if len(data) <= 1:  # First row is headers
        print(f"No archived snapshots found for {url}")
        return []

    results = []
    for row in data[1:]:  # Skip header row
        timestamp, status, original = row
        archive_url = f"https://web.archive.org/web/{timestamp}/{original}"
        print(f"  [{timestamp[:8]}] {archive_url}")
        results.append({"timestamp": timestamp, "url": archive_url})

    return results

# Find archived versions of a Twitter profile
wayback_search("https://twitter.com/username", limit=10)

# Find deleted LinkedIn profile
wayback_search("https://linkedin.com/in/johndoe", limit=5)

# Find archived company social pages
wayback_search("https://www.facebook.com/companyname", limit=5)
```

### Tool 5: Comprehensive target profile builder

```python
def build_social_profile(target_name, username=None, company=None, domain=None):
    """
    Build a comprehensive social media profile for a target.
    Combines Sherlock, Instagram, and Wayback Machine.
    """
    profile = {
        "target": target_name,
        "username": username,
        "company": company,
        "domain": domain,
        "accounts": {},
        "dorks": [],
    }

    # Username search across platforms
    if username:
        print(f"\n[1/4] Sherlock username search: {username}")
        accounts = sherlock_search(username)
        profile["accounts"]["sherlock"] = accounts

        # Instagram-specific deep dive
        if any("instagram" in a["url"].lower() for a in accounts):
            print(f"\n[2/4] Instagram profile analysis")
            ig_data = get_instagram_profile(username)
            profile["accounts"]["instagram"] = ig_data
    
    # Generate relevant Google dorks
    print(f"\n[3/4] Building Google dorks")
    if target_name:
        name_parts = target_name.split()
        if len(name_parts) >= 2:
            profile["dorks"].append(build_google_dork(
                SOCIAL_DORKS["linkedin_profile"],
                first_name=name_parts[0], last_name=name_parts[-1],
                company=company or ""
            ))

    if company:
        profile["dorks"].append(build_google_dork(
            SOCIAL_DORKS["linkedin_employees"], company=company
        ))

    # Wayback Machine lookups
    print(f"\n[4/4] Wayback Machine lookups")
    if username:
        profile["wayback"] = {
            "twitter": wayback_search(f"https://twitter.com/{username}", limit=5),
            "instagram": wayback_search(f"https://instagram.com/{username}", limit=5),
        }

    # Save profile
    output_file = f"social_profile_{(username or target_name).lower().replace(' ', '_')}.json"
    with open(output_file, "w") as f:
        json.dump(profile, f, indent=2, default=str)
    print(f"\nProfile saved to {output_file}")

    return profile

build_social_profile("John Smith", username="jsmith_dev", company="TechCorp")
```

## Key Data Points to Collect

| Platform | Key Intelligence |
|----------|-----------------|
| **LinkedIn** | Job title, employer, education, skills, connections, work history |
| **Twitter/X** | Interests, location, network, opinions, timing patterns |
| **Instagram** | Geolocation (posts/stories), relationships, lifestyle, tagged users |
| **Facebook** | Family connections, political views, groups, check-ins |
| **GitHub** | Technical skills, projects, employer email (git config), code patterns |
| **Reddit** | Interests, opinions, subreddit activity, username linkages |

## Guidelines

- **Legal boundaries**: OSINT from public profiles is legal in most jurisdictions, but scraping may violate platform ToS. For authorized investigations, use manual browsing or official APIs.
- **Instaloader rate limits**: Instagram aggressively rate-limits scrapers. Add delays, use authenticated sessions carefully, and avoid downloading thousands of posts in one session.
- **EXIF metadata**: Photos uploaded to platforms like Twitter and older Instagram versions may retain GPS coordinates in EXIF data. Download images and check with `exiftool`.
- **Username uniqueness**: Most people reuse usernames across platforms. A unique username found on one platform is often used on many others.
- **Sock puppets**: Be aware that sophisticated targets may have decoy or misinformation profiles. Cross-reference data across multiple sources before drawing conclusions.
