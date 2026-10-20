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
  version: "1.1.0"
  category: content
  tags: [video-generation, tiktok, youtube-shorts, content-creation, ai-video]
  use-cases:
    - "Generate 50 short-form videos per day for TikTok/YouTube Shorts"
    - "Build an automated content pipeline: topic → script → voice → video"
    - "Create educational or explainer videos with AI narration"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# AI Video Generator — Short-Form Content Pipeline

## Overview

Automate creation of short-form videos (TikTok, YouTube Shorts, Instagram Reels) using AI for every step: topic research, script writing, text-to-speech narration, stock footage matching, subtitle generation, and final assembly. Inspired by [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (130k+ stars).

## Instructions

### Step 1: Set Up the Environment

```bash
pip install anthropic openai requests whisperx srt schedule
sudo apt install ffmpeg  # Linux — or: brew install ffmpeg (macOS)
```

**API keys needed** (read from environment variables): `ANTHROPIC_API_KEY` (scripts), `ELEVENLABS_API_KEY` plus `ELEVENLABS_VOICE_ID` (a voice ID from your ElevenLabs voice library) or `OPENAI_API_KEY` for OpenAI TTS, and `PEXELS_API_KEY` (free stock footage). WhisperX downloads speech models on first run and works best with a GPU; on CPU pass `compute_type="int8"`.

### Step 2: AI Script Writing

```python
import os
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
    - Conversational, no complex sentences
    - Each sentence on its own line
    - ~{duration_seconds * 2.5:.0f} words ({duration_seconds}s at 150wpm)
    - Use power words: secret, shocking, nobody tells you, actually
    - No emojis or hashtags — this is a voiceover script
    """
    response = client.messages.create(
        model=os.environ.get("SCRIPT_MODEL", "claude-sonnet-5-5"), max_tokens=500,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.content[0].text
```

### Step 3: Text-to-Speech Narration

```python
import requests, os

def generate_voice_elevenlabs(text, output_path='narration.mp3'):
    """Generate voiceover using ElevenLabs."""
    voice_id = os.environ["ELEVENLABS_VOICE_ID"]
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"
    headers = {"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "Content-Type": "application/json"}
    data = {"text": text, "model_id": "eleven_flash_v2_5",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}}
    response = requests.post(url, json=data, headers=headers)
    response.raise_for_status()
    with open(output_path, 'wb') as f:
        f.write(response.content)
    return output_path

def generate_voice_openai(text, output_path='narration.mp3'):
    """Generate voiceover using OpenAI TTS (cheaper alternative). tts-1-hd is deprecated (removal announced for 2027-01-06), so use gpt-4o-mini-tts."""
    from openai import OpenAI
    client = OpenAI()
    with client.audio.speech.with_streaming_response.create(
        model="gpt-4o-mini-tts", voice="onyx", input=text
    ) as response:
        response.stream_to_file(output_path)
    return output_path
```

### Step 4: Stock Footage Selection

```python
def search_pexels_videos(query, count=5):
    """Search Pexels for portrait-oriented stock video clips."""
    url = "https://api.pexels.com/videos/search"
    headers = {"Authorization": os.environ["PEXELS_API_KEY"]}
    params = {"query": query, "per_page": count, "orientation": "portrait", "size": "medium"}
    response = requests.get(url, headers=headers, params=params)
    videos = response.json().get('videos', [])
    results = []
    for v in videos:
        files = sorted(v['video_files'], key=lambda x: x.get('height', 0), reverse=True)
        hd = next((f for f in files if f.get('height', 0) >= 720), files[0])  # prefers >=720p
        results.append({'id': v['id'], 'url': hd['link'], 'duration': v['duration']})
    return results
```

### Step 5: Subtitle Generation

```python
def generate_subtitles(audio_path, output_srt='subtitles.srt'):
    """Generate word-level subtitles using WhisperX."""
    import whisperx, srt
    from datetime import timedelta
    model = whisperx.load_model("base", device="cpu", compute_type="int8")
    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(audio)
    align_model, metadata = whisperx.load_align_model(language_code=result["language"], device="cpu")
    aligned = whisperx.align(result["segments"], align_model, metadata, audio, "cpu")
    subs = []
    words = [w for seg in aligned["segments"] for w in seg.get("words", [])]
    for i in range(0, len(words), 4):
        group = words[i:i + 4]
        if not group: continue
        start = timedelta(seconds=group[0].get('start', 0))
        end = timedelta(seconds=group[-1].get('end', 0))
        text = ' '.join(w['word'] for w in group)
        subs.append(srt.Subtitle(index=len(subs)+1, start=start, end=end, content=text))
    with open(output_srt, 'w') as f:
        f.write(srt.compose(subs))
    return output_srt
```

### Step 6: Video Assembly with FFmpeg

```python
import subprocess

def assemble_video(clips, narration, subtitles, output='final.mp4'):
    """Assemble final video: concatenate clips, add narration and subtitles."""
    concat_list = 'concat_list.txt'
    with open(concat_list, 'w') as f:
        for clip in clips:
            f.write(f"file '{clip}'\n")
    subprocess.run([
        'ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', concat_list,
        '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
        '-c:v', 'libx264', '-preset', 'fast', '-an', 'temp_video.mp4'
    ], check=True)
    subtitle_filter = (f"subtitles={subtitles}:force_style='"
        "FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H00000000,Outline=2,Bold=1,Alignment=2'")
    subprocess.run([
        'ffmpeg', '-y', '-i', 'temp_video.mp4', '-i', narration,
        '-vf', subtitle_filter, '-c:v', 'libx264', '-c:a', 'aac',
        '-shortest', output
    ], check=True)
    return output
```

### Step 7: Full Pipeline

```python
def download_clips(videos, output_dir):
    """Download the Pexels clips returned by search_pexels_videos."""
    clips = []
    for i, v in enumerate(videos):
        path = f'{output_dir}/clip_{i}.mp4'
        with requests.get(v['url'], stream=True, timeout=60) as resp:
            resp.raise_for_status()
            with open(path, 'wb') as f:
                for chunk in resp.iter_content(1 << 16):
                    f.write(chunk)
        clips.append(path)
    return clips

def generate_video(topic, output_dir='./output'):
    """Complete pipeline: topic -> finished video."""
    import os
    os.makedirs(output_dir, exist_ok=True)
    script = generate_script(topic)
    narration = generate_voice_elevenlabs(script, f'{output_dir}/narration.mp3')
    videos = search_pexels_videos(' '.join(topic.split()[:3]), count=3)
    clips = download_clips(videos, output_dir)
    subs = generate_subtitles(narration, f'{output_dir}/subs.srt')
    return assemble_video(clips, narration, subs, f'{output_dir}/final.mp4')
```

## Examples

### Example 1: Generate a Batch of Tech Fact Videos

A creator produces 5 technology-themed short videos for TikTok in one run:

```python
topics = [
    "AI tools nobody talks about",
    "Apps that feel illegal to use for free",
    "Websites that will blow your mind",
    "Free AI tools every student needs",
    "Tech gadgets under $50 that changed my life"
]
for topic in topics:
    output = generate_video(topic, output_dir=f'./output/{topic[:30]}')
    print(f"Video ready: {output}")
# Each video: ~45 seconds, portrait 1080x1920, with subtitles and narration
```

### Example 2: Daily Finance Shorts for YouTube

A finance channel automates daily Shorts upload with trending money topics:

```python
import os, schedule

def daily_finance_video():
    os.makedirs('./daily', exist_ok=True)
    topic = "3 passive income ideas that actually work in 2026"
    script = generate_script(topic, duration_seconds=55)
    # Script output:
    # HOOK: "You're losing money every single day you don't know about these."
    # BODY: 1. Print-on-demand stores ($500-2k/mo)
    #       2. AI-generated content licensing ($300-1k/mo)
    #       3. Dividend ETF stacking ($200-800/mo passive)
    # CTA: "Follow for more money tips that nobody tells you about."
    narration = generate_voice_openai(script, './daily/narration.mp3')
    videos = search_pexels_videos("money finance investing", count=4)
    clips = download_clips(videos, './daily')  # 4 portrait clips of money/charts footage
    subs = generate_subtitles(narration, './daily/subs.srt')
    # Assembles with bold white subtitles, outputs a ~55-second Short
    final = assemble_video(clips, narration, subs, './daily/final.mp4')

schedule.every().day.at("08:00").do(daily_finance_video)
```

## Guidelines

- **Pexels terms** — read the current Pexels licence and API rate limits before automating downloads at volume
- **Respect copyright** — only use royalty-free stock footage (Pexels, Pixabay) or your own content
- **Disclose AI usage** — YouTube and TikTok require disclosure of AI-generated content
- **Review before publishing** — always watch the final video; AI scripts can contain inaccuracies
- **Optimize for the first 3 seconds** — the hook determines whether viewers stay or scroll
- **Test multiple voices** — ElevenLabs offers dozens of voices; find one that fits your niche
- **Monitor performance** — track views, retention, and click-through to iterate on content style

## References

- [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) — original inspiration (130k+ stars)
- [Pexels API](https://www.pexels.com/api/) — free stock video
- [ElevenLabs](https://elevenlabs.io/) — realistic text-to-speech
- [WhisperX](https://github.com/m-bain/whisperX) — word-level subtitle alignment
