---
name: sox
description: >-
  Process audio files with SoX (Sound eXchange). Use when a user asks to apply
  audio effects, mix and combine audio tracks, convert audio formats, batch
  process audio files, normalize volume, trim silence, add reverb or echo,
  change tempo or pitch, split audio files, create spectrograms, generate test
  tones, resample audio, or build audio processing pipelines. Covers all SoX
  effects, format conversion, mixing, and batch workflows.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows (sox 14.4+)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags:
    - sox
    - audio
    - effects
    - mixing
    - audio-processing
---

# SoX (Sound eXchange)

## Overview

Process audio with SoX — the Swiss Army knife of audio manipulation. Handles format conversion, effects (reverb, echo, EQ, compression, chorus), mixing/combining tracks, silence trimming, volume normalization, pitch/tempo changes, spectrograms, and batch processing. Lighter than ffmpeg for pure audio work, with a powerful effects chain syntax.

## Instructions

### Step 1: Installation & Basics

**Install:**
```bash
# Ubuntu/Debian
apt install -y sox libsox-fmt-all

# macOS
brew install sox

# Verify
sox --version
```

**Basic syntax:**
```bash
sox input.wav output.wav [effects...]
# or: sox [input-options] input [output-options] output [effects...]
```

**Get audio info:**
```bash
soxi file.wav
# Sample Rate: 44100, Channels: 2, Duration: 00:03:42.15

soxi -d file.wav    # Duration only
soxi -r file.wav    # Sample rate only
soxi -c file.wav    # Channels only
soxi -b file.wav    # Bit depth
```

### Step 2: Format Conversion

```bash
# Format conversion (SoX infers from extension)
sox input.wav output.mp3             # WAV → MP3 (requires libsox-fmt-mp3)
sox input.wav output.flac            # WAV → FLAC (lossless)
sox input.mp3 output.wav             # MP3 → WAV (for editing)

# Sample rate, bit depth, channels
sox input.wav -r 16000 output.wav    # Downsample to 16kHz (for speech)
sox input.wav -b 16 output.wav       # Convert to 16-bit
sox input.wav output.wav channels 1  # Mix down to mono

# Raw PCM → WAV
sox -r 44100 -b 16 -c 2 -e signed-integer input.raw output.wav
```

### Step 3: Trimming & Splitting

```bash
# Trim: keep from 0:30 to 2:00
sox input.wav output.wav trim 30 90    # start=30s, duration=90s

# Trim: keep first 60 seconds
sox input.wav output.wav trim 0 60

# Trim: skip first 5 seconds
sox input.wav output.wav trim 5

# Remove silence from beginning and end
sox input.wav output.wav silence 1 0.1 0.1% reverse silence 1 0.1 0.1% reverse

# Remove silence throughout (split into non-silent segments)
sox input.wav output.wav silence 1 0.5 0.1% 1 0.5 0.1% : newfile : restart

# Split into 30-second chunks
sox input.wav output.wav trim 0 30 : newfile : restart
# Creates output001.wav, output002.wav, ...

# Pad with silence
sox input.wav output.wav pad 2 3    # 2s before, 3s after
```

### Step 4: Volume & Normalization

```bash
# Normalize to 0dB peak
sox input.wav output.wav norm

# Normalize to -3dB peak
sox input.wav output.wav norm -3

# Adjust volume
sox input.wav output.wav vol 1.5      # 150% volume
sox input.wav output.wav vol -6dB     # Reduce by 6dB
sox input.wav output.wav vol 3dB      # Increase by 3dB

# Dynamic range compression (make quiet parts louder)
sox input.wav output.wav compand 0.3,1 6:-70,-60,-20 -5 -90 0.2

# Limiter (prevent clipping)
sox input.wav output.wav compand 0.01,0.3 -80,-80,-6,-6,0,-3 0 0 0.01

# Loudness normalization (EBU R128-style with gain)
# First measure:
sox input.wav -n stat 2>&1 | grep "RMS lev dB"
# Then apply gain to reach target (-16 LUFS for podcasts):
sox input.wav output.wav gain -n -16
```

### Step 5: Audio Effects

```bash
# Reverb: reverb [reverberance% HF-damping% room-scale% stereo-depth% pre-delay-ms wet-gain-dB]
sox input.wav output.wav reverb 50 50 100 100 0 0

# Echo / multiple echoes
sox input.wav output.wav echo 0.8 0.88 60 0.4
sox input.wav output.wav echos 0.8 0.7 700 0.25 700 0.3

# Equalizer (boost/cut frequencies)
sox input.wav output.wav equalizer 100 2q +6dB     # Boost bass at 100Hz
sox input.wav output.wav equalizer 3000 1q -4dB    # Cut mids at 3kHz

# Filters
sox input.wav output.wav highpass 80               # Remove rumble below 80Hz
sox input.wav output.wav lowpass 8000              # Remove hiss above 8kHz
sox input.wav output.wav bandpass 1000 200         # Center 1kHz, width 200Hz

# Noise reduction (two-step: profile then apply)
sox input.wav -n noiseprof noise.prof trim 0 0.5
sox input.wav output.wav noisered noise.prof 0.21

# Modulation effects
sox input.wav output.wav chorus 0.7 0.9 55 0.4 0.25 2 -t
sox input.wav output.wav flanger
sox input.wav output.wav tremolo 5 60
sox input.wav output.wav phaser 0.8 0.74 3 0.4 0.5 -t

# Speed (changes pitch) / Tempo (preserves pitch) / Pitch (preserves tempo)
sox input.wav output.wav speed 1.25
sox input.wav output.wav tempo 1.25
sox input.wav output.wav pitch 300     # Shift up 300 cents (3 semitones)

# Fade in/out: fade type in-length [stop-position out-length]
# types: t=linear, q=quarter-sine, h=half-sine, l=logarithmic, p=inverted-parabola
sox input.wav output.wav fade t 3 0 5

# Reverse
sox input.wav output.wav reverse
```

### Step 6: Mixing & Combining

```bash
# Concatenate files (one after another)
sox file1.wav file2.wav file3.wav combined.wav

# Mix (overlay/combine simultaneously)
sox -m track1.wav track2.wav mixed.wav

# Mix with different volumes
sox -m -v 0.8 vocals.wav -v 0.3 music.wav mixed.wav

# Mix multiple tracks with individual levels
sox -m -v 1.0 vocals.wav -v 0.25 bgmusic.wav -v 0.15 sfx.wav final.wav

# Splice (insert one audio into another at a specific point)
# Use trim + concat approach:
sox original.wav part1.wav trim 0 30        # First 30s
sox original.wav part2.wav trim 30          # After 30s
sox part1.wav insert.wav part2.wav final.wav  # Concatenate with insert

# Crossfade between two files
sox file1.wav temp1.wav fade t 0 0 3        # 3s fade-out on first
sox file2.wav temp2.wav fade t 3 0 0        # 3s fade-in on second
sox -m temp1.wav temp2.wav crossfaded.wav   # Mix the overlapping parts
```

### Step 7: Spectrograms & Visualization

```bash
# Generate spectrogram image
sox input.wav -n spectrogram -o spectrogram.png

# Customized spectrogram
sox input.wav -n spectrogram \
  -x 1200 -y 500 \           # Width x Height
  -z 80 \                     # Dynamic range (dB)
  -t "My Audio" \              # Title
  -c "Analysis" \              # Comment
  -o spectrogram.png

# Narrow spectrogram (specific frequency range)
sox input.wav -n spectrogram -x 800 -y 300 -z 90 -o spec.png rate 8000

# Stats output
sox input.wav -n stat
# RMS level, peak level, frequency info, etc.

sox input.wav -n stats
# More detailed: DC offset, crest factor, flat factor, peak count
```

### Step 8: Batch Processing

```bash
# Convert all WAV to MP3
for f in *.wav; do sox "$f" "${f%.wav}.mp3"; done

# Normalize all files in a directory
for f in raw/*.wav; do sox "$f" normalized/"$(basename "$f")" norm -1; done

# Apply effects chain to all files
for f in episodes/*.wav; do
  sox "$f" processed/"$(basename "$f")" \
    highpass 80 norm -1 compand 0.3,1 6:-70,-60,-20 -5 -90 0.2 fade t 0.5 0 1
done

# Batch resample to 16kHz mono (for ML/speech)
for f in *.wav; do sox "$f" -r 16000 -c 1 resampled/"$(basename "$f")"; done

# Generate test tones
sox -n test_tone.wav synth 5 sine 440       # 5s 440Hz sine wave
sox -n pink_noise.wav synth 10 pinknoise    # 10s pink noise
```

### Step 9: Effects Chains & Pipelines

```bash
# Podcast processing pipeline (chain multiple effects in one command)
sox raw_episode.wav final_episode.wav \
  highpass 80 noisered noise.prof 0.2 \
  compand 0.3,1 6:-70,-60,-20 -5 -90 0.2 \
  equalizer 3000 1q +2dB norm -1 fade t 1 0 2

# Pipe between sox instances (streaming)
sox input.wav -t wav - trim 10 60 | sox -t wav - output.wav norm -1

# Use with ffmpeg
ffmpeg -i video.mp4 -vn -f wav - | sox -t wav - processed.wav norm -1 highpass 80
```

## Examples

### Example 1: Process raw podcast recordings for publication
**User prompt:** "I have 12 raw podcast episodes in ./raw/ as WAV files. Remove low-frequency rumble, reduce background noise, compress the dynamic range, normalize to -1dB, and add a 1-second fade-in and 2-second fade-out to each."

The agent will:
1. Verify sox is installed with MP3 format support (`sox --version` and check for `libsox-fmt-all`).
2. Profile background noise from the first 0.5 seconds of silence in the first episode using `sox input.wav -n noiseprof noise.prof trim 0 0.5`.
3. Create a `./processed/` output directory.
4. Run a batch loop applying an effects chain: `highpass 80`, `noisered noise.prof 0.2`, `compand 0.3,1 6:-70,-60,-20 -5 -90 0.2`, `norm -1`, `fade t 1 0 2` to each file.
5. Report file sizes before and after processing.

### Example 2: Prepare audio files for a speech recognition model
**User prompt:** "Convert all my interview recordings in ./interviews/ to 16kHz mono WAV files for Whisper transcription. Also trim silence from the start and end of each file."

The agent will:
1. Create a `./prepared/` output directory.
2. Loop over all audio files in `./interviews/`, running `sox "$f" -r 16000 -c 1 prepared/"$(basename "$f")" silence 1 0.1 0.1% reverse silence 1 0.1 0.1% reverse` to resample, convert to mono, and trim leading/trailing silence in one command.
3. Verify the output using `soxi` on a sample file to confirm 16kHz, mono, and reduced duration.

## Guidelines

- Install `libsox-fmt-all` (or `libsox-fmt-mp3`) on Debian/Ubuntu to enable MP3 and other format support; the base sox package only handles WAV and raw formats.
- Chain effects in a single sox command rather than piping between multiple sox processes; this avoids intermediate file I/O and preserves audio quality.
- Always use the two-step noise reduction workflow: profile a silent segment with `noiseprof` first, then apply with `noisered` at a sensitivity of 0.2-0.3 to avoid artifacts.
- When normalizing for podcasts, use `norm -1` (peak at -1dB) to leave headroom; `norm -0` risks clipping on some playback systems.
- Use `soxi` to inspect audio properties before processing; mismatched sample rates or channel counts between input files will produce unexpected mixing results.
