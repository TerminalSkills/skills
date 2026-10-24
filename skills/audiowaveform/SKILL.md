---
name: audiowaveform
description: >-
  Generate waveform visualizations from audio files. Use when a user asks to
  create waveform images, build audio player visualizations, generate waveform
  data for web players, create podcast episode previews, build audio thumbnails,
  render waveform PNGs for social media, extract peak data as JSON, or integrate
  waveform generation into audio processing pipelines. Covers audiowaveform CLI,
  JSON/binary data output, and web player integration.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows (audiowaveform 1.11 is current; install via Ubuntu PPA, Homebrew, a release package, or build from source)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: content
  repository: https://codeberg.org/chrisn/audiowaveform
  tags:
    - audiowaveform
    - waveform
    - audio
    - visualization
    - podcast
---

# Audiowaveform

## Overview

Generate waveform visualizations from audio files using BBC's audiowaveform tool. Renders PNG waveform images (PNG only, no SVG), converts audio to WAV, and outputs peak data as JSON or binary (.dat) for web-based audio players (wavesurfer.js, peaks.js). Ideal for podcast players, music platforms, social media audio previews, and any UI that shows audio waveforms.

## Instructions

### Step 1: Installation

```bash
# macOS and Linuxbrew
brew install audiowaveform

# Ubuntu (Launchpad PPA maintained by the author)
sudo add-apt-repository ppa:chris-needham/ppa
sudo apt-get update
sudo apt-get install audiowaveform
```

Development moved from GitHub (bbc/audiowaveform, now a stale mirror) to [Codeberg](https://codeberg.org/chrisn/audiowaveform); the current version is 1.11.1. Debian, RHEL-family and Windows packages are attached to the [Codeberg releases](https://codeberg.org/chrisn/audiowaveform/releases) (the 1.10.2 release has the .deb and .rpm files, 1.11.0 only a Windows zip, 1.10.3 and 1.11.1 none); pick the file that matches your OS version and install it with `dpkg -i` plus `apt-get -f install`, or `yum localinstall`. A community Docker image, `realies/audiowaveform`, also exists. To build from source on Ubuntu:

```bash
sudo apt-get install git make cmake gcc g++ libmad0-dev libid3tag0-dev \
  libsndfile1-dev libgd-dev libboost-filesystem-dev libboost-program-options-dev libboost-regex-dev
git clone https://codeberg.org/chrisn/audiowaveform.git
cd audiowaveform && mkdir build && cd build
cmake -D ENABLE_TESTS=0 .. && make && sudo make install
```

Verify with `audiowaveform --version`. Input can be MP3, WAV, FLAC, Ogg Vorbis, or Opus (Opus needs libsndfile 1.0.29+).

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
`--zoom auto` fits the whole file into the image width. `--zoom`, `--pixels-per-second` and `--end` are mutually exclusive.

**Color schemes:**
- `audacity` (default) — blue waveform on grey
- `audition` — green on dark, like Adobe Audition
- Custom: hex `rrggbb` or `rrggbbaa` via `--waveform-color`, `--background-color`, `--border-color`, `--axis-label-color`

**Bars instead of a continuous waveform:**
```bash
audiowaveform -i episode.mp3 -o bars.png -w 1000 -h 200 -z auto \
  --waveform-style bars --bar-width 10 --bar-gap 2 --bar-style rounded
```

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

**Split channels (stereo):** pass one colour per channel.
```bash
audiowaveform -i stereo.wav -o waveform.png --split-channels --waveform-color 3b82f6,ef4444
```

### Step 3: Generate Waveform Data (JSON)

For web players that render waveforms client-side:

```bash
# JSON output (peaks data)
audiowaveform -i episode.wav -o peaks.json \
  --pixels-per-second 20 \
  --bits 8
# --bits defaults to 16; 8 gives smaller files

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
  "length": 4,
  "data": [-12, 45, -3, 67, -20, 89, -7, 31]
}
```

**Pixels-per-second guidelines:**
- `20` — good for full episode overview (podcast, 1-2h)
- `50` — detailed view for songs (3-5 min)
- `100` — very detailed, for short clips
- `200+` — waveform editing precision

### Step 4: Web Player Integration

**With wavesurfer.js (v8):** pass normalized peaks and the duration so the waveform draws before the audio is decoded. audiowaveform writes integers (-128..127 for 8 bit), wavesurfer expects floats between -1 and 1.
```html
<div id="waveform"></div>
<button onclick="wavesurfer.playPause()">Play/Pause</button>

<script src="https://unpkg.com/wavesurfer.js@8.0.3"></script>
<script>
let wavesurfer;
fetch("/waveforms/episode-peaks.json")
  .then(r => r.json())
  .then(data => {
    const peaks = data.data.map(v => v / 2 ** (data.bits - 1));
    const duration = data.length * data.samples_per_pixel / data.sample_rate;
    wavesurfer = WaveSurfer.create({
      container: "#waveform",
      waveColor: "#3b82f6",
      progressColor: "#1d4ed8",
      cursorColor: "#ef4444",
      barWidth: 2,
      barRadius: 2,
      barGap: 1,
      height: 80,
      url: "/audio/episode.mp3",
      peaks: [peaks],
      duration,
    });
  });
</script>
```

**With peaks.js (BBC):**
```html
<div id="zoomview-container"></div>
<div id="overview-container"></div>
<audio id="audio" src="/audio/episode.mp3" controls></audio>

<script src="https://unpkg.com/peaks.js@4.0.0/dist/peaks.js"></script>
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
  // samples per pixel; none may be below the file's samples_per_pixel (2205 here)
  zoomLevels: [2205, 4410, 8820, 17640],
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

### Step 6: Convert Between Formats

```bash
# Binary → JSON
audiowaveform -i peaks.dat -o peaks.json

# Decode once into a master .dat, then render images from it
audiowaveform -i input.wav -o master.dat -z 256 -b 8
audiowaveform -i master.dat -o overview.png -z auto --width 2000 --height 100
audiowaveform -i master.dat -o detail.png --start 60 --end 120 --width 800 --height 200

# MP3 → WAV, or pipe from ffmpeg (reading stdin needs `--input-format`: wav, mp3, flac, ogg, opus, dat, json or raw)
audiowaveform -i episode.mp3 -o episode.wav
ffmpeg -i interview.mp4 -f wav - | audiowaveform --input-format wav --output-format dat -b 8 > interview.dat
```

A waveform rendered from a `.dat` file cannot use a zoom (samples per pixel) smaller than the one the file was created with. Rendering `overview.png` from a 20-pixels-per-second file with the default zoom of 256 fails, so create the master at `-z 256` or lower, or pass `-z auto`.

## Examples

### Example 1: Generate waveform previews for a podcast website
**User prompt:** "I have 50 podcast episodes as MP3 files in ./episodes/. Generate PNG waveform previews and JSON peak data for each one so I can use them with wavesurfer.js on my Next.js site."

The agent will:
1. Verify audiowaveform is installed, install it via `apt` or `brew` if missing.
2. Create output directories `./waveforms/png/` and `./waveforms/json/`.
3. Write a bash loop that iterates over all `.mp3` files in `./episodes/`, generating a 1200x150 PNG with brand colors and a JSON peaks file at 20 pixels-per-second with 8-bit depth for each episode.
4. Run the batch script and report how many waveforms were generated.
5. Show a wavesurfer.js code snippet that loads the pre-generated JSON peaks for instant waveform rendering without client-side audio decoding.

### Example 2: Create social media audio preview images
**User prompt:** "I need OG-image-sized waveform graphics for sharing podcast episodes on Twitter. Dark background, cyan waveform, no axis labels. Do episodes 10 through 15."

The agent will:
1. Identify the audio files for episodes 10-15 in the episodes directory.
2. Run audiowaveform for each file with `--width 1200 --height 630` (OG image dimensions), `--background-color 0f172a`, `--waveform-color 06b6d4`, and `--no-axis-labels`.
3. Save output files as `episode-10-social.png` through `episode-15-social.png`.
4. Confirm the files were generated and note their file sizes.

## Guidelines

- Check that audiowaveform is installed before running commands; on Ubuntu it comes from the author's PPA, on Debian and RHEL from the release packages, and old systems may need a source build.
- Output is PNG, JSON, `.dat` or WAV only; for SVG render the JSON peaks in the browser instead.
- Use `--pixels-per-second 20` with `--bits 8` for JSON peaks data intended for web players; higher values produce unnecessarily large files for overview waveforms.
- Pre-generate waveform JSON server-side rather than decoding audio client-side; this eliminates multi-second load times for listeners on the web.
- For social media images, use `--no-axis-labels` to produce cleaner graphics without time markers that clutter the visual at small sizes.
- When processing large batches, generate the binary `.dat` format first, then render PNGs and JSONs from the `.dat` file to avoid re-reading the audio multiple times.
