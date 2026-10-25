---
name: google-indexing
description: >-
  Submit URLs to Google for indexing using the Google Indexing API and
  bulk-submit from sitemaps. Use when a user asks to index pages on Google,
  submit URLs to Google Search Console, speed up Google indexing, request
  crawling, bulk index pages, submit a sitemap's URLs for indexing, or check
  indexing status. Also use when the user mentions "Google Indexing API",
  "request indexing", "submit to Google", or "pages not indexed".
license: Apache-2.0
compatibility: "Requires Python 3.9+ with google-auth and requests libraries (pip install google-auth requests), and a Google Cloud service account with Indexing API enabled"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: automation
  tags: "google, indexing, seo, search-console, sitemap"
---

# Google Indexing

## Overview

Submit URLs to Google with the Indexing API and service account authentication. Supports single URL submission, bulk submission from sitemaps, and notification-status checks.

**Important limit:** Google documents the Indexing API only for pages with `JobPosting` structured data or `BroadcastEvent` inside a `VideoObject` (livestreams). For ordinary pages (blog posts, product or docs pages) Google's supported routes are the URL Inspection tool's "Request indexing" in Search Console (a few URLs, quota-limited) and sitemaps. Use this API for eligible pages, and tell the user plainly when theirs are not.

## Instructions

When a user asks to submit URLs to Google for indexing, follow these steps:

### Step 1: Verify credentials are set up

The Google Indexing API requires a Google Cloud service account. Check that the user has:

1. A Google Cloud project with the **Indexing API** enabled
2. A service account JSON key file
3. The property verified in Search Console, with the service account email added as a **delegated owner** (property Settings → Users and permissions → Add user → Owner; Google's docs call it adding an owner under the verified owner list)

If the user doesn't have these, walk them through the setup:

```bash
# 1. Enable the Indexing API
# Visit: https://console.cloud.google.com/apis/library/indexing.googleapis.com

# 2. Create a service account and download JSON key
# Visit: https://console.cloud.google.com/iam-admin/serviceaccounts
# Create account → Keys → Add Key → JSON → Download

# 3. Add the service account email as Owner in Search Console
# Visit: https://search.google.com/search-console → Settings → Users and permissions
# Add the service account email (e.g., my-indexer@terminal-skills-prod.iam.gserviceaccount.com) as Owner
```

Verify the key file exists and is valid:

```bash
python3 -c "
import json
with open('service-account.json') as f:
    sa = json.load(f)
print(f'Project:  {sa[\"project_id\"]}')
print(f'Email:    {sa[\"client_email\"]}')
print('Key file is valid.')
"
```

### Step 2: Submit URLs for indexing

**Single URL submission:**

```python
import json
import time
import requests
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

import os

SCOPES = ["https://www.googleapis.com/auth/indexing"]
ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications:publish"
CREDENTIALS_FILE = os.environ["GOOGLE_APPLICATION_CREDENTIALS"]   # path to the key file; never hard-code or commit it

def get_auth_session(credentials_file):
    credentials = service_account.Credentials.from_service_account_file(
        credentials_file, scopes=SCOPES
    )
    return AuthorizedSession(credentials)  # fetches and refreshes the token

def submit_url(session, url, action="URL_UPDATED"):
    body = {"url": url, "type": action}
    response = session.post(ENDPOINT, json=body)
    return response.status_code, response.json()

session = get_auth_session(CREDENTIALS_FILE)
status, result = submit_url(session, "https://jobs.northwind-careers.com/openings/senior-data-engineer")
print(f"Status: {status}")
print(json.dumps(result, indent=2))
```

The `type` field accepts:
- `URL_UPDATED` — new or changed content
- `URL_DELETED` — request removal; the page must return 404/410 or carry a `noindex` meta tag

**Batch submission from a list of URLs:**

```python
def batch_submit(session, urls, delay=1):
    results = {"success": 0, "failed": 0, "errors": []}
    for i, url in enumerate(urls, 1):
        status, response = submit_url(session, url)
        if status == 200:
            results["success"] += 1
            print(f"[{i}/{len(urls)}] OK    {url}")
        else:
            results["failed"] += 1
            error_msg = response.get("error", {}).get("message", "Unknown error")
            results["errors"].append({"url": url, "status": status, "error": error_msg})
            print(f"[{i}/{len(urls)}] FAIL  {url} — {error_msg}")
        if i < len(urls):
            time.sleep(delay)
    return results
```

### Step 3: Submit URLs from a sitemap

Parse the sitemap and submit all URLs:

```python
# pip install defusedxml
import defusedxml.ElementTree as ET   # guards untrusted sitemaps against XML-bomb / entity-expansion attacks

def parse_sitemap(sitemap_url):
    response = requests.get(sitemap_url, timeout=30)
    response.raise_for_status()
    root = ET.fromstring(response.content)
    ns = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}

    # Handle sitemap index (contains other sitemaps)
    sitemap_tags = root.findall("ns:sitemap/ns:loc", ns)
    if sitemap_tags:
        urls = []
        for sitemap_loc in sitemap_tags:
            print(f"Parsing child sitemap: {sitemap_loc.text}")
            urls.extend(parse_sitemap(sitemap_loc.text))
        return urls

    # Handle regular sitemap (contains URLs)
    return [loc.text for loc in root.findall("ns:url/ns:loc", ns)]

def submit_sitemap(credentials_file, sitemap_url, delay=1):
    print(f"Parsing sitemap: {sitemap_url}")
    urls = parse_sitemap(sitemap_url)
    print(f"Found {len(urls)} URLs\n")

    session = get_auth_session(credentials_file)
    results = batch_submit(session, urls, delay=delay)

    print(f"\nDone: {results['success']} submitted, {results['failed']} failed")
    if results["errors"]:
        print("\nFailed URLs:")
        for err in results["errors"]:
            print(f"  {err['url']} — {err['status']} {err['error']}")
    return results
```

### Step 4: Check indexing status

Query the notification metadata. It reports when Google last received a notification for the URL, not whether the URL is indexed (use the URL Inspection tool in Search Console or its API for that):

```python
METADATA_ENDPOINT = "https://indexing.googleapis.com/v3/urlNotifications/metadata"

def check_status(session, url):
    response = session.get(METADATA_ENDPOINT, params={"url": url})
    if response.status_code == 200:
        data = response.json()
        print(f"URL:           {data.get('url')}")
        # REST JSON is camelCase; Google's docs show snake_case, so accept both
        notify = data.get("latestUpdate") or data.get("latest_update") or {}
        print(f"Last notified: {notify.get('notifyTime') or notify.get('notify_time', 'never')}")
        print(f"Type:          {notify.get('type', 'n/a')}")
    elif response.status_code == 404:
        print(f"URL not found in notification history: {url}")
    else:
        print(f"Error {response.status_code}: {response.json()}")
```

## Examples

### Example 1: Submit all pages from a sitemap

**User request:** "Submit all URLs from my sitemap to Google for indexing"

**Output:**
```
Parsing sitemap: https://jobs.northwind-careers.com/sitemap.xml
Found 87 URLs

[ 1/87] OK    https://jobs.northwind-careers.com/
[ 2/87] OK    https://jobs.northwind-careers.com/openings
[ 3/87] OK    https://jobs.northwind-careers.com/openings/api-engineer
[ 4/87] OK    https://jobs.northwind-careers.com/openings/qa-lead
[ 5/87] FAIL  https://jobs.northwind-careers.com/old-page — URL not allowed for this service account
...
[87/87] OK    https://jobs.northwind-careers.com/openings/devops-engineer

Done: 86 submitted, 1 failed

Failed URLs:
  https://jobs.northwind-careers.com/old-page — 403 URL not allowed for this service account
```

### Example 2: Submit specific pages and check their status

**User request:** "Index these three new blog posts and check their status"

**Output:**
```
Submitting 3 URLs...

[1/3] OK    https://myblog.com/posts/nextjs-server-actions-guide
[2/3] OK    https://myblog.com/posts/typescript-decorators-explained
[3/3] OK    https://myblog.com/posts/docker-multi-stage-builds

Checking status...

URL:           https://myblog.com/posts/nextjs-server-actions-guide
Last notified: 2026-10-13T14:32:00Z
Type:          URL_UPDATED

URL:           https://myblog.com/posts/typescript-decorators-explained
Last notified: 2026-10-13T14:32:01Z
Type:          URL_UPDATED

URL:           https://myblog.com/posts/docker-multi-stage-builds
Last notified: 2026-10-13T14:32:02Z
Type:          URL_UPDATED

All 3 URLs submitted. Google gives no processing-time guarantee; the metadata call only confirms the notification was received.
```

## Guidelines

- Eligibility: Google limits the Indexing API to `JobPosting` and livestream `BroadcastEvent` pages. Using it for other page types is outside the documented use; for those, rely on sitemaps and URL Inspection "Request indexing", and fix content or crawlability if pages stay out of the index.
- Quota: 200 publish requests per day per project (both update and delete; resets at midnight Pacific), 180 metadata reads per minute, 380 requests per minute overall. More requires a quota request via Google's form.
- Batch: up to 100 calls per HTTP request to `https://indexing.googleapis.com/batch` (each part up to 1 MB); quota still counts per URL. The one-by-one loop above is simpler and fine within 200 per day.
- Add a short delay between requests and handle 429 by waiting; split large sitemaps over several days.
- The service account must be a verified owner of the Search Console property (a plain user is not enough). Most 403 errors come from this, from the Indexing API not being enabled in the project, or from a URL outside the verified property.
- Submitting does not guarantee indexing; Google still evaluates quality. Crawling can take days to weeks.
- Never commit the service account JSON key; point to it with an environment variable such as `GOOGLE_APPLICATION_CREDENTIALS` or use a secrets manager.
- Use `URL_DELETED` only for pages that really are gone (404/410) or set to `noindex`.
