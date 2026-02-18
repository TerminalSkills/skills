---
name: audiowaveform
description: >-
  Generate waveform visualizations from audio files. Use when a user asks to
  create waveform images, build audio player visualizations, generate waveform
  data for web players, create podcast episode previews, build audio thumbnails,
  render waveform PNGs for social media, extract peak data as JSON, or
  integrate waveform generation into audio processing pipelines. Covers
  audiowaveform CLI, JSON/binary data output, and web player integration.
license: Apache-2.0
compatibility: "Linux, macOS (audiowaveform 1.7+)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: audio
  tags: ["audiowaveform", "waveform", "audio", "visualization", "podcast", "web-player"]
---

# Audiowaveform

## Overview

Generate waveform visualizations from audio files using BBC's audiowaveform tool. Renders PNG/SVG waveform images and outputs peak data as JSON or binary for web-based audio players (wavesurfer.js, peaks.js). Ideal for podcast players, music platforms, social media audio previews, and any UI that shows audio waveforms.

## Instructions

### Step 1: Installation

```bash
# Ubuntu/Debian
apt install -y audiowaveform

# macOS
brew install audiowaveform

# From source (if not in repos)
apt install -y cmake g++ libmad0-dev libsndfile1-dev libgd-dev libboost-filesystem-dev libboost-program-options-dev libboost-regex-dev
git clone https://github.com/bbc/audiowaveform.git
cd audiowaveform && mkdir build && cd build
cmake .. && make && make install

# Verify
audiowaveform --version
```

### Step 2: Generate Waveform Images

**Basic PNG waveform:**
```bash
audiowaveform -i episode.wav -o waveform.png
```

**Customized waveform:**
```bash
audiowaveform -i episode.mp3 -o waveform.png \
  --width 1800 \
  --height 200 \
  --colors audacity \
  --background-color ffffff \
  --waveform-color 3b82f6 \
  --axis-label-color 666666 \
  --border-color ffffff \
  --zoom auto
```

**Color schemes:**
- `audacity` — classic Audacity look
- Custom: use hex `--waveform-color`, `--background-color`

**High-res for social media (1200x630 — OG image size):**
```bash
audiowaveform -i episode.wav -o social-preview.png \
  --width 1200 --height 630 \
  --background-color 1a1a2e \
  --waveform-color 00d4ff \
  --no-axis-labels
```

**Specific time range:**
```bash
audiowaveform -i episode.wav -o clip.png \
  --start 60 --end 180 \
  --width 800 --height 150
```

**Split channels (stereo):**
```bash
audiowaveform -i stereo.wav -o waveform.png --split-channels
```

### Step 3: Generate Waveform Data (JSON)

For web players that render waveforms client-side:

```bash
# JSON output (peaks data)
audiowaveform -i episode.wav -o peaks.json \
  --pixels-per-second 20 \
  --bits 8

# Binary format (smaller files)
audiowaveform -i episode.wav -o peaks.dat \
  --pixels-per-second 20 \
  --bits 8
```

**JSON structure:**
```json
{
  "version": 2,
  "channels": 1,
  "sample_rate": 44100,
  "samples_per_pixel": 2205,
  "bits": 8,
  "length": 1200,
  "data": [0, 45, -3, 67, 12, 89, ...]
}
```

**Pixels-per-second guidelines:**
- `20` — good for full episode overview (podcast, 1-2h)
- `50` — detailed view for songs (3-5 min)
- `100` — very detailed, for short clips
- `200+` — waveform editing precision

### Step 4: Web Player Integration

**With wavesurfer.js:**
```html
<div id="waveform"></div>
<button onclick="wavesurfer.playPause()">Play/Pause</button>

<script src="https://unpkg.com/wavesurfer.js@7"></script>
<script>
const wavesurfer = WaveSurfer.create({
  container: "#waveform",
  waveColor: "#3b82f6",
  progressColor: "#1d4ed8",
  cursorColor: "#ef4444",
  barWidth: 2,
  barRadius: 2,
  barGap: 1,
  height: 80,
  responsive: true,
  // Use pre-generated peaks for instant rendering
  peaks: null, // Will load from JSON
  url: "/audio/episode.mp3",
});

// Load pre-generated peaks (skip client-side decoding)
fetch("/waveforms/episode-peaks.json")
  .then(r => r.json())
  .then(data => {
    wavesurfer.load("/audio/episode.mp3", [data.data]);
  });
</script>
```

**With peaks.js (BBC):**
```html
<div id="zoomview-container"></div>
<div id="overview-container"></div>

<script src="https://unpkg.com/peaks.js"></script>
<script>
const audioElement = document.getElementById("audio");

Peaks.init({
  containers: {
    zoomview: document.getElementById("zoomview-container"),
    overview: document.getElementById("overview-container"),
  },
  mediaElement: audioElement,
  dataUri: {
    json: "/waveforms/episode-peaks.json",
  },
  zoomLevels: [256, 512, 1024, 2048],
  overview: {
    waveformColor: "#3b82f6",
    playedWaveformColor: "#1d4ed8",
  },
  zoomview: {
    waveformColor: "#3b82f6",
    playedWaveformColor: "#1d4ed8",
  },
}, (err, peaks) => {
  if (err) console.error(err);
  // peaks instance ready
});
</script>
```

### Step 5: Batch Processing & Pipeline

**Generate waveforms for all episodes:**
```bash
#!/bin/bash
# generate-waveforms.sh
AUDIO_DIR="./episodes"
OUT_DIR="./waveforms"
mkdir -p "$OUT_DIR"

for f in "$AUDIO_DIR"/*.{mp3,wav}; do
  [ -f "$f" ] || continue
  base=$(basename "$f" | sed 's/\.[^.]*$//')
  
  # PNG preview
  audiowaveform -i "$f" -o "$OUT_DIR/${base}.png" \
    --width 1200 --height 150 \
    --background-color ffffff --waveform-color 3b82f6

  # JSON peaks for web player
  audiowaveform -i "$f" -o "$OUT_DIR/${base}.json" \
    --pixels-per-second 20 --bits 8

  # Social media preview
  audiowaveform -i "$f" -o "$OUT_DIR/${base}-social.png" \
    --width 1200 --height 630 \
    --background-color 0f172a --waveform-color 38bdf8 --no-axis-labels

  echo "✅ $base"
done
```

**API endpoint for on-demand generation:**
```typescript
import { execSync } from "child_process";
import express from "express";

const app = express();

app.get("/api/waveform/:episodeId", (req, res) => {
  const { episodeId } = req.params;
  const format = req.query.format || "json"; // json, png
  const audioPath = `./episodes/${episodeId}.mp3`;
  const outPath = `/tmp/waveform-${episodeId}.${format}`;

  try {
    if (format === "json") {
      execSync(`audiowaveform -i "${audioPath}" -o "${outPath}" --pixels-per-second 20 --bits 8`);
      res.json(JSON.parse(require("fs").readFileSync(outPath, "utf-8")));
    } else {
      execSync(`audiowaveform -i "${audioPath}" -o "${outPath}" --width 1200 --height 150 --background-color ffffff --waveform-color 3b82f6`);
      res.sendFile(outPath);
    }
  } catch (err) {
    res.status(500).json({ error: "Waveform generation failed" });
  }
});
```

### Step 6: Convert Between Formats

```bash
# Binary → JSON
audiowaveform -i peaks.dat -o peaks.json

# JSON → PNG (render from pre-computed data)
audiowaveform -i peaks.json -o waveform.png \
  --width 1200 --height 200 \
  --zoom auto

# From raw audio → multiple outputs
audiowaveform -i input.wav -o peaks.dat --bits 8 --pixels-per-second 20
audiowaveform -i peaks.dat -o overview.png --width 2000 --height 100
audiowaveform -i peaks.dat -o detail.png --start 60 --end 120 --width 800 --height 200
```
