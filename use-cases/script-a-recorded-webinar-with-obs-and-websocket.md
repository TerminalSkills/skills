---
title: Script a Recorded Webinar with OBS and Its WebSocket API
slug: script-a-recorded-webinar-with-obs-and-websocket
description: Let an agent start OBS on the right scene, switch scenes on a timetable, record and hand back a ready-to-share video file, so a solo presenter can run a webinar without touching the OBS window.
skills:
  - obs-studio
  - ffmpeg
category: content
tags:
  - obs
  - webinar
  - screen-recording
  - automation
  - obs-websocket
---

# Script a Recorded Webinar with OBS and Its WebSocket API

## The Problem

Tomas Brandt teaches a monthly 30-minute webinar on infrastructure-as-code for a small training company. He presents alone: his slides, his terminal and his webcam all have to be on screen at the right moment, and he forgets the scene switches while he is talking. Last month the recording started 90 seconds late, the Q&A part was recorded with the slides scene still active, and he lost an evening re-cutting the video. He wants the mechanical parts to run themselves so that he can concentrate on speaking.

This is not about building a streaming service; Tomas already uses OBS Studio. The problem is that the only way he knows to control it is by clicking.

## The Solution

OBS 28 and later contains obs-websocket v5, a local control API. The agent writes one script that connects with the `obsws-python` client, switches scenes at fixed times, records, and prints where the file was saved. ffmpeg turns the recording into an MP4 that can be uploaded. OBS is launched with its own command-line flags, so profile, scene collection and starting scene are always the same.

## Step-by-Step Walkthrough

### 1. Prepare OBS once

Prompt: "Check my OBS setup for the webinar: the scenes should be Intro, Slides, Terminal and Q&A, and the websocket server must be on."

The agent cannot see the window, so it asks Tomas to enable Tools > WebSocket Server Settings (authentication on) and to export the password as `OBS_WS_PASSWORD`. Then it connects and lists what exists:

```python
import os
import obsws_python as obs

cl = obs.ReqClient(host="127.0.0.1", port=4455, password=os.environ["OBS_WS_PASSWORD"], timeout=5)
print(cl.get_version().obs_web_socket_version)
print([s["sceneName"] for s in cl.get_scene_list().scenes])
print([i["inputName"] for i in cl.get_input_list().inputs])
```

The output shows a scene named `Q and A` instead of `Q&A` and an input called `Mic/Aux`; the script will use the real names.

### 2. Start OBS with the right profile and scene

Prompt: "Start OBS in the webinar profile on the Intro scene, minimised, without starting to record yet."

```bash
obs --profile "Webinar" --collection "Training" --scene "Intro" --minimize-to-tray &
sleep 8
```

The firewall on Tomas's laptop is checked: port 4455 is not open to the network, because obs-websocket listens on every interface.

### 3. Run the timetable

Prompt: "Record the webinar: Intro at 0:00, Slides at 2:00, Terminal at 14:00, Q and A at 25:00, stop at 30:00, then tell me the file."

```python
import os, time
import obsws_python as obs

cl = obs.ReqClient(host="127.0.0.1", port=4455, password=os.environ["OBS_WS_PASSWORD"], timeout=5)
timeline = [(120, "Slides"), (840, "Terminal"), (1500, "Q and A")]
cl.set_current_program_scene("Intro")
cl.start_record()
start = time.monotonic()
for offset, scene in timeline:
    time.sleep(max(0, offset - (time.monotonic() - start)))
    cl.set_current_program_scene(scene)
time.sleep(max(0, 1800 - (time.monotonic() - start)))
print("saved:", cl.stop_record().output_path)
```

### 4. Watch the health of the recording

Prompt: "While it runs, check every minute that the disk has space and that no frames are being skipped."

```python
s = cl.get_stats()
print(round(s.available_disk_space), "MB free,", s.output_skipped_frames, "skipped of", s.output_total_frames)
```

If free space drops below 2 GB, the agent warns Tomas and stops the recording early instead of losing it.

### 5. Make an uploadable file

Prompt: "Convert the recording to MP4 without re-encoding."

```bash
# the path printed by stop_record; the extension follows the recording format set in OBS
ffmpeg -i "/home/tomas/Videos/2026-11-12 18-00-03.mkv" -c copy webinar-iac-2026-11.mp4
```

## Real-World Example

The next webinar runs 31 minutes. The scenes change at 2:00, 14:00 and 25:00 to the second, the recording starts before Tomas says hello and stops after the last question. The agent prints the saved path and the ffmpeg command copies the file into an MP4 in about 20 seconds because nothing is re-encoded. The stats check showed 0 skipped frames out of 55,800 and 41 GB free. Tomas spends the saved evening writing the next lesson. When he later wants a second presenter's screen, he only adds one more scene and one more line to the timeline.

## Related Skills

- [obs-studio](/skills/obs-studio) — launch flags, the websocket setup and the `obsws-python` calls used above
- [ffmpeg](/skills/ffmpeg) — repackages the recording into an MP4 without re-encoding
