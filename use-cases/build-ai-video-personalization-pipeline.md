# Build an AI Video Personalization Pipeline

**Persona:** Sales team automating personalized video outreach  
**Stack:** HeyGen API, Python, CSV contacts, email/LinkedIn delivery  
**Outcome:** Personalized talking-avatar videos generated at scale, sent to prospects

---

## Problem

Generic cold outreach is ignored. A personalized video message — one where the sender addresses the prospect by name, mentions their company, and references a specific pain point — converts 3–5x better. But recording hundreds of individual videos manually is impossible at scale.

**Solution:** Use HeyGen's API to generate a unique talking-avatar video for each prospect, automatically, from a CSV of contacts.

---

## Architecture Overview

```
contacts.csv
    │
    ▼
Script Personalization (Python)
    │
    ▼
HeyGen API → Video Generation Jobs (async)
    │
    ▼
Poll Status → Download Videos
    │
    ▼
Email / LinkedIn delivery
    │
    ▼
Track open rates (UTM links or video hosting platform)
```

---

## Step 1: Prepare your contacts CSV

```csv
first_name,company,pain_point,email
Sarah,Acme Corp,high cloud infrastructure costs,sarah@acme.com
James,TechStart,slow developer onboarding,james@techstart.io
Maria,GrowthCo,low email deliverability,maria@growthco.com
```

Save as `contacts.csv`.

---

## Step 2: Set up the environment

```bash
pip install requests python-dotenv
```

```python
# .env
HEYGEN_API_KEY=your_key_here
```

---

## Step 3: Define the script template

```python
def build_script(first_name: str, company: str, pain_point: str) -> str:
    return (
        f"Hi {first_name}, I noticed that {company} might be dealing with {pain_point}. "
        f"We've helped similar companies solve exactly this in under 30 days. "
        f"I'd love to show you how — can we grab 15 minutes this week? "
        f"Check the link below for a quick demo. Talk soon!"
    )
```

Keep scripts under 60 seconds (~150 words) for best engagement.

---

## Step 4: Submit video generation jobs

```python
import os
import csv
import time
import json
import requests

API_KEY = os.environ["HEYGEN_API_KEY"]
HEADERS = {"X-Api-Key": API_KEY, "Content-Type": "application/json"}

# Configure once — pick your avatar and voice from the HeyGen library
AVATAR_ID = "Angela-insuit-20220820"
VOICE_ID = "en-US-JennyNeural"

def submit_video(script: str, title: str) -> str:
    payload = {
        "video_inputs": [{
            "character": {"type": "avatar", "avatar_id": AVATAR_ID, "avatar_style": "normal"},
            "voice": {"type": "text", "input_text": script, "voice_id": VOICE_ID, "speed": 1.0},
            "background": {"type": "color", "value": "#F5F5F5"}
        }],
        "dimension": {"width": 1280, "height": 720},
        "title": title
    }
    r = requests.post("https://api.heygen.com/v2/video/generate", json=payload, headers=HEADERS)
    r.raise_for_status()
    return r.json()["data"]["video_id"]

def process_contacts(csv_path: str, jobs_file: str = "jobs.json"):
    jobs = []
    with open(csv_path) as f:
        for row in csv.DictReader(f):
            script = build_script(row["first_name"], row["company"], row["pain_point"])
            video_id = submit_video(script, title=f"Outreach - {row['first_name']} @ {row['company']}")
            print(f"Submitted: {row['first_name']} @ {row['company']} → {video_id}")
            jobs.append({**row, "video_id": video_id, "status": "pending", "video_url": None})
            time.sleep(1.5)  # respect rate limits

    with open(jobs_file, "w") as f:
        json.dump(jobs, f, indent=2)
    print(f"\nSubmitted {len(jobs)} jobs → {jobs_file}")
    return jobs

jobs = process_contacts("contacts.csv")
```

---

## Step 5: Poll for completion and download videos

```python
import os

def poll_and_download(jobs_file: str = "jobs.json", output_dir: str = "videos/"):
    os.makedirs(output_dir, exist_ok=True)

    with open(jobs_file) as f:
        jobs = json.load(f)

    pending = [j for j in jobs if j["status"] == "pending"]
    print(f"Polling {len(pending)} pending jobs...")

    while pending:
        for job in pending[:]:
            r = requests.get(
                f"https://api.heygen.com/v1/video_status.get?video_id={job['video_id']}",
                headers=HEADERS
            )
            data = r.json()["data"]
            status = data["status"]

            if status == "completed":
                video_url = data["video_url"]
                # Download the video
                filename = f"{output_dir}{job['first_name'].lower()}_{job['company'].lower().replace(' ', '_')}.mp4"
                vid_r = requests.get(video_url, stream=True)
                with open(filename, "wb") as vf:
                    for chunk in vid_r.iter_content(8192):
                        vf.write(chunk)
                job["status"] = "completed"
                job["video_url"] = video_url
                job["local_file"] = filename
                pending.remove(job)
                print(f"✓ Downloaded: {filename}")

            elif status == "failed":
                job["status"] = "failed"
                pending.remove(job)
                print(f"✗ Failed: {job['first_name']} @ {job['company']}")

        if pending:
            print(f"  Waiting... {len(pending)} still processing")
            time.sleep(15)

    # Save updated jobs
    with open(jobs_file, "w") as f:
        json.dump(jobs, f, indent=2)
    print(f"\nAll done. Results saved to {jobs_file}")
    return jobs

completed_jobs = poll_and_download()
```

---

## Step 6: Deliver videos via email

Host videos on a platform with tracking (Loom, Vidyard, or AWS S3 with pre-signed URLs), then send personalized emails:

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def send_outreach_email(to_email: str, first_name: str, company: str, video_link: str):
    """Send personalized outreach email with video link."""
    subject = f"Quick video for you, {first_name}"
    body = f"""Hi {first_name},

I recorded a short personal video specifically for {company}.

▶ Watch it here: {video_link}

It's under 60 seconds and covers exactly how we solve the challenge I mentioned.

Would love to hear your thoughts — reply here or book 15 min: https://cal.com/yourname

Best,
[Your Name]
    """

    msg = MIMEMultipart()
    msg["From"] = os.environ["SENDER_EMAIL"]
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(os.environ["SENDER_EMAIL"], os.environ["EMAIL_PASSWORD"])
        server.send_message(msg)
    print(f"Email sent to {to_email}")

# Send to all completed
for job in completed_jobs:
    if job["status"] == "completed" and job.get("video_url"):
        # Upload video to Loom/Vidyard/S3 first, get shareable link
        video_link = f"https://your-video-host.com/{job['video_id']}"
        send_outreach_email(job["email"], job["first_name"], job["company"], video_link)
        time.sleep(2)
```

---

## Step 7: Track open rates

Use UTM parameters on your calendar link and video host analytics:

```python
def build_tracked_link(base_url: str, prospect_email: str, campaign: str = "video-outreach") -> str:
    import urllib.parse
    params = {
        "utm_source": "email",
        "utm_medium": "video",
        "utm_campaign": campaign,
        "utm_content": urllib.parse.quote(prospect_email)
    }
    return f"{base_url}?{urllib.parse.urlencode(params)}"
```

Monitor metrics in your email platform (open rate, click-through) and video host (watch rate, completion).

---

## Expected Results

- **Time to generate**: ~2 minutes per video (60-second script)
- **Batch of 100 contacts**: ~3.5 hours generation time (can run overnight)
- **Typical response rate uplift**: 3–5x vs. plain text cold email
- **Cost**: ~$0.10–$0.30 per video depending on HeyGen plan

---

## Tips

- Use a real avatar that matches your brand — invest in a custom HeyGen avatar for best results.
- Keep scripts under 90 seconds. Shorter = higher watch completion.
- Test with 10 contacts before scaling to 1000.
- Video URLs from HeyGen expire after 7 days — download and host them yourself promptly.
- Add a thumbnail to your email link showing the avatar mid-speech for higher click-through.
