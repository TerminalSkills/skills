---
name: ai-video-generator
description: >-
  Generate short-form videos with AI — script writing, text-to-speech narration,
  stock footage selection, subtitle generation, and video assembly. Use when:
  creating TikTok/YouTube Shorts/Reels content, automating video production,
  building content pipelines.
license: Apache-2.0
compatibility: "Python 3.10+, FFmpeg"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-media
  tags: [video-generation, tiktok, youtube-shorts, content-creation, ai-video, ffmpeg]
  use-cases:
    - "Generate 50 short-form videos per day for TikTok/YouTube Shorts"
    - "Build an automated content pipeline: topic → script → voice → video"
    - "Create educational or explainer videos with AI narration"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# AI Video Generator — Short-Form Content Pipeline

## Overview

Automate creation of short-form videos (TikTok, YouTube Shorts, Instagram Reels) using AI for every step: topic research, script writing, text-to-speech narration, stock footage matching, subtitle generation, and final assembly. Inspired by [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (53k+ stars).

## Instructions

### Step 1: Set Up the Environment

```bash
pip install anthropic openai requests moviepy pydub whisperx srt
# Install FFmpeg
sudo apt install ffmpeg  # Linux
brew install ffmpeg       # macOS
```

**API keys needed:**
- Anthropic or OpenAI — script writing
- ElevenLabs or OpenAI TTS — voice narration
- Pexels or Pixabay — stock footage (free API keys)

### Step 2: Topic & Keyword Research

Find trending topics to maximize views:

```python
import requests

def get_trending_topics(niche='technology', count=10):
    """Get trending topics from Google Trends via SerpAPI or manual research."""
    # Option 1: Use predefined high-performing niches
    niches = {
        'technology': ['AI tools nobody talks about', 'apps that feel illegal',
                       'websites that will blow your mind', 'free AI tools for students'],
        'finance': ['passive income ideas 2025', 'money habits of rich people',
                    'side hustles that actually work', 'investing mistakes to avoid'],
        'productivity': ['morning routines of CEOs', 'apps that replaced my team',
                        'study hacks backed by science', 'time management secrets'],
        'facts': ['things you didnt know existed', 'scary facts about the ocean',
                  'historical facts that sound fake', 'psychology tricks that work']
    }
    return niches.get(niche, niches['technology'])[:count]
```

### Step 3: AI Script Writing

Generate engaging scripts with hooks, body, and CTA:

```python
import anthropic

def generate_script(topic, duration_seconds=45):
    """Generate a video script optimized for short-form content."""
    client = anthropic.Anthropic()

    prompt = f"""Write a {duration_seconds}-second video script about: {topic}

    Format:
    HOOK (first 3 seconds): A shocking statement or question that stops scrolling
    BODY (main content): 3-5 punchy facts or points, each 1-2 sentences
    CTA (last 5 seconds): Call to action — follow, like, comment

    Rules:
    - Write for spoken word (conversational, no complex sentences)
    - Each sentence on its own line
    - Total word count: ~{duration_seconds * 2.5:.0f} words ({duration_seconds}s at 150wpm)
    - Use power words: secret, shocking, nobody tells you, actually
    - No emojis, no hashtags — this is a voiceover script
    """

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.content[0].text
```

### Step 4: Text-to-Speech Narration

Convert script to natural-sounding voiceover:

```python
# Option A: ElevenLabs (best quality)
def generate_voice_elevenlabs(text, output_path='narration.mp3'):
    """Generate voiceover using ElevenLabs."""
    import os
    url = "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM"  # Rachel
    headers = {
        "xi-api-key": os.environ["ELEVENLABS_API_KEY"],
        "Content-Type": "application/json"
    }
    data = {
        "text": text,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}
    }
    response = requests.post(url, json=data, headers=headers)
    with open(output_path, 'wb') as f:
        f.write(response.content)
    return output_path

# Option B: OpenAI TTS (cheaper)
def generate_voice_openai(text, output_path='narration.mp3'):
    """Generate voiceover using OpenAI TTS."""
    from openai import OpenAI
    client = OpenAI()
    response = client.audio.speech.create(
        model="tts-1-hd", voice="onyx", input=text
    )
    response.stream_to_file(output_path)
    return output_path
```

### Step 5: Stock Footage Selection

Match script segments to relevant stock video:

```python
import os

def search_pexels_videos(query, count=5):
    """Search Pexels for stock video clips."""
    url = "https://api.pexels.com/videos/search"
    headers = {"Authorization": os.environ["PEXELS_API_KEY"]}
    params = {
        "query": query,
        "per_page": count,
        "orientation": "portrait",  # 9:16 for shorts
        "size": "medium"
    }
    response = requests.get(url, headers=headers, params=params)
    videos = response.json().get('videos', [])
    results = []
    for v in videos:
        # Get the best quality HD file
        files = sorted(v['video_files'], key=lambda x: x.get('height', 0), reverse=True)
        hd = next((f for f in files if f.get('height', 0) >= 720), files[0])
        results.append({
            'id': v['id'],
            'url': hd['link'],
            'width': hd.get('width'),
            'height': hd.get('height'),
            'duration': v['duration']
        })
    return results

def download_video(url, output_path):
    """Download a video file."""
    r = requests.get(url, stream=True)
    with open(output_path, 'wb') as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    return output_path
```

### Step 6: Subtitle Generation

Generate accurate subtitles from the narration audio:

```python
def generate_subtitles(audio_path, output_srt='subtitles.srt'):
    """Generate word-level subtitles using WhisperX."""
    import whisperx
    import srt
    from datetime import timedelta

    model = whisperx.load_model("base", device="cpu")
    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(audio)

    # Align for word-level timestamps
    align_model, metadata = whisperx.load_align_model(language_code="en")
    aligned = whisperx.align(result["segments"], align_model, metadata, audio)

    # Build SRT — show 3-5 words at a time for readability
    subs = []
    words = [w for seg in aligned["segments"] for w in seg.get("words", [])]
    group_size = 4
    for i in range(0, len(words), group_size):
        group = words[i:i + group_size]
        if not group:
            continue
        start = timedelta(seconds=group[0].get('start', 0))
        end = timedelta(seconds=group[-1].get('end', 0))
        text = ' '.join(w['word'] for w in group)
        subs.append(srt.Subtitle(index=len(subs) + 1, start=start, end=end, content=text))

    with open(output_srt, 'w') as f:
        f.write(srt.compose(subs))
    return output_srt
```

### Step 7: Video Assembly with FFmpeg

Combine footage, narration, and subtitles into final video:

```python
import subprocess

def assemble_video(clips, narration, subtitles, output='final.mp4'):
    """Assemble final video with FFmpeg."""
    # Step 1: Concatenate clips
    concat_list = 'concat_list.txt'
    with open(concat_list, 'w') as f:
        for clip in clips:
            f.write(f"file '{clip}'\n")

    # Concatenate and scale to 1080x1920 (9:16)
    subprocess.run([
        'ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', concat_list,
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
        '-c:v', 'libx264', '-preset', 'fast', '-an',
        'temp_video.mp4'
    ], check=True)

    # Step 2: Add narration + subtitles
    subtitle_filter = (
        f"subtitles={subtitles}:force_style='"
        "FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H00000000,Outline=2,Bold=1,Alignment=2'"
    )
    subprocess.run([
        'ffmpeg', '-y',
        '-i', 'temp_video.mp4',
        '-i', narration,
        '-vf', subtitle_filter,
        '-c:v', 'libx264', '-c:a', 'aac',
        '-shortest', output
    ], check=True)
    return output
```

### Step 8: Full Pipeline — One Command

```python
def generate_video(topic, output_dir='./output'):
    """Complete pipeline: topic → finished video."""
    import os
    os.makedirs(output_dir, exist_ok=True)

    print(f"📝 Generating script for: {topic}")
    script = generate_script(topic)

    print("🎙️ Generating narration...")
    narration = generate_voice_elevenlabs(
        script, f'{output_dir}/narration.mp3'
    )

    print("🎬 Finding stock footage...")
    keywords = topic.split()[:3]
    videos = search_pexels_videos(' '.join(keywords), count=3)
    clips = []
    for i, v in enumerate(videos):
        path = f'{output_dir}/clip_{i}.mp4'
        download_video(v['url'], path)
        clips.append(path)

    print("📝 Generating subtitles...")
    subs = generate_subtitles(narration, f'{output_dir}/subs.srt')

    print("🎞️ Assembling final video...")
    final = assemble_video(clips, narration, subs, f'{output_dir}/final.mp4')

    print(f"✅ Video ready: {final}")
    return final

# Generate a batch
topics = get_trending_topics('technology', count=5)
for topic in topics:
    generate_video(topic, output_dir=f'./output/{topic[:30]}')
```

## Upload Automation

```python
# YouTube Shorts upload via API
# Requires: pip install google-api-python-client google-auth-oauthlib
# TikTok: Use unofficial tiktok-uploader or selenium-based approach
# See: https://github.com/546200350/TikTokUplworker
```

## Cost Estimates

| Component | Cost per Video | Monthly (50/day) |
|-----------|---------------|-------------------|
| Script (Claude Sonnet) | ~$0.003 | ~$4.50 |
| Voice (ElevenLabs) | ~$0.05 | ~$75 |
| Stock footage (Pexels) | Free | Free |
| Total | ~$0.05 | ~$80 |

## References

- [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) — original inspiration (53k stars)
- [Pexels API](https://www.pexels.com/api/) — free stock video
- [ElevenLabs](https://elevenlabs.io/) — realistic text-to-speech
- [WhisperX](https://github.com/m-bain/whisperX) — word-level subtitle alignment
