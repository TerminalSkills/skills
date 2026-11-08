---
name: obs-studio
description: >-
  OBS Studio is free open-source software that captures, mixes, records and live-streams video; its built-in obs-websocket v5 server lets scripts switch scenes, start and stop recording or streaming, mute inputs and read performance stats. Use this skill when the user asks to "automate OBS", "start recording from a script", "switch scenes from the terminal", "launch OBS already streaming", or "monitor dropped frames in OBS". Covers launch flags, the websocket setup and the obsws-python client.
license: Apache-2.0
compatibility: "OBS Studio 28+ (obs-websocket 5.x built in; tested against the docs of 33.0.1), Python 3.9+ for obsws-python, a desktop session on Windows, macOS or Linux"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: content
  tags: "obs, obs-websocket, live-streaming, screen-recording, automation"
  repository: https://github.com/obsproject/obs-studio
---
# OBS Studio — scripted recording and streaming via obs-websocket

## Overview

OBS Studio is a desktop application, so an agent cannot see or click its window. What an agent can do from a terminal is (1) start OBS with command-line flags that select a profile, scene collection and scene and optionally start recording or streaming, and (2) drive a running OBS through obs-websocket, the JSON-RPC server built into OBS 28 and later (protocol version 5, default port 4455). Through it a script can list and switch scenes, toggle scene items, change input settings, mute audio, start and stop recording or streaming, and read statistics.

Scenes and sources themselves (which cameras, windows and overlays exist) are designed once in the OBS UI or loaded from a scene-collection JSON. This skill automates the running of a session, not the first-time layout.

## Instructions

### Install OBS

```bash
flatpak install flathub com.obsproject.Studio    # Linux
brew install --cask obs                          # macOS
winget install OBSProject.OBSStudio              # Windows
```

On Flatpak, run OBS as `flatpak run com.obsproject.Studio <flags>`. Linux distributions also package OBS; the project's build and install notes are at https://github.com/obsproject/obs-studio/wiki/Install-Instructions.

### Launch flags

These flags are parsed by OBS itself (listed in `obs --help` and in `frontend/obs-main.cpp` of release 33.0.1):

| Flag | Effect |
|---|---|
| `--profile NAME` | Start with this profile |
| `--collection NAME` | Start with this scene collection |
| `--scene NAME` | Start on this scene |
| `--startrecording` | Start recording as soon as OBS is up |
| `--startstreaming` | Start streaming as soon as OBS is up |
| `--startreplaybuffer` | Start the replay buffer |
| `--startvirtualcam` | Start the virtual camera, if available |
| `--studio-mode` | Enable studio mode |
| `--minimize-to-tray` | Start minimised to the tray |
| `--disable-updater` | Skip the built-in updater (Windows and macOS) |
| `--multi` | Do not warn about a second running instance |
| `--safe-mode` | Disable third-party plugins, scripts and WebSockets |

obs-websocket reads its own overrides from the same command line: `--websocket_port N`, `--websocket_password VALUE` (visible in the process list, so prefer the settings dialog), `--websocket_ipv4_only` and `--websocket_debug`.

```bash
obs --profile "Webinar" --collection "Talks" --scene "Intro" --minimize-to-tray
```

Never combine `--safe-mode` with scripting: it disables the WebSocket server.

### Enable and secure obs-websocket

In OBS, open Tools > WebSocket Server Settings: tick "Enable WebSocket server", keep authentication on, and press "Show Connect Info" to read or change the generated password. Keep the password in an environment variable on the machine that runs the script, for example `OBS_WS_PASSWORD`.

obs-websocket has no bind-address option: the server listens on all interfaces (the only network switch is `--websocket_ipv4_only`). To keep it local, block the port at the firewall, or leave it closed to the network and reach a remote machine over an SSH tunnel: `ssh -N -L 4455:127.0.0.1:4455 streamer@studio-pc`.

### Install the Python client

```bash
python3 -m venv ~/.venvs/obs && ~/.venvs/obs/bin/pip install "obsws-python==1.8.1"
```

`obsws-python` (PyPI, version 1.8.1 at the time of writing) wraps the v5 protocol. Request names map to snake_case methods; responses are objects with snake_case attributes (`output_path`, `cpu_usage`).

```python
import os
import obsws_python as obs

cl = obs.ReqClient(host="127.0.0.1", port=4455,
                   password=os.environ["OBS_WS_PASSWORD"], timeout=5)
print(cl.get_version().obs_version)
```

Without keyword arguments the client reads `host`, `port` and `password` from a `config.toml` in the current directory, the home directory or `~/.config/obsws-python/`. A failed request raises `obsws_python.error.OBSSDKRequestError`.

### Scenes, recording, streaming

```python
scenes = cl.get_scene_list()
print([s["sceneName"] for s in scenes.scenes], scenes.current_program_scene_name)

cl.set_current_program_scene("Slides")

cl.start_record()
status = cl.get_record_status()          # .output_active, .output_duration, .output_bytes
saved = cl.stop_record()                 # .output_path is the file just written

cl.start_stream()                        # uses the stream service already set up in OBS
cl.stop_stream()
```

Other requests of the same shape: `toggle_record`, `toggle_record_pause`, `get_stream_status`, `get_record_directory` and `set_record_directory` (the setter needs obs-websocket 5.3 or later), `set_current_profile`, `set_current_scene_collection`, `create_scene`. The stream key stays in OBS settings; do not send it through scripts you log.

### Inputs and scene items

```python
names = [i["inputName"] for i in cl.get_input_list().inputs]
cl.set_input_mute("Mic/Aux", True)

item = cl.get_scene_item_id("Slides", "Webcam")
cl.set_scene_item_enabled("Slides", item.scene_item_id, False)

cl.set_input_settings("Slide window", {"window": "Keynote"}, True)   # overlay=True keeps other settings
```

`get_input_settings(name)` shows which keys an input uses; the keys differ by source kind, so read them before writing. The third argument of `set_input_settings` is `overlay`: `True` merges, `False` resets the input to defaults first.

### Read stats

```python
s = cl.get_stats()
print(s.cpu_usage, s.active_fps, s.output_skipped_frames, s.output_total_frames, s.available_disk_space)
```

Events (scene changed, record state changed) come from `obs.EventClient(...)` with callbacks named `on_` plus the event name in snake case (for example `on_current_program_scene_changed`).

## Examples

### Example 1: Record a webinar, switching scenes on a timetable

Request: "Record my 30-minute webinar. Start on 'Intro', go to 'Slides' after 2 minutes and 'Q&A' at minute 25, then stop and tell me the file."

```python
import os, time
import obsws_python as obs

cl = obs.ReqClient(host="127.0.0.1", port=4455, password=os.environ["OBS_WS_PASSWORD"], timeout=5)
timeline = [(0, "Intro"), (120, "Slides"), (1500, "Q&A")]
cl.set_current_program_scene("Intro")
cl.start_record()
start = time.monotonic()
for offset, scene in timeline[1:]:
    time.sleep(max(0, offset - (time.monotonic() - start)))
    cl.set_current_program_scene(scene)
time.sleep(max(0, 1800 - (time.monotonic() - start)))
print("saved:", cl.stop_record().output_path)
```

Run with `OBS_WS_PASSWORD` exported. Result: the script prints the recording's absolute path; scenes were switched at 2:00 and 25:00.

### Example 2: Start the day's stream from a cron-like job and watch for dropped frames

Request: "At 18:55 start OBS on the 'Starting soon' scene and begin streaming; warn me if more than 1% of frames get skipped."

```bash
obs --profile "Evening" --collection "Studio" --scene "Starting soon" --startstreaming --minimize-to-tray &
```

```python
import os, time
import obsws_python as obs

def connect(tries=20):
    for _ in range(tries):                       # OBS needs a few seconds before the server answers
        try:
            return obs.ReqClient(host="127.0.0.1", port=4455,
                                 password=os.environ["OBS_WS_PASSWORD"], timeout=5)
        except (ConnectionRefusedError, OSError):
            time.sleep(3)
    raise SystemExit("OBS websocket did not come up")

cl = connect()
while not cl.get_stream_status().output_active:   # --startstreaming acts after startup
    time.sleep(2)
while (st := cl.get_stream_status()).output_active:
    if st.output_total_frames and st.output_skipped_frames / st.output_total_frames > 0.01:
        print("WARNING: more than 1% of frames skipped, lower the bitrate")
    time.sleep(30)
```

Result: OBS opens already streaming on the named scene; the loop prints a warning whenever the skipped-frame ratio crosses 1%.

## Guidelines

- OBS must be running with the WebSocket server enabled; a script cannot start OBS through the websocket. Launch it first, wait a few seconds, then connect.
- The server accepts connections from any address; always keep authentication on and block the port at the firewall.
- Scene and input names are case-sensitive and must exist; list them with `get_scene_list` and `get_input_list` instead of guessing.
- `start_stream` uses the service and key saved in OBS; this skill does not set or read stream keys.
- `--startrecording` and `--startstreaming` act immediately after launch. Confirm the scene and the audio sources first, or the first seconds of a recording can be the wrong scene.
- Request availability depends on the OBS version (`set_record_directory` needs obs-websocket 5.3 or later); check `get_version()` for `obs_web_socket_version`.
- Do not use this for building a streaming service or ingest server; for that see the livestreaming platform use case. For editing recorded files use ffmpeg.
- Headless or CI use is out of scope: OBS needs a graphical session for its scene rendering.
