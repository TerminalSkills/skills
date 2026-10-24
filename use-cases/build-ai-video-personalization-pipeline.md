---
title: "Build an AI Video Personalization Pipeline for Sales Outreach"
slug: build-ai-video-personalization-pipeline
description: "Generate personalized talking-avatar videos at scale using HeyGen API for automated sales outreach from a CSV of contacts."
skills: [heygen-api]
category: business
tags: [video, personalization, sales-outreach, heygen, automation]
---

# Build an AI Video Personalization Pipeline

## The Problem

Generic cold outreach gets ignored. A short video that greets the prospect by name, mentions their company and names one specific pain point stands out far more, but recording a hundred individual videos by hand is not realistic. A sales team needs each video generated from the contact list, tracked, and delivered without anyone sitting in front of a camera.

## The Solution

Use the **heygen-api** skill to turn a CSV of contacts into one talking-avatar video per prospect through HeyGen's v3 API. A script template fills in name, company and pain point; the pipeline submits one job per row, polls until each is done, downloads the files and writes a results file you hand to your email tool.

```
contacts.csv -> script template -> POST /v3/videos (one per row)
             -> poll GET /v3/videos/{id} -> download mp4 -> host + send email
```

Every generation call spends HeyGen credits, so test with three rows first and check your balance and plan limits in the HeyGen dashboard.

## Step-by-Step Walkthrough

### Step 1: Prepare the contacts and the key

```csv
first_name,company,pain_point,email
Sarah,Acme Corp,high cloud infrastructure costs,sarah@example.com
James,TechStart,slow developer onboarding,james@example.org
Maria,GrowthCo,low email deliverability,maria@example.net
```

```console
$ python3 -m venv .venv && .venv/bin/pip install requests
$ read -rs HEYGEN_API_KEY && export HEYGEN_API_KEY
$ curl -s https://api.heygen.com/v3/users/me -H "X-Api-Key: $HEYGEN_API_KEY"
```

Create the key in the HeyGen API dashboard. The v1/v2 endpoints (`/v2/video/generate`, `/v1/video_status.get`) are retired on October 31, 2026; use only `/v3/...`.

### Step 2: Pick an avatar look and write the script template

```python
import csv, json, os, time
import requests

BASE = "https://api.heygen.com"
HEADERS = {"X-Api-Key": os.environ["HEYGEN_API_KEY"]}

def api(method, path, **kwargs):
    """Call the API, wait out rate limits, raise with the API's own error."""
    headers = {**HEADERS, **kwargs.pop("headers", {})}
    while True:
        r = requests.request(method, f"{BASE}{path}", headers=headers, timeout=60, **kwargs)
        if r.ok:
            return r.json()
        err = r.json().get("error", {})
        if r.status_code == 429 and err.get("code") == "rate_limit_exceeded":
            time.sleep(int(r.headers.get("Retry-After", "5")))
            continue
        raise RuntimeError(f"{r.status_code} {err.get('code')}: {err.get('message')}")

looks = api("GET", "/v3/avatars/looks", params={"ownership": "public", "limit": 20})["data"]
for look in looks[:5]:
    print(look["id"], look["name"])
AVATAR_ID = looks[0]["id"]   # replace with the look you chose; omit voice_id to use its default voice

def build_script(first_name, company, pain_point):
    return (f"Hi {first_name}, I noticed that {company} might be dealing with {pain_point}. "
            f"I would like to show you how we approach it. Can we grab 15 minutes this week? "
            f"The link below has my calendar.")
```

Keep scripts short (a 150-word script runs about a minute). Some looks have no default voice (`default_voice_id` is null in the looks list); for those, pass a `voice_id` from `GET /v3/voices`.

### Step 3: Submit one job per contact

```python
def submit_video(script, title, key):
    body = {
        "type": "avatar",
        "avatar_id": AVATAR_ID,
        "script": script,
        "title": title,
        "resolution": "720p",
        "aspect_ratio": "16:9",
        "background": {"type": "color", "value": "#F5F5F5"},
    }
    # Idempotency-Key: a retry after a network error does not render and bill twice.
    # Keys replay for 24 hours, so a resubmit after a failure needs a new key (e.g. add "-r2").
    return api("POST", "/v3/videos", json=body, headers={"Idempotency-Key": key})["data"]["video_id"]

def submit_all(csv_path, jobs_file="jobs.json"):
    jobs = []
    with open(csv_path, newline="") as f:
        for i, row in enumerate(csv.DictReader(f)):
            script = build_script(row["first_name"], row["company"], row["pain_point"])
            vid = submit_video(script, f"Outreach - {row['first_name']} @ {row['company']}",
                               key=f"outreach-{row['email']}")
            jobs.append({**row, "video_id": vid, "status": "pending"})
            print("Submitted", row["email"], vid)
    with open(jobs_file, "w") as f:
        json.dump(jobs, f, indent=2)
    return jobs
```

HeyGen limits concurrent jobs per plan; extra submissions queue or get a 429, which `api()` waits out via `Retry-After`.

### Step 4: Poll and download

```python
def poll_and_download(jobs, out_dir="videos"):
    os.makedirs(out_dir, exist_ok=True)
    pending = [j for j in jobs if j["status"] == "pending"]
    while pending:
        for job in pending[:]:
            v = api("GET", f"/v3/videos/{job['video_id']}")["data"]
            if v["status"] == "completed":
                path = f"{out_dir}/{job['video_id']}.mp4"
                r = requests.get(v["video_url"], stream=True, timeout=120)
                r.raise_for_status()
                with open(path, "wb") as f:
                    for chunk in r.iter_content(8192):
                        f.write(chunk)
                job.update(status="completed", local_file=path)
                pending.remove(job)
            elif v["status"] == "failed":
                job.update(status="failed", error=f"{v.get('failure_code')}: {v.get('failure_message')}")
                pending.remove(job)
        if pending:
            time.sleep(15)
    return jobs

jobs = poll_and_download(submit_all("contacts.csv"))
with open("jobs.json", "w") as f:
    json.dump(jobs, f, indent=2)
```

`video_url` is presigned and expires, so save the file right away (or call `GET /v3/videos/{id}` again for a fresh link). To avoid polling, pass `callback_url` and `callback_id` in the create call, or register a webhook endpoint (`POST /v3/webhooks/endpoints`) and verify the HMAC-SHA256 `signature` header against the raw body.

### Step 5: Host the videos and send the email

Upload the mp4 files to a host that reports views (Loom, Vidyard, Wistia, or your own storage behind a tracked landing page), then send the link from your normal email tool or sequencer. Add UTM parameters so replies and bookings can be tied to the video:

```python
from urllib.parse import urlencode

def tracked_link(base_url, campaign="video-outreach"):
    return f"{base_url}?{urlencode({'utm_source': 'email', 'utm_medium': 'video', 'utm_campaign': campaign})}"
```

Do not put the prospect's email address in a URL; use a per-contact `video_id` as `utm_content` instead. Send in small daily batches from an authenticated domain (SPF, DKIM, DMARC) and include an unsubscribe line, as commercial email rules require.

## Real-World Example

A three-person sales team at an invented analytics startup, Brightline, exports 40 prospects from their CRM each Monday. They run the script, review the first three videos for lip-sync and pronunciation of company names, then let the rest finish while they work on other things. Videos that come back `failed` are listed in `jobs.json` with the failure code and resubmitted under a new idempotency key after fixing the script (usually an unpronounceable company name, spelled phonetically in the script). By Tuesday the emails go out with a link to the hosted video; the team compares reply rates against their plain-text sequence over a few weeks rather than assuming an uplift.

## Related Skills

- **heygen-api**: avatar looks, voices, video creation, status polling, webhooks and translation.
