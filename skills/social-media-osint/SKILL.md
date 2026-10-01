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
  version: "1.1.0"
  category: research
  tags: [social-media, sherlock, people-search, linkedin, twitter]
  use-cases:
    - "Find all social media accounts for a target person using a known username"
    - "Build a public profile of a company's employees from LinkedIn and Twitter"
    - "Collect public Instagram profile metadata for an account under investigation"
    - "Recover archived versions of a deleted or renamed profile"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Social Media OSINT

## Overview

Social media platforms expose enormous amounts of voluntarily shared personal and professional information. This skill covers the tools and techniques to systematically gather and analyze publicly available social media intelligence without violating platform terms of service or privacy laws. The primary tools are Sherlock (username search across 400+ sites), Instaloader (Instagram metadata), and manual techniques using search-engine dorks and the Wayback Machine.

**Always verify you have authorization or a legitimate OSINT purpose before investigating individuals.** Typical authorized contexts: a penetration test or social-engineering assessment with a signed scope, brand-impersonation monitoring for your own organization, due diligence, journalism, and fraud investigation.

## Instructions

### Tool 1: Sherlock — Username search across 400+ sites

```bash
# Install into an isolated environment
pipx install sherlock-project          # or: pip install sherlock-project inside a virtualenv

sherlock northwind_ops                                  # every supported site (400+)
sherlock northwind_ops northwindlogistics               # several usernames
sherlock "northwind{?}ops"                              # also tries _ - . in place of {?}
sherlock northwind_ops --site GitHub --site Reddit --site Instagram
sherlock northwind_ops --print-found --csv --txt        # writes northwind_ops.csv and northwind_ops.txt
sherlock northwind_ops northwindlogistics --csv --folderoutput findings   # one CSV per username in findings/
sherlock northwind_ops --timeout 20 --proxy socks5h://127.0.0.1:9050      # local Tor SOCKS proxy; socks5h also sends DNS lookups through it
```

Sherlock 0.16 writes no file unless `--txt`, `--csv` or `--xlsx` is given, `--output` does not create missing directories (`--folderoutput` does), and there is no `--tor` flag (use `--proxy`). A site is skipped when the handle breaks its username rules: GitHub allows no underscore, so `northwind_ops` is never checked there (`--print-all` shows `Illegal Username Format For This Site!`). The CSV has the columns `username,name,url_main,url_user,exists,http_status,response_time_s`; `exists` is `Claimed` for a hit.

```python
import csv
import subprocess
import tempfile
from pathlib import Path

def sherlock_search(username, sites=None, timeout=20):
    """Run Sherlock and return the accounts it reports as claimed."""
    with tempfile.TemporaryDirectory() as out_dir:
        cmd = ["sherlock", username, "--print-found", "--no-color", "--csv",
               "--folderoutput", out_dir, "--timeout", str(timeout)]
        for site in sites or []:
            cmd += ["--site", site]
        subprocess.run(cmd, capture_output=True, text=True, timeout=1800, check=True)
        with open(Path(out_dir) / f"{username}.csv", newline="") as f:
            return [{"site": row["name"], "url": row["url_user"]}
                    for row in csv.DictReader(f) if row["exists"] == "Claimed"]

for account in sherlock_search("northwind_ops", sites=["GitHub", "Reddit", "Instagram"]):
    print(f"[{account['site']}] {account['url']}")
```

### Tool 2: Instaloader — Instagram metadata

```bash
pip install instaloader                 # inside a virtualenv

# Profile and post metadata as JSON, no media files
instaloader --no-pictures --no-videos --no-video-thumbnails --no-captions --no-compress-json northwindlogistics

# Profile picture only, no posts
instaloader --no-posts northwindlogistics

# Logged-in session (prompts for the password, stores a session file): needed for
# private profiles the account follows, --comments, --geotags and --stories
instaloader --login=nwl_research --sessionfile=./ig-session --comments northwindlogistics
```

```python
import instaloader

def get_instagram_profile(username, max_posts=0):
    """Fetch public Instagram profile data; returns None when it is unavailable."""
    L = instaloader.Instaloader(download_pictures=False, download_videos=False,
                                download_video_thumbnails=False, save_metadata=False)
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
        }
        posts = []
        if max_posts and not profile.is_private:
            for post in profile.get_posts():
                posts.append({
                    "url": f"https://www.instagram.com/p/{post.shortcode}/",
                    "date": post.date_utc.isoformat(),
                    "caption": (post.caption or "")[:200],
                    "likes": post.likes,
                    "tagged_users": post.tagged_users,
                    "location": post.location.name if post.location else None,  # None unless logged in
                })
                if len(posts) >= max_posts:
                    break
        data["posts"] = posts
        return data
    except instaloader.exceptions.ProfileNotExistsException:
        print(f"Profile @{username} does not exist.")
    except instaloader.exceptions.LoginRequiredException:
        print(f"Instagram requires a logged-in session for @{username}.")
    except instaloader.exceptions.ConnectionException as err:   # includes 429 Too Many Requests
        print(f"Instagram refused the request: {err}")
    return None
```

Anonymous requests are often refused outright (`429 Too Many Requests` on the first call), especially from cloud, VPN and proxy addresses; Instaloader's documentation notes that logged-in access is not affected in the same way.

### Tool 3: Search-engine dorks for social media discovery

```python
from urllib.parse import quote_plus

SOCIAL_DORKS = {
    "linkedin_profile": 'site:linkedin.com/in/ "{first_name} {last_name}" "{company}"',
    "linkedin_employees": 'site:linkedin.com/in/ "{company}"',
    "x_profile": 'site:x.com "{name}" OR site:twitter.com "{name}"',
    "x_mentions": 'site:x.com "@{username}"',
    "instagram_profile": 'site:instagram.com "{username}"',
    "facebook_profile": 'site:facebook.com "{first_name} {last_name}"',
    "github_profile": 'site:github.com "{name}" "{company}"',
    "reddit_profile": 'site:reddit.com/user/ "{username}"',
    "youtube_channel": 'site:youtube.com/@{username}',
    "email_mentions": '"{email}" -site:{domain}',
}

def build_dork_url(template, **kwargs):
    """Return a Google search URL for a dork; open it in a browser."""
    return "https://www.google.com/search?q=" + quote_plus(template.format(**kwargs))

print(build_dork_url(SOCIAL_DORKS["linkedin_employees"], company="Northwind Logistics"))
# https://www.google.com/search?q=site%3Alinkedin.com%2Fin%2F+%22Northwind+Logistics%22
```

Google's `cache:` operator and cached-page links were retired in 2024; use the Wayback Machine for old copies.

### Tool 4: Wayback Machine — archived social profiles

```python
import requests

def wayback_search(url, limit=10):
    """List archived snapshots of a URL via the Wayback Machine CDX API (one per month)."""
    params = {
        "url": url,
        "output": "json",
        "limit": limit,
        "fl": "timestamp,statuscode,original",
        "filter": "statuscode:200",
        "collapse": "timestamp:6",      # first 6 digits = YYYYMM
    }
    resp = requests.get("https://web.archive.org/cdx/search/cdx", params=params, timeout=120)
    resp.raise_for_status()
    rows = resp.json()
    results = []
    for timestamp, _status, original in rows[1:]:      # first row is the header
        archive_url = f"https://web.archive.org/web/{timestamp}/{original}"
        print(f"  [{timestamp[:8]}] {archive_url}")
        results.append({"timestamp": timestamp, "url": archive_url})
    return results

wayback_search("twitter.com/northwind_ops", limit=10)      # old handle, old domain
wayback_search("linkedin.com/company/northwind-logistics", limit=5)
```

### Tool 5: Combined footprint report

```python
import json

def build_social_profile(target_name, username=None, company=None):
    """Combine Sherlock, Instaloader, dorks and the Wayback Machine into one JSON report."""
    report = {"target": target_name, "username": username, "company": company,
              "accounts": [], "instagram": None, "dorks": [], "wayback": {}}
    if username:
        report["accounts"] = sherlock_search(username)
        if any(a["site"] == "Instagram" for a in report["accounts"]):
            report["instagram"] = get_instagram_profile(username)
        for site in ("twitter.com", "instagram.com"):
            report["wayback"][site] = wayback_search(f"{site}/{username}", limit=5)
    if company:
        report["dorks"].append(build_dork_url(SOCIAL_DORKS["linkedin_employees"], company=company))
    out_file = f"social_profile_{(username or target_name).lower().replace(' ', '_')}.json"
    with open(out_file, "w") as f:
        json.dump(report, f, indent=2, default=str)
    return report
```

### Key data points to collect

| Platform | Key Intelligence |
|----------|-----------------|
| **LinkedIn** | Job title, employer, education, skills, connections, work history |
| **Twitter/X** | Interests, location, network, opinions, timing patterns |
| **Instagram** | Tagged locations, relationships, lifestyle, tagged users |
| **Facebook** | Family connections, political views, groups, check-ins |
| **GitHub** | Technical skills, projects, commit email addresses, code patterns |
| **Reddit** | Interests, opinions, subreddit activity, username linkages |

## Examples

### Example 1: Find accounts that use a company's handle

**User prompt:** "We're Northwind Logistics. Check where the handle `northwind_ops` is registered so we can spot impersonators."

```bash
sherlock northwind_ops northwindlogistics --print-found --csv --folderoutput findings --timeout 20
```

```
[*] Checking username northwind_ops on:

[+] Instagram: https://instagram.com/northwind_ops
[+] Reddit: https://www.reddit.com/user/northwind_ops

[*] Checking username northwindlogistics on:

[+] GitHub: https://www.github.com/northwindlogistics

[*] Search completed with 3 results
```

`findings/northwind_ops.csv` and `findings/northwindlogistics.csv` hold one row per claimed account. Open each URL and compare it with the list of accounts the company actually owns; report the rest as possible impersonation, with a screenshot and the date.

### Example 2: Recover the history of a renamed account

**User prompt:** "Our old support account @northwind_help was renamed last year. Find archived copies of the old profile for the incident report."

```python
snapshots = wayback_search("twitter.com/northwind_help", limit=12)
print(len(snapshots), "monthly snapshots")
```

```
  [20230114] https://web.archive.org/web/20230114091522/https://twitter.com/northwind_help
  [20230203] https://web.archive.org/web/20230203174410/https://twitter.com/northwind_help
2 monthly snapshots
```

Each line is the first successful capture of a month. An empty list means the page was never archived with status 200 — repeat the query with the `x.com` host and without the `filter` parameter before concluding that nothing exists.

## Guidelines

- **Authorization and law**: collecting public data is legal in most jurisdictions, but purpose matters. Get the scope in writing, and remember that GDPR and similar laws apply to personal data even when it is public — collect only what the engagement needs and delete it afterwards.
- **Platform terms**: automated scraping violates the terms of Instagram, LinkedIn, X and Facebook, and logging in with an account to scrape can get that account suspended. Prefer manual browsing or official APIs; never use these tools to access private content you are not entitled to see.
- **A hit is not an identity**: Sherlock only reports that a username exists on a site. Common handles belong to different people, and some sites return false positives. Confirm with a second signal (same avatar, bio, linked accounts) before attributing an account.
- **Instaloader rate limits**: Instagram throttles aggressively. Do not restart Instaloader in a loop, keep one session file instead of logging in repeatedly, and avoid downloading thousands of posts in one run.
- **EXIF is usually gone**: X, Instagram and Facebook strip EXIF (including GPS) from the copies they serve, so downloaded platform images rarely carry coordinates. `exiftool -gps:all IMG_4471.jpg` is worth running only on original files obtained elsewhere — personal sites, forums, file shares.
- **Wayback limits**: login-walled pages (most Instagram, LinkedIn and recent X profiles) are archived poorly; the CDX API is slow and rate-limited, so keep `limit` small and back off on HTTP 429, 503 or 504 (`wayback_search` raises `requests.HTTPError` on them).
- **Decoy accounts**: sophisticated subjects keep misleading or abandoned profiles. Cross-reference several sources before drawing conclusions.
- **Do not publish**: findings about individuals go to the client or case file, not to public channels. Never use this skill for stalking, harassment or doxxing.
