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
compatibility: 'DaVinci Resolve (Studio for scripts run from outside the app) with Python 3.6+ 64-bit or Lua 5.1. API reference dated July 2026.'
metadata:
  author: terminal-skills
  version: 1.1.0
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

Resolve must be running. Scripts run from the Workspace > Scripts menu or the Console need no setup. For a script launched from a terminal, enable it in Resolve under Preferences > System > General > "External scripting using" (Local), and set these variables (values from Blackmagic's README):

```bash
# Linux (use /home/resolve instead of /opt/resolve on some ISO installs)
export RESOLVE_SCRIPT_API="/opt/resolve/Developer/Scripting"
export RESOLVE_SCRIPT_LIB="/opt/resolve/libs/Fusion/fusionscript.so"
export PYTHONPATH="$PYTHONPATH:$RESOLVE_SCRIPT_API/Modules/"
# macOS: API=/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting
#        LIB=/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so
# Windows: API=%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting
#          LIB=C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll
```

```python
import DaVinciResolveScript as dvr

resolve = dvr.scriptapp("Resolve")
pm = resolve.GetProjectManager()
project = pm.GetCurrentProject()
mediaPool = project.GetMediaPool()
timeline = project.GetCurrentTimeline()
```

User scripts placed in `~/.local/share/DaVinciResolve/Fusion/Scripts/Utility` (Linux; the macOS and Windows equivalents are in the README) appear under Workspace > Scripts. `scriptapp` returns `None` when Resolve is not running or external scripting is off. Studio-only calls (some AI features) return False on the free edition.

### Step 2: Project & Media Pool

```python
# Project management
pm = resolve.GetProjectManager()
pm.CreateProject("New Project")      # returns None if the name already exists
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
    "/mnt/footage/harbour/scene01_take01.mov",
    "/mnt/footage/harbour/scene01_take02.mov",
])

# Set clip metadata (ImportMedia returns a list of MediaPoolItems)
clip = clips[0]
clip.SetClipProperty("Comments", "Best take")
clip.SetClipColor("Green")
```

### Step 3: Timeline Operations

```python
# Create and populate timelines
timeline = mediaPool.CreateEmptyTimeline("Assembly Edit v1")   # becomes the current timeline
mediaPool.AppendToTimeline([clips[0], clips[1]])
# or in one call: mediaPool.CreateTimelineFromClips("Assembly Edit v1", clips)

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
timeline.AddMarker(1000, "Blue", "Review Point", "Check color here", 1, "reviewTag")   # frameId, color, name, note, duration, customData
markers = timeline.GetMarkers()
```

### Step 4: Color Grading Automation

`SetLUT` belongs to the node graph, not the clip, and `SetCDL` takes strings. Node indexes are 1-based.

```python
resolve.OpenPage("color")
items = timeline.GetItemListInTrack("video", 1)

for item in items:
    graph = item.GetNodeGraph()
    graph.SetLUT(1, "/mnt/luts/FilmLook.cube")
    item.SetCDL({
        "NodeIndex": "1",
        "Slope": "1.1 1.0 0.95",
        "Offset": "0.0 0.0 0.02",
        "Power": "1.0 1.0 1.05",
        "Saturation": "1.1",
    })

# Copy the current grade of one clip onto the others
source = items[0]
source.CopyGrades(items[1:])
```

`graph.ApplyGradeFromDRX(path, gradeMode)` applies an exported still (`gradeMode` 0 = no keyframes). There is no `ApplyGradeFromTimelineClip`.

### Step 5: Render Queue & Batch Export

Load a preset first, then override settings, then queue. `AddRenderJob()` returns a job id string.

```python
project.LoadRenderPreset("YouTube - 2160p")      # names come from project.GetRenderPresetList()
project.SetRenderSettings({
    "SelectAllFrames": True,
    "TargetDir": "/mnt/renders/harbour",
    "CustomName": "harbour_v1",
    "ExportVideo": True,
    "ExportAudio": True,
})
job_id = project.AddRenderJob()

# Batch: one job per timeline
job_ids = []
for i in range(1, project.GetTimelineCount() + 1):
    tl = project.GetTimelineByIndex(i)
    project.SetCurrentTimeline(tl)
    project.SetRenderSettings({"TargetDir": f"/mnt/renders/{tl.GetName()}", "CustomName": tl.GetName()})
    job_ids.append(project.AddRenderJob())

project.StartRendering(job_ids)        # or StartRendering() for the whole queue

import time
while project.IsRenderingInProgress():
    for jid in job_ids:
        st = project.GetRenderJobStatus(jid)
        print(jid, st.get("JobStatus"), st.get("CompletionPercentage"))
    time.sleep(5)
```

Other keys: `MarkIn`/`MarkOut`, `FormatWidth`, `FormatHeight`, `FrameRate`, `VideoQuality`, `AudioCodec`, `ColorSpaceTag`. Codec and container: `project.GetRenderFormats()`, `GetRenderCodecs(fmt)`, `SetCurrentRenderFormatAndCodec(fmt, codec)`. `project.RenderWithQuickExport(preset, {"TargetDir": ..., "CustomName": ...})` runs a Quick Export preset on the current timeline.

### Step 6: Fusion Scripting & Integration

```python
# Add Fusion text overlay to a clip
resolve.OpenPage("fusion")
item = timeline.GetItemListInTrack("video", 1)[0]
fusion_comp = item.GetFusionCompByIndex(1) if item.GetFusionCompCount() else item.AddFusionComp()

text_node = fusion_comp.AddTool("TextPlus", -32768, -32768)
text_node.StyledText = "Episode 1"
text_node.Font = "Arial"
text_node.Size = 0.08
text_node.Center = {"x": 0.5, "y": 0.9}
```

**Timeline import/export:**
```python
mediaPool.ImportTimelineFromFile("/mnt/edits/harbour_v3.edl", {
    "timelineName": "Imported Edit",
    "importSourceClips": True,
    "sourceClipsPath": "/mnt/footage/harbour/",
})
timeline.Export("/mnt/edits/harbour_v3.fcpxml", resolve.EXPORT_FCPXML_1_10)
timeline.Export("/mnt/edits/harbour_v3.edl", resolve.EXPORT_EDL, resolve.EXPORT_CDL)   # EDL and AAF need a subtype
# Types: EXPORT_AAF, EXPORT_DRT, EXPORT_EDL, EXPORT_FCP_7_XML, EXPORT_FCPXML_1_8/1_9/1_10, EXPORT_OTIO, EXPORT_ALE, EXPORT_TEXT_CSV
```

## Examples

### Example 1: Batch render all projects in a database folder as ProRes 422 HQ
**User prompt:** "Write a Python script that loops through every project in the current Resolve database folder, renders each timeline as ProRes 422 HQ to /mnt/renders/harbour-doc/assembly-v1/ (project then timeline name), and prints a summary when done."

The agent will write a script that calls `GetProjectListInCurrentFolder()`, iterates through each project with `LoadProject()`, loops over timelines with `GetTimelineByIndex()`, applies `LoadRenderPreset(...)` (or `SetCurrentRenderFormatAndCodec` with a codec from `GetRenderCodecs("mov")`) and `SetRenderSettings` and a target directory based on project and timeline names, adds render jobs, collects the ids returned by `AddRenderJob()`, calls `StartRendering(job_ids)`, polls `IsRenderingInProgress()` in a loop, and prints completion stats.

### Example 2: Apply a LUT and color grade to all clips on the first video track
**User prompt:** "I have a FilmLook.cube LUT at /home/editor/luts/FilmLook.cube. Write a Resolve script that applies this LUT to node 1 of every clip on video track 1, then bumps saturation to 1.15 and adds a slight warm offset."

The agent will create a Python script that switches to the Color page with `resolve.OpenPage("color")`, gets all items from video track 1, applies the LUT via `item.GetNodeGraph().SetLUT(1, "/home/editor/luts/FilmLook.cube")`, then calls `item.SetCDL()` with `"Saturation": "1.15"` and `"Offset": "0.01 0.005 0.0"` (string values) on each clip.

## Guidelines

- DaVinci Resolve must be running; scripts connect to the active instance and cannot launch Resolve headlessly. For scripts started outside the app, external scripting must be set to Local in Preferences, and `RESOLVE_SCRIPT_API`/`RESOLVE_SCRIPT_LIB` set (Step 1). Treat "Network" as a security risk
- Call `pm.SaveProject()` (a ProjectManager method) after making changes to avoid losing work if Resolve or the script crashes
- Setting values are strings: `project.SetSetting("timelineFrameRate", "24")`, and CDL values are space-separated strings. Check every returned Bool; most calls return `False` or `None` instead of raising
- Use `project.GetRenderJobStatus()` in a polling loop with `time.sleep()` to monitor renders rather than blocking indefinitely
- Fusion scripting coordinates use normalized values (0.0 to 1.0) for position, not pixel values, so `Center = {"x": 0.5, "y": 0.9}` means horizontally centered and near the bottom
