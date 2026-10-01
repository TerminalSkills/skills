---
name: sox
description: >-
  Processes audio files with SoX (Sound eXchange). Use when a user asks to apply
  audio effects, mix and combine audio tracks, convert audio formats, batch
  process audio files, normalize volume, trim silence, add reverb or echo,
  change tempo or pitch, split audio files, create spectrograms, generate test
  tones, resample audio, or build audio processing pipelines. Covers all SoX
  effects, format conversion, mixing, and batch workflows.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows (sox 14.4+)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: content
  repository: https://sourceforge.net/projects/sox/
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

# Verify, and list the formats and effects compiled into this build
sox --version
sox -h
```

Upstream's last release is 14.4.2 (February 2015); apt and Homebrew still ship it. `sox_ng` (codeberg.org/sox_ng/sox_ng) is a maintained fork with the same command-line syntax, packaged as `sox_ng` in Homebrew and `sox-ng` in Debian testing.

**Basic syntax:**
```bash
sox input.wav output.wav [effects...]
# or: sox [input-options] input [output-options] output [effects...]
```

**Get audio info:**
```bash
soxi file.wav
# Sample Rate: 44100, Channels: 2, Duration: 00:03:42.15

soxi -d file.wav    # Duration only (hh:mm:ss.frac; -D prints seconds)
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

# Trim: skip first 5 seconds
sox input.wav output.wav trim 5

# Remove silence from beginning and end
sox input.wav output.wav silence 1 0.1 0.1% reverse silence 1 0.1 0.1% reverse

# Remove pauses longer than 0.5s in the middle too (negative below-periods restarts the effect)
sox input.wav output.wav silence 1 0.1 1% -1 0.5 1%

# Split into one file per non-silent segment (output001.wav, output002.wav, ...; the last one can be empty)
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

# Measure peak and RMS level (stats prints to stderr)
sox input.wav -n stats 2>&1 | grep -E "Pk lev dB|RMS lev dB"
# norm is an alias for gain -n: both set the PEAK level. SoX has no LUFS / EBU R128 effect.

# Guard against clipping inside an effects chain (wraps it in gain -h ... gain -rh)
sox -G input.wav output.wav bass +6 treble +3
```

### Step 5: Audio Effects

```bash
# Reverb: reverb [reverberance% HF-damping% room-scale% stereo-depth% pre-delay-ms wet-gain-dB]
sox input.wav output.wav reverb 50 50 100 100 0 0

# Echo / multiple echoes
sox input.wav output.wav echo 0.8 0.88 60 0.4
sox input.wav output.wav echos 0.8 0.7 700 0.25 700 0.3

# Equalizer (boost/cut frequencies)
sox input.wav output.wav equalizer 100 2q +6       # Boost 6dB at 100Hz (gain is a bare dB number)
sox input.wav output.wav equalizer 3000 1q -4      # Cut 4dB at 3kHz

# Filters
sox input.wav output.wav highpass 80               # Remove rumble below 80Hz
sox input.wav output.wav lowpass 8000              # Remove hiss above 8kHz
sox input.wav output.wav bandpass 1000 200         # Center 1kHz, width 200Hz

# Noise reduction (two-step: profile a noise-only section, then apply)
sox input.wav -n trim 0 0.5 noiseprof noise.prof    # trim must come BEFORE noiseprof
sox input.wav output.wav noisered noise.prof 0.21

# Modulation effects
sox input.wav output.wav chorus 0.7 0.9 55 0.4 0.25 2 -t
sox input.wav output.wav flanger
sox input.wav output.wav tremolo 5 60
sox input.wav output.wav phaser 0.8 0.74 3 0.4 0.5 -t

# Speed (changes pitch) / Tempo (preserves pitch) / Pitch (preserves tempo)
sox input.wav output.wav speed 1.25
sox input.wav output.wav tempo 1.25    # add -s for speech, -m for music
sox input.wav output.wav pitch 300     # Shift up 300 cents (3 semitones)

# Fade in/out: fade type in-length [stop-position out-length]; stop-position 0 or -0 = end of audio
# types: t=linear, q=quarter-sine, h=half-sine, l=logarithmic, p=inverted-parabola
sox input.wav output.wav fade t 3 0 5
```

### Step 6: Mixing & Combining

```bash
# Concatenate files (one after another)
sox file1.wav file2.wav file3.wav combined.wav

# Mix (overlay/combine simultaneously)
sox -m track1.wav track2.wav mixed.wav

# Mix with different volumes (without -v each of n inputs is scaled by 1/n; sample rates must match)
sox -m -v 0.8 vocals.wav -v 0.3 music.wav mixed.wav

# Mix multiple tracks with individual levels
sox -m -v 1.0 vocals.wav -v 0.25 bgmusic.wav -v 0.15 sfx.wav final.wav

# Insert one clip into another at a specific point (trim + concatenate)
sox original.wav part1.wav trim 0 30        # First 30s
sox original.wav part2.wav trim 30          # After 30s
sox part1.wav insert.wav part2.wav final.wav  # Concatenate with insert

# Crossfade two files: equal-power (-q), centred 3s before the end of file1 (6s overlap)
sox file1.wav file2.wav crossfaded.wav splice -q $(soxi -D file1.wav),3
```

### Step 7: Spectrograms & Visualization

```bash
# Generate spectrogram image
sox input.wav -n spectrogram -o spectrogram.png

# Customized: -x width, -y height per channel (fastest at 2^n+1), -z dynamic range in dB, -t title, -c comment
sox input.wav -n spectrogram -x 1200 -y 513 -z 80 -t "Episode 12" -c "raw recording" -o spectrogram.png

# Zoom into 0-4kHz: resample BEFORE the spectrogram effect
sox input.wav -n rate 8k spectrogram -x 800 -y 257 -z 90 -o spec.png

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

# Generate test tones
sox -n test_tone.wav synth 5 sine 440       # 5s 440Hz sine wave
sox -n pink_noise.wav synth 10 pinknoise    # 10s pink noise
```

### Step 9: Effects Chains & Pipelines

```bash
# Podcast processing pipeline (chain multiple effects in one command).
# The 2s fade-out is a fade-in on reversed audio: "fade t 1 0 2" fails after noisered (length unknown)
sox raw_episode.wav final_episode.wav \
  highpass 80 noisered noise.prof 0.2 \
  compand 0.3,1 6:-70,-60,-20 -5 -90 0.2 \
  equalizer 3000 1q +2 norm -1 fade t 1 reverse fade t 2 reverse

# Pipe between sox instances (-p = SoX's own pipe format)
sox input.wav -p trim 10 60 | sox -p output.wav norm -1

# Use with ffmpeg
ffmpeg -i video.mp4 -vn -f wav - | sox -t wav - processed.wav highpass 80 norm -1
```

## Examples

### Example 1: Process raw podcast recordings for publication
**User prompt:** "I have 12 raw podcast episodes in ./raw/ as WAV files. Remove low-frequency rumble, reduce background noise, compress the dynamic range, normalize to -1dB, and add a 1-second fade-in and 2-second fade-out to each."

```bash
mkdir -p processed
# Profile the room noise from the first half second of one episode
sox raw/episode-01.wav -n trim 0 0.5 noiseprof noise.prof
for f in raw/*.wav; do
  sox "$f" "processed/$(basename "$f")" \
    highpass 80 noisered noise.prof 0.2 \
    compand 0.3,1 6:-70,-60,-20 -5 -90 0.2 norm -1 fade t 1 reverse fade t 2 reverse
done
sox processed/episode-01.wav -n stats 2>&1 | grep "Pk lev dB"
```

Result: twelve processed WAV files with the same names in `./processed/`, the originals untouched. The `Pk lev dB` line shows a peak of about -1 dB. `norm` comes after `compand` so the final peak is exact, and the fades are last so they are not re-amplified. The fade-out is a 2-second fade-in on the reversed audio because `fade t 1 0 2` stops with `cannot fade out: audio length is neither known nor given` once `noisered` is in the chain.

### Example 2: Prepare audio files for a speech recognition model
**User prompt:** "Convert all my interview recordings in ./interviews/ to 16kHz mono WAV files for Whisper transcription. Also trim silence from the start and end of each file."

```bash
mkdir -p prepared
for f in interviews/*; do
  name="$(basename "${f%.*}")"
  sox "$f" -r 16000 -c 1 -b 16 "prepared/$name.wav" \
    silence 1 0.1 0.1% reverse silence 1 0.1 0.1% reverse
done
soxi -r prepared/*.wav | sort -u    # 16000
soxi -c prepared/*.wav | sort -u    # 1
```

Result: one 16-bit mono 16 kHz WAV per recording in `./prepared/`, whatever the input format, with leading and trailing silence removed (the second `silence` runs on the reversed audio, then `reverse` restores the order). MP3 inputs need MP3 support in the SoX build.

## Guidelines

- On Debian/Ubuntu the `sox` package already reads and writes WAV, FLAC, Ogg Vorbis and AIFF (via `libsox-fmt-base`); MP3 needs `libsox-fmt-mp3` or `libsox-fmt-all`. `sox -h` lists what a build supports.
- Effects run left to right, and order changes the result: `trim` before `noiseprof`, `rate` before `spectrogram`, `norm` after `compand`. A fade-out to the end (`fade t 1 0 2`) needs a known length, which `noisered` and `silence` hide from the effects after them: use `reverse fade t 2 reverse` there.
- SoX overwrites the output file without asking; pass `--no-clobber` to be prompted.
- In `silence`, a bare integer duration is a sample count, not seconds: write `0.5`, `2t` or `0:02`.
- Chain effects in a single sox command rather than piping between multiple sox processes; this avoids intermediate file I/O and preserves audio quality.
- Always use the two-step noise reduction workflow: profile a noise-only segment with `noiseprof` first, then apply `noisered` with an amount of 0.2-0.3 (default 0.5) to avoid artifacts.
- `norm` and `gain -n` set peak level only. For LUFS loudness targets use a loudness tool such as ffmpeg's `loudnorm` filter; with SoX, `norm -1` leaves 1 dB of headroom. SoX prints a warning when samples clip; add `-G` or lower the gain rather than ignoring it.
- Use `soxi` to inspect audio properties before processing; inputs to `-m` or concatenation must share a sample rate (and channel count when concatenating).
- The 14.4.2 code base dates from 2015 and has known file-parsing vulnerabilities; keep the distribution package updated and do not run SoX on untrusted uploads outside a sandbox. SoX has no AAC/MP4 handler; use ffmpeg for those and for video containers.
