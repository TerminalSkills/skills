---
name: davinci-resolve
description: >-
  Automate and script DaVinci Resolve workflows. Use when a user asks to
  script DaVinci Resolve via Python/Lua API, automate color grading, batch
  render projects, manage timelines programmatically, automate media import,
  build render queues, create Fusion compositions via script, automate
  Fairlight audio processing, manage project databases, build custom tool
  scripts, or integrate Resolve into production pipelines. Covers the
  Resolve Scripting API (Python/Lua), Fusion scripting, and workflow automation.
license: Apache-2.0
compatibility: "DaVinci Resolve 18+, Python 3.6+ or Lua 5.1+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: video
  tags: ["davinci-resolve", "video-editing", "color-grading", "scripting", "nle", "fusion"]
---

# DaVinci Resolve

## Overview

Automate DaVinci Resolve — the professional NLE with built-in color grading, Fusion VFX, and Fairlight audio. This skill covers the Resolve Scripting API (Python and Lua) for programmatic control of projects, timelines, media pools, color grades, render jobs, and Fusion compositions. Build batch workflows, automate repetitive edits, manage render queues, and integrate Resolve into production pipelines.

## Instructions

### Step 1: Scripting API Setup

DaVinci Resolve exposes a Python/Lua API when running. Scripts connect to the running instance.

**Python setup:**
```python
# The Resolve scripting module location varies by OS:
# macOS: /Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules/
# Linux: /opt/resolve/Developer/Scripting/Modules/
# Windows: %PROGRAMDATA%/Blackmagic Design/DaVinci Resolve/Support/Developer/Scripting/Modules/

import sys
sys.path.append("/opt/resolve/Developer/Scripting/Modules/")  # Adjust per OS

import DaVinciResolveScript as dvr

resolve = dvr.scriptapp("Resolve")
print(f"Resolve version: {resolve.GetVersion()}")

# Core objects
projectManager = resolve.GetProjectManager()
project = projectManager.GetCurrentProject()
mediaPool = project.GetMediaPool()
timeline = project.GetCurrentTimeline()
```

**Lua setup:**
```lua
resolve = Resolve()
projectManager = resolve:GetProjectManager()
project = projectManager:GetCurrentProject()
mediaPool = project:GetMediaPool()
```

**Run scripts:**
```bash
# From Resolve: Workspace → Scripts → run script
# From CLI (Resolve must be running):
python3 my_script.py

# Or via Resolve's console:
# Workspace → Console → Py3 or Lua tab
```

### Step 2: Project & Database Management

```python
# List all projects
pm = resolve.GetProjectManager()
projects = pm.GetProjectListInCurrentFolder()
print("Projects:", projects)

# Open a project
pm.LoadProject("My Film")

# Create a new project
pm.CreateProject("New Project")

# Project settings
project = pm.GetCurrentProject()
project.SetSetting("timelineResolutionWidth", "3840")
project.SetSetting("timelineResolutionHeight", "2160")
project.SetSetting("timelineFrameRate", "24")
project.SetSetting("colorScienceMode", "davinciYRGBColorManagedv2")

# Get all settings
settings = project.GetSetting()
for key, val in settings.items():
    print(f"  {key}: {val}")

# Database management
pm.CreateFolder("Season 2")
pm.OpenFolder("Season 2")

# Save and close
pm.SaveProject()
pm.CloseProject(project)
```

### Step 3: Media Pool — Import & Organize

```python
mediaPool = project.GetMediaPool()
rootFolder = mediaPool.GetRootFolder()

# Create bins (folders)
dailies_bin = mediaPool.AddSubFolder(rootFolder, "Dailies")
sfx_bin = mediaPool.AddSubFolder(rootFolder, "SFX")
music_bin = mediaPool.AddSubFolder(rootFolder, "Music")

# Import media
mediaPool.SetCurrentFolder(dailies_bin)
clips = mediaPool.ImportMedia([
    "/path/to/footage/scene01_take01.mov",
    "/path/to/footage/scene01_take02.mov",
    "/path/to/footage/scene02_take01.mov",
])

# Import a folder recursively
import os
def import_folder(pool, folder_path, bin_folder):
    pool.SetCurrentFolder(bin_folder)
    files = []
    for root, dirs, filenames in os.walk(folder_path):
        for f in filenames:
            if f.lower().endswith(('.mov', '.mp4', '.mxf', '.wav', '.mp3')):
                files.append(os.path.join(root, f))
    if files:
        pool.ImportMedia(files)
    print(f"Imported {len(files)} files from {folder_path}")

import_folder(mediaPool, "/path/to/footage/day1", dailies_bin)

# List clips in a bin
mediaPool.SetCurrentFolder(dailies_bin)
clips = dailies_bin.GetClipList()
for clip in clips:
    props = clip.GetClipProperty()
    print(f"  {props['File Name']} | {props['Duration']} | {props['Resolution']}")

# Set clip metadata
clip = clips[0]
clip.SetClipProperty("Comments", "Best take")
clip.SetClipProperty("Good Take", "true")
clip.SetClipColor("Green")
```

### Step 4: Timeline Operations

```python
# Create a new timeline
timeline = mediaPool.CreateEmptyTimeline("Assembly Edit v1")

# Or create from clips
clips = dailies_bin.GetClipList()
timeline = mediaPool.CreateTimelineFromClips("Rough Cut", clips)

# Get current timeline
timeline = project.GetCurrentTimeline()
print(f"Timeline: {timeline.GetName()}")
print(f"Duration: {timeline.GetEndFrame() - timeline.GetStartFrame()} frames")
print(f"Track count: Video={timeline.GetTrackCount('video')}, Audio={timeline.GetTrackCount('audio')}")

# Append clips to timeline
mediaPool.AppendToTimeline([clips[0], clips[1], clips[2]])

# Append with in/out points (subclip)
mediaPool.AppendToTimeline([{
    "mediaPoolItem": clips[0],
    "startFrame": 0,
    "endFrame": 120,  # First 5 seconds at 24fps
    "mediaType": 1,   # 1=video, 2=audio
}])

# Get all clips on a track
items = timeline.GetItemListInTrack("video", 1)  # Track 1
for item in items:
    print(f"  Frame {item.GetStart()}-{item.GetEnd()}: {item.GetName()}")

# Move playhead
timeline.SetCurrentTimecode("01:00:30:00")

# Add marker
timeline.AddMarker(1000, "Blue", "Review Point", "Check color here", 1, "reviewTag")

# Delete marker
timeline.DeleteMarkerByCustomData("reviewTag")

# Get all markers
markers = timeline.GetMarkers()
for frame, data in markers.items():
    print(f"  Frame {frame}: [{data['color']}] {data['name']} - {data['note']}")
```

### Step 5: Color Grading Automation

```python
# Switch to Color page
resolve.OpenPage("color")

timeline = project.GetCurrentTimeline()
items = timeline.GetItemListInTrack("video", 1)

for item in items:
    # Get the first node in the color graph
    # Node index starts at 1
    
    # Apply a LUT
    item.SetLUT(1, "/path/to/luts/FilmLook.cube")  # Node 1
    
    # Set CDL (Color Decision List) values
    item.SetCDL({
        "NodeIndex": 1,
        "Slope": [1.1, 1.0, 0.95],
        "Offset": [0.0, 0.0, 0.02],
        "Power": [1.0, 1.0, 1.05],
        "Saturation": 1.1,
    })

# Apply a grade from one clip to all others
source_item = items[0]
for item in items[1:]:
    timeline.ApplyGradeFromTimelineClip(item, source_item)

# Gallery stills
gallery = project.GetGallery()
album = gallery.GetCurrentStillAlbum()

# Grab a still from current frame
album.GrabStill()

# Power grades (saved grades)
# Export current grade
item.ExportLUT(1, "/path/to/export/grade.cube")
```

### Step 6: Render Queue & Batch Export

```python
project = projectManager.GetCurrentProject()

# Render presets
presets = project.GetRenderPresetList()
print("Available presets:", presets)

# Set render settings
project.SetRenderSettings({
    "SelectAllFrames": True,
    "TargetDir": "/path/to/renders/",
    "CustomName": "MyProject_v1",
    "FormatWidth": 3840,
    "FormatHeight": 2160,
    "FrameRate": 24,
    "VideoQuality": 0,  # 0 = best
    "AudioCodec": "aac",
    "AudioBitDepth": 24,
    "AudioSampleRate": 48000,
    "ExportVideo": True,
    "ExportAudio": True,
})

# Load a preset
project.LoadRenderPreset("YouTube 4K")

# Add current timeline to render queue
project.AddRenderJob()

# Add multiple timelines
timelines = [project.GetTimelineByIndex(i) for i in range(1, project.GetTimelineCount() + 1)]
for tl in timelines:
    project.SetCurrentTimeline(tl)
    project.SetRenderSettings({
        "TargetDir": f"/renders/{tl.GetName()}/",
        "CustomName": tl.GetName(),
    })
    project.AddRenderJob()

# List render jobs
jobs = project.GetRenderJobList()
for job in jobs:
    print(f"  Job {job['JobId']}: {job['TimelineName']} → {job['TargetDir']}")

# Start rendering
project.StartRendering()

# Monitor progress
import time
while project.IsRenderingInProgress():
    for job in project.GetRenderJobList():
        status = project.GetRenderJobStatus(job["JobId"])
        print(f"  {job['TimelineName']}: {status.get('CompletionPercentage', 0)}%")
    time.sleep(5)

print("All renders complete!")

# Delete render jobs
project.DeleteAllRenderJobs()
```

**Batch render script (all projects in a folder):**
```python
pm = resolve.GetProjectManager()
projects = pm.GetProjectListInCurrentFolder()

for proj_name in projects:
    pm.LoadProject(proj_name)
    project = pm.GetCurrentProject()
    
    # Set each timeline to render
    for i in range(1, project.GetTimelineCount() + 1):
        tl = project.GetTimelineByIndex(i)
        project.SetCurrentTimeline(tl)
        project.LoadRenderPreset("ProRes 422 HQ")
        project.SetRenderSettings({
            "TargetDir": f"/renders/{proj_name}/{tl.GetName()}/",
        })
        project.AddRenderJob()
    
    project.StartRendering()
    while project.IsRenderingInProgress():
        time.sleep(10)
    
    pm.SaveProject()
    print(f"✅ Rendered: {proj_name}")
```

### Step 7: Fusion Scripting

```python
# Access Fusion page from a timeline clip
resolve.OpenPage("fusion")

item = timeline.GetItemListInTrack("video", 1)[0]
fusion_comp = item.GetFusionCompByIndex(1)

# Add a Text+ node
text_node = fusion_comp.AddTool("TextPlus", -32768, -32768)
text_node.StyledText = "Episode 1"
text_node.Font = "Arial"
text_node.Size = 0.08
text_node.Center = {"x": 0.5, "y": 0.9}

# Connect to MediaOut
media_out = fusion_comp.FindToolByID("MediaOut1")
media_out.ConnectInput("Input", text_node)

# Add a background
bg = fusion_comp.AddTool("Background")
bg.TopLeftRed = 0.0
bg.TopLeftGreen = 0.0
bg.TopLeftBlue = 0.0
bg.TopLeftAlpha = 0.5

# Merge: layer text over video
merge = fusion_comp.AddTool("Merge")
merge.ConnectInput("Foreground", text_node)
merge.ConnectInput("Background", bg)
```

### Step 8: Fairlight Audio Automation

```python
resolve.OpenPage("fairlight")

timeline = project.GetCurrentTimeline()

# Get audio track count
audio_tracks = timeline.GetTrackCount("audio")

# Set track properties
for i in range(1, audio_tracks + 1):
    name = timeline.GetTrackName("audio", i)
    print(f"  Audio track {i}: {name}")

# Track EQ and dynamics are set via the Fairlight page UI
# Scripting can control clip-level properties:
audio_items = timeline.GetItemListInTrack("audio", 1)
for item in audio_items:
    # Set volume (dB)
    item.SetProperty("Volume", -3.0)
    # Set pan
    item.SetProperty("Pan", 0.0)  # -1.0 left to 1.0 right
```

### Step 9: Integration Patterns

**Watch folder — auto-import and render:**
```python
import time
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class IngestHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        ext = Path(event.src_path).suffix.lower()
        if ext in ('.mov', '.mp4', '.mxf'):
            print(f"New file: {event.src_path}")
            # Import to Resolve
            mediaPool.SetCurrentFolder(dailies_bin)
            mediaPool.ImportMedia([event.src_path])

observer = Observer()
observer.schedule(IngestHandler(), "/watch/incoming", recursive=True)
observer.start()

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    observer.stop()
observer.join()
```

**EDL/XML/AAF round-trip:**
```python
# Import timeline from EDL
mediaPool.ImportTimelineFromFile("/path/to/edit.edl", {
    "timelineName": "Imported Edit",
    "importSourceClips": True,
    "sourceClipsPath": "/path/to/media/",
})

# Export timeline
timeline.Export("/path/to/export/timeline.fcpxml", resolve.EXPORT_FCPXML)
# Other formats: EXPORT_EDL, EXPORT_AAF, EXPORT_DRT (Resolve)
```
