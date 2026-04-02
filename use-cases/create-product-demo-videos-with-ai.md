# Create 10 Product Demo Videos in a Day — For Free

**Skills used:** [openscreen](../skills/openscreen/SKILL.md) · [elevenlabs-sdk](../skills/elevenlabs-sdk/SKILL.md) · [ai-video-generator](../skills/ai-video-generator/SKILL.md)

---

## The Situation

Mika is a solo founder of a SaaS project management tool. She's preparing for a product launch and needs:

- 10 feature demo videos for the product website
- 5 short clips (vertical format) for LinkedIn and Twitter
- 3 longer walkthrough videos for the investor deck

Previously she hired a freelance video editor at $500/video. For 18 videos that's $9,000 — not viable for a bootstrapped startup.

Her goal: produce all 18 videos in-house, at zero cost, in 1–2 days.

---

## The Stack

| Tool | Role |
|------|------|
| **OpenScreen** | Record screen, add zoom effects and backgrounds |
| **Claude (claude-code)** | Generate voiceover scripts |
| **ElevenLabs SDK** | Convert scripts to natural-sounding narration |
| **ffmpeg** | Merge video + audio, crop for social formats |

---

## Step 1: Set Up OpenScreen

Install from [GitHub Releases](https://github.com/siddharthvaddem/openscreen/releases).

**Initial configuration for polished demos:**
```
Background: Gradient (use brand colors — e.g., #1E40AF → #7C3AED)
Zoom: Auto-zoom on click enabled, depth: 1.5x
Motion blur: Medium
Export resolution: 1920×1080
Frame rate: 60fps
```

Increase cursor size in system settings — it looks better with zoom effects.

---

## Step 2: Plan Your 10 Demos

Before recording, write a brief for each video:

```markdown
## Demo 01: Dashboard Overview
Duration target: 90 seconds
Key clicks: sidebar navigation, project cards, quick-add button
Zoom moments: project status indicators, deadline alerts
CTA: "Start your free trial"

## Demo 02: Task Management
Duration target: 60 seconds
Key clicks: create task, assign team member, set deadline
Zoom moments: drag-and-drop reorder, priority flags
CTA: "See all features"

[... repeat for all 10]
```

Having this brief ensures you record deliberately — no rambling or wasted footage.

---

## Step 3: Record With OpenScreen

For each demo:

1. **Open the feature** you're demoing, hide irrelevant UI
2. **Start recording** in OpenScreen (window capture, not full screen)
3. **Click through** the flow naturally — don't rush
4. **Stop recording** after you reach the natural endpoint

**Tips for clean recordings:**
- Use keyboard shortcuts instead of right-click menus when possible
- Pause 1–2 seconds on important UI elements before clicking
- If you make a mistake, keep going — trim in post
- Record 10–20% extra at the start and end as buffer

---

## Step 4: Generate Voiceover Scripts with Claude

For each demo, prompt Claude to write a tight narration script:

```
Write a 90-second voiceover script for a product demo video.
Product: [Your SaaS name] — project management for remote teams
Feature being demoed: Dashboard Overview
Tone: Friendly, professional, conversational (not corporate)
Key moments to narrate: [list from your brief]
End with CTA: "Start your free trial at [domain]"

Format: Plain text, no stage directions.
Average speaking pace is 140 words/minute.
```

Review and edit each script. Common fixes:
- Remove filler phrases ("Simply...", "Easily...")
- Make CTAs concrete ("14-day free trial, no credit card")
- Trim to match actual video duration

---

## Step 5: Generate Narration with ElevenLabs

Convert each script to audio using ElevenLabs:

```bash
# Install SDK
npm install -g elevenlabs

# Generate audio for each script
for i in $(seq -w 1 10); do
  elevenlabs tts \
    --voice "Rachel" \
    --model "eleven_turbo_v2_5" \
    --output "audio/demo-${i}.mp3" \
    < "scripts/demo-${i}.txt"
done
```

**Voice selection tips:**
- "Rachel" — clear, professional, neutral American accent
- "Adam" — authoritative, good for B2B demos
- "Bella" — warm, conversational, good for consumer products

Review each audio file. Re-generate any lines that sound off using ElevenLabs' per-sentence regeneration.

---

## Step 6: Post-Process in OpenScreen

For each video:

1. **Review auto-zooms** — remove any that feel wrong, add manual ones on key moments
2. **Set zoom timing** — zoom in 0.3s after click, hold for 1.5s, zoom out 0.5s
3. **Trim dead time** — cut anything longer than a 1.5s pause
4. **Adjust speed** on filler moments (1.25x on navigation between screens)
5. **Add text annotations** for feature labels or callouts
6. **Set background** to your configured gradient

---

## Step 7: Merge Video + Audio with ffmpeg

```bash
# Merge video (from OpenScreen) with voiceover
for i in $(seq -w 1 10); do
  ffmpeg -i "recordings/demo-${i}.mp4" \
         -i "audio/demo-${i}.mp3" \
         -c:v copy -c:a aac \
         -map 0:v:0 -map 1:a:0 \
         -shortest \
         "output/demo-${i}-narrated.mp4"
done

# Export vertical crop for social (9:16 from center)
for i in $(seq -w 1 10); do
  ffmpeg -i "output/demo-${i}-narrated.mp4" \
         -vf "crop=607:1080:657:0,scale=1080:1920" \
         -c:a copy \
         "social/demo-${i}-vertical.mp4"
done

# Compress for web (target: under 10MB per video)
for i in $(seq -w 1 10); do
  ffmpeg -i "output/demo-${i}-narrated.mp4" \
         -c:v libx264 -crf 23 -preset slow \
         -c:a aac -b:a 128k \
         "web/demo-${i}-web.mp4"
done
```

---

## Results

**Time investment:**
- Planning + scripting: 2 hours (with Claude assistance)
- Recording 10 demos: 3 hours (avg 18 min per demo including retakes)
- Audio generation: 30 minutes
- Post-processing in OpenScreen: 3 hours
- Merging + exporting: 1 hour (automated with ffmpeg)
- **Total: ~10 hours for 10 demos**

**Cost:**
- OpenScreen: $0 (MIT open source)
- Claude for scripts: ~$0.50 total (API)
- ElevenLabs: $0 (free tier covers ~30 min of audio)
- ffmpeg: $0
- **Total: < $1**

**Output:**
- 10 × 1080p demos for website
- 10 × vertical clips for social media
- 10 × compressed web versions
- 3 longer walkthroughs for investor deck (same workflow, longer recordings)

**vs. Previous approach:**
- 18 videos × $500 = **$9,000 saved**
- 2 weeks wait → **1 day turnaround**
- Contractor dependency → **fully in-house capability**

---

## Scaling This Workflow

Once the pipeline is set up, future demos are even faster:

```bash
# Batch record new feature demos
# Update scripts → regenerate audio → re-merge
# Consistent brand style via OpenScreen preset
```

Set up a `Makefile` or shell script to automate the merge + export step so adding a new demo takes 30 minutes of focused work.
