---
title: Record Android Bug Repro Videos from a Real Device with scrcpy
slug: record-android-bug-repro-videos-with-scrcpy
description: Capture a clean screen recording with touch indicators and device logs from a physical Android phone, then shrink it to a size a ticket tracker accepts.
skills:
  - scrcpy
  - ffmpeg
category: development
tags:
  - android
  - screen-recording
  - bug-reports
  - qa
  - adb
---

# Record Android Bug Repro Videos from a Real Device with scrcpy

## The Problem

Tomás Herrera is the only QA engineer at a four-person team building a parcel-tracking app for Android. A customer reports that the "Scan label" screen freezes on a Samsung A34 after the second scan. It happens on that phone, on that Android version, and never in the emulator. His usual method is to hold a second phone over the first and film it, which gives a shaky 400 MB clip where nobody can see which button was tapped. The ticket tracker refuses attachments above 25 MB, and the developers keep asking "which build?" and "what did the log say?".

He wants a clean recording straight from the device, made in one command, with touches visible, plus the matching log and a file small enough to attach.

## The Solution

**scrcpy** records the screen from the device's own encoder over the USB cable, with touch dots drawn and device audio included, without installing anything on the phone. **ffmpeg** trims the dead seconds at the start and recompresses the clip under the tracker's limit. The agent runs the commands, checks the output files, and writes the ticket text. Tomás owns the test phone; the recording starts only after he has enabled USB debugging and accepted the authorization prompt himself.

## Step-by-Step Walkthrough

### 1. Check that the device is connected and authorized

Prompt: "The test A34 is plugged in. Check that adb sees it and tell me the build."

```bash
adb devices
adb shell getprop ro.build.version.release
adb shell getprop ro.product.model
adb shell dumpsys package com.parcelpath.app | grep versionName
```

`adb devices` must list the phone as `device`. If it says `unauthorized`, the agent stops and asks Tomás to accept the prompt on the phone; it does not try to work around it. The three queries give Android version, model and app version for the ticket header.

### 2. Clear the log, then record

Prompt: "Record me reproducing it, max 90 seconds, with touches visible."

The agent clears the old log so the attached log only covers this run, then starts the recording:

```bash
adb logcat -c
scrcpy --record=scan-freeze-raw.mp4 --time-limit=90 --show-touches --stay-awake --window-title="scan-freeze repro"
```

A window opens; Tomás scans two labels and the screen freezes. He closes the window (or waits for the limit). `--show-touches` draws a dot for each physical touch, `--stay-awake` stops the phone from locking mid-test, and the timestamps in the file come from the device, so a hiccup in the cable does not distort the video.

### 3. Save the log that belongs to the clip

```bash
adb logcat -d -t 2000 > scan-freeze-logcat.txt
grep -n -i "ANR\|FATAL EXCEPTION" scan-freeze-logcat.txt | head
```

`-d` dumps and exits, `-t 2000` keeps the last 2,000 lines. The grep shows whether the freeze produced an ANR (application not responding) or a crash.

### 4. Trim and compress for the tracker

Prompt: "Cut the first 6 seconds, I was fumbling, and get it under 25 MB."

```bash
ls -lh scan-freeze-raw.mp4
ffmpeg -ss 6 -i scan-freeze-raw.mp4 -c:v libx264 -crf 28 -preset medium -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart scan-freeze.mp4
ls -lh scan-freeze.mp4
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 scan-freeze.mp4
```

The agent reports sizes before and after. If the result is still above 25 MB it raises `-crf` (for example to 32) or adds `-vf scale=720:-2` and repeats; if the clip must be silent it adds `-an`.

### 5. Write the ticket

The agent writes the description with device, Android version, app version, numbered steps, the observed ANR line from the log, and the two attachments, and reminds Tomás to watch the video once before sharing: screen recordings capture notifications and anything typed.

## Real-World Example

The raw recording is 78 seconds and 61 MB. After the trim and `-crf 28` the clip is 72 seconds and 9 MB, and plays in the tracker's preview. The log shows `ANR in com.parcelpath.app (ScanActivity)` right after the second scan's `CameraDevice closed` line, and a developer sees in the video that the freeze starts only when the second scan is started within about a second of the first confirmation toast. That detail never came across in the old phone-over-phone clips. The fix is shipped in the next build, and Tomás saves the three commands (`logcat -c`, `scrcpy --record`, `ffmpeg`) as a shell script so every future repro takes one prompt.

For repros that run unattended, such as an overnight soak test on a tablet, the same recording runs with `scrcpy --no-window --no-control --record=soak.mkv --time-limit=600` wrapped in a shell `timeout`.

## Related Skills

- [scrcpy](/skills/scrcpy) — records the real device screen over USB or Wi-Fi, with touches and audio, optionally with no window
- [ffmpeg](/skills/ffmpeg) — trims the dead seconds and recompresses the recording to fit the attachment limit
