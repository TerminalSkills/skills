---
name: davinci-resolve
description: >-
  Automate and script DaVinci Resolve workflows. Use when a user asks to script
  DaVinci Resolve via Python/Lua API, automate color grading, batch render
  projects, manage timelines programmatically, automate media import, build
  render queues, create Fusion compositions via script, automate Fairlight audio
  processing, manage project databases, build custom tool scripts, or integrate
  Resolve into production pipelines. Covers the Resolve Scripting API
  (Python/Lua), Fusion scripting, and workflow automation.
license: Apache-2.0
compatibility: 'DaVinci Resolve 18+, Python 3.6+ or Lua 5.1+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags:
    - davinci-resolve
    - video-editing
    - color-grading
    - scripting
    - nle
---

# DaVinci Resolve

## Overview

Automate DaVinci Resolve — the professional NLE with built-in color grading, Fusion VFX, and Fairlight audio. This skill covers the Resolve Scripting API (Python and Lua) for programmatic control of projects, timelines, media pools, color grades, render jobs, and Fusion compositions. Build batch workflows, automate repetitive edits, manage render queues, and integrate Resolve into production pipelines.

## Instructions

### Step 1: Scripting API Setup

DaVinci Resolve exposes a Python/Lua API when running. Scripts connect to the running instance.

```python
# Module paths vary by OS:
# macOS: /Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules/
# Linux: /opt/resolve/Developer/Scripting/Modules/
# Windows: %PROGRAMDATA%/Blackmagic Design/DaVinci Resolve/Support/Developer/Scripting/Modules/

import sys
sys.path.append("/opt/resolve/Developer/Scripting/Modules/")
import DaVinciResolveScript as dvr

resolve = dvr.scriptapp("Resolve")
projectManager = resolve.GetProjectManager()
project = projectManager.GetCurrentProject()
mediaPool = project.GetMediaPool()
timeline = project.GetCurrentTimeline()
```

Run scripts from: Workspace > Scripts, CLI (`python3 my_script.py`), or Workspace > Console.

### Step 2: Project & Media Pool

```python
# Project management
pm = resolve.GetProjectManager()
pm.CreateProject("New Project")
project = pm.GetCurrentProject()
project.SetSetting("timelineResolutionWidth", "3840")
project.SetSetting("timelineResolutionHeight", "2160")
project.SetSetting("timelineFrameRate", "24")

# Media Pool — create bins and import
mediaPool = project.GetMediaPool()
rootFolder = mediaPool.GetRootFolder()
dailies_bin = mediaPool.AddSubFolder(rootFolder, "Dailies")
mediaPool.SetCurrentFolder(dailies_bin)
clips = mediaPool.ImportMedia([
    "/path/to/footage/scene01_take01.mov",
    "/path/to/footage/scene01_take02.mov",
])

# Set clip metadata
clip = clips[0]
clip.SetClipProperty("Comments", "Best take")
clip.SetClipColor("Green")
```

### Step 3: Timeline Operations

```python
# Create and populate timelines
timeline = mediaPool.CreateEmptyTimeline("Assembly Edit v1")
mediaPool.AppendToTimeline([clips[0], clips[1]])

# Append subclip with in/out points
mediaPool.AppendToTimeline([{
    "mediaPoolItem": clips[0],
    "startFrame": 0,
    "endFrame": 120,  # First 5 seconds at 24fps
}])

# Inspect timeline
items = timeline.GetItemListInTrack("video", 1)
for item in items:
    print(f"  Frame {item.GetStart()}-{item.GetEnd()}: {item.GetName()}")

# Markers
timeline.AddMarker(1000, "Blue", "Review Point", "Check color here", 1, "reviewTag")
markers = timeline.GetMarkers()
```

### Step 4: Color Grading Automation

```python
resolve.OpenPage("color")
items = timeline.GetItemListInTrack("video", 1)

for item in items:
    item.SetLUT(1, "/path/to/luts/FilmLook.cube")
    item.SetCDL({
        "NodeIndex": 1,
        "Slope": [1.1, 1.0, 0.95],
        "Offset": [0.0, 0.0, 0.02],
        "Power": [1.0, 1.0, 1.05],
        "Saturation": 1.1,
    })

# Copy grade from one clip to all others
source_item = items[0]
for item in items[1:]:
    timeline.ApplyGradeFromTimelineClip(item, source_item)
```

### Step 5: Render Queue & Batch Export

```python
project.SetRenderSettings({
    "SelectAllFrames": True,
    "TargetDir": "/path/to/renders/",
    "CustomName": "MyProject_v1",
    "FormatWidth": 3840,
    "FormatHeight": 2160,
    "FrameRate": 24,
    "ExportVideo": True,
    "ExportAudio": True,
})
project.LoadRenderPreset("YouTube 4K")
project.AddRenderJob()

# Batch: add all timelines to render queue
for i in range(1, project.GetTimelineCount() + 1):
    tl = project.GetTimelineByIndex(i)
    project.SetCurrentTimeline(tl)
    project.SetRenderSettings({"TargetDir": f"/renders/{tl.GetName()}/"})
    project.AddRenderJob()

project.StartRendering()

# Monitor progress
import time
while project.IsRenderingInProgress():
    for job in project.GetRenderJobList():
        status = project.GetRenderJobStatus(job["JobId"])
        print(f"  {job['TimelineName']}: {status.get('CompletionPercentage', 0)}%")
    time.sleep(5)
```

### Step 6: Fusion Scripting & Integration

```python
# Add Fusion text overlay to a clip
resolve.OpenPage("fusion")
item = timeline.GetItemListInTrack("video", 1)[0]
fusion_comp = item.GetFusionCompByIndex(1)

text_node = fusion_comp.AddTool("TextPlus", -32768, -32768)
text_node.StyledText = "Episode 1"
text_node.Font = "Arial"
text_node.Size = 0.08
text_node.Center = {"x": 0.5, "y": 0.9}
```

**Timeline import/export:**
```python
mediaPool.ImportTimelineFromFile("/path/to/edit.edl", {
    "timelineName": "Imported Edit",
    "importSourceClips": True,
    "sourceClipsPath": "/path/to/media/",
})
timeline.Export("/path/to/export/timeline.fcpxml", resolve.EXPORT_FCPXML)
# Formats: EXPORT_EDL, EXPORT_AAF, EXPORT_DRT, EXPORT_FCPXML
```

## Examples

### Example 1: Batch render all projects in a database folder as ProRes 422 HQ
**User prompt:** "Write a Python script that loops through every project in the current Resolve database folder, renders each timeline as ProRes 422 HQ to /mnt/renders/<project>/<timeline>/, and prints a summary when done."

The agent will write a script that calls `GetProjectListInCurrentFolder()`, iterates through each project with `LoadProject()`, loops over timelines with `GetTimelineByIndex()`, applies render settings with `LoadRenderPreset("ProRes 422 HQ")` and a target directory based on project and timeline names, adds render jobs, calls `StartRendering()`, polls `IsRenderingInProgress()` in a loop, and prints completion stats.

### Example 2: Apply a LUT and color grade to all clips on the first video track
**User prompt:** "I have a FilmLook.cube LUT at /home/editor/luts/FilmLook.cube. Write a Resolve script that applies this LUT to node 1 of every clip on video track 1, then bumps saturation to 1.15 and adds a slight warm offset."

The agent will create a Python script that switches to the Color page with `resolve.OpenPage("color")`, gets all items from video track 1, applies the LUT via `item.SetLUT(1, "/home/editor/luts/FilmLook.cube")`, then calls `item.SetCDL()` with saturation set to 1.15 and a warm offset of `[0.01, 0.005, 0.0]` on each clip.

## Guidelines

- DaVinci Resolve must be running for the scripting API to work; scripts connect to the active instance and cannot launch Resolve headlessly
- Always call `pm.SaveProject()` after making changes to avoid losing work if Resolve or the script crashes
- The Resolve scripting module path varies by OS; set `sys.path` correctly or use the `RESOLVE_SCRIPT_API` environment variable
- Use `project.GetRenderJobStatus()` in a polling loop with `time.sleep()` to monitor renders rather than blocking indefinitely
- Fusion scripting coordinates use normalized values (0.0 to 1.0) for position, not pixel values, so `Center = {"x": 0.5, "y": 0.9}` means horizontally centered and near the bottom
