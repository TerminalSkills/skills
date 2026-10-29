---
title: "Automate a Blender Film Production Pipeline from Compositing to Final Export"
slug: automate-blender-film-production-pipeline
description: "Streamline a short film production by automating Blender compositing, video sequence editing, render distribution, and scripted scene assembly."
skills:
  - blender-compositing
  - blender-vse-pipeline
  - blender-render-automation
  - blender-scripting
category: automation
tags:
  - blender
  - vfx
  - rendering
  - film-production
  - compositing
---

# Automate a Blender Film Production Pipeline from Compositing to Final Export

## The Problem

A small animation studio producing a 12-minute short film has 47 scenes, each needing the same compositing look (color balance, bloom), assembly in the Video Sequence Editor, and a high-resolution render. Doing this by hand means an artist repeats node setup and render configuration for every scene, and every revision from the director sends the team back through the same loop.

## The Solution

Use **blender-compositing** to add the same node tree to every scene file, **blender-render-automation** and Blender's command-line flags to split frame ranges across render machines, **blender-vse-pipeline** to assemble the rendered shots from an edit list, and **blender-scripting** to run it all headless from one entry point. The scripts below were run on Blender 5.0.1; the ssh dispatch is the only part not run here.

## Step-by-Step Walkthrough

### 1. Script the compositing node tree for every scene

> Write a Blender script that opens each scene_*.blend in the current folder, adds a compositing node group with Color Balance and a Bloom glare if the scene has none yet, sets the output to multilayer EXR under //renders/<file name>/frame_, and saves the file. Use blender-compositing.

```python
import bpy, glob, os

def apply_grade(scene):
    tree = bpy.data.node_groups.new("Studio Grade", "CompositorNodeTree")
    scene.compositing_node_group = tree            # Blender 5.0+: scene.node_tree is gone
    nodes, links = tree.nodes, tree.links
    rl = nodes.new("CompositorNodeRLayers")
    cb = nodes.new("CompositorNodeColorBalance")
    cb.inputs["Type"].default_value = "Lift/Gamma/Gain"
    cb.inputs["Color Lift"].default_value = (0.95, 0.95, 1.0, 1.0)
    cb.inputs["Color Gain"].default_value = (1.1, 1.05, 1.0, 1.0)
    glare = nodes.new("CompositorNodeGlare")
    glare.inputs["Type"].default_value = "Bloom"
    glare.inputs["Threshold"].default_value = 0.8
    out = nodes.new("NodeGroupOutput")             # replaces CompositorNodeComposite
    tree.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    links.new(rl.outputs["Image"], cb.inputs["Image"])
    links.new(cb.outputs["Image"], glare.inputs["Image"])
    links.new(glare.outputs["Image"], out.inputs["Image"])

for path in sorted(glob.glob("scene_*.blend")):
    bpy.ops.wm.open_mainfile(filepath=path)
    scene = bpy.context.scene
    if scene.compositing_node_group is None:       # skip scenes that are already graded
        apply_grade(scene)
    scene.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'
    scene.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
    stem = os.path.splitext(os.path.basename(path))[0]      # scene.name is "Scene" in most files, so key on the file name
    scene.render.filepath = f"//renders/{stem}/frame_"
    bpy.ops.wm.save_mainfile()
```

Run it with `blender --background --factory-startup --python grade.py`. Keying a green-screen plate is a separate step: the Keying node needs the plate wired in, so add it per shot rather than in this generic template.

### 2. Split the render across machines

Blender renders a frame range from the command line: `-s` first frame, `-e` last frame, `-a` render the animation. Cycles options go after `--`, for example `-- --cycles-device OPTIX`. Chunks of one scene write distinct, frame-numbered files into the same output folder, so there is nothing to merge afterwards.

> Use blender-render-automation. Write a shell script that takes a scene, a frame range and a chunk size, sends each chunk to the next host in a list over ssh, and retries a failed chunk on another host up to 3 times.

```bash
#!/usr/bin/env bash
# usage: ./farm.sh scene_017.blend 1 240 60   (file first last chunk)
set -u
SCENE=$1; FIRST=$2; LAST=$3; CHUNK=$4
NODES=(render-01.local render-02.local render-03.local render-04.local)
i=0; pids=()
for ((s=FIRST; s<=LAST; s+=CHUNK)); do
  e=$((s+CHUNK-1)); (( e > LAST )) && e=$LAST
  node=${NODES[$((i % ${#NODES[@]}))]}
  (
    for attempt in 1 2 3; do
      ssh "$node" blender -b "/shared/scenes/$SCENE" -s "$s" -e "$e" -a -- --cycles-device OPTIX && exit 0
      echo "chunk $s-$e failed on $node (attempt $attempt)" >&2
      node=${NODES[$(( (i + attempt) % ${#NODES[@]} ))]}
    done
    exit 1
  ) &
  pids+=($!)
  i=$((i+1))
done
fail=0
for p in "${pids[@]}"; do wait "$p" || fail=1; done   # a plain `wait` would hide failed chunks
exit $fail
```

This assumes the scenes and the output folder sit on shared storage that every node mounts at the same path, and that `blender` is on each node's PATH. With the ssh call replaced by a local `blender -b`, the script rendered 24 frames in three chunks into one folder on Blender 5.0.1. It does not balance by scene complexity; for a heavier farm use a real queue such as Flamenco.

### 3. Assemble the edit in the Video Sequence Editor

> Use blender-vse-pipeline. Read edit_list.csv (columns shot, folder), add each EXR sequence to the timeline in that order, overlap neighbouring shots by 12 frames with a cross dissolve, put title.png first for 3 seconds, and add /audio/final_mix.wav.

```python
import bpy, csv, glob, os

FPS, FADE = 24, 12
shots = list(csv.DictReader(open("edit_list.csv")))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.sequence_editor_create()
strips = scene.sequence_editor.strips               # 5.0+: was .sequences

# 5.0 calls the strip span frame_final_*; 5.1+ renamed it (old names deprecated, removal in 6.0)
NEW_API = "left_handle" in bpy.types.Strip.bl_rna.properties
def head(s): return s.left_handle if NEW_API else s.frame_final_start
def tail(s): return s.right_handle if NEW_API else s.frame_final_end
def hold(s, frames):
    if NEW_API: s.duration = frames
    else: s.frame_final_duration = frames

def add_shot(folder, start, channel):
    files = sorted(glob.glob(os.path.join(folder, "*.exr")))
    strip = strips.new_image(name=f"{os.path.basename(folder)}_{start}", filepath=files[0],
                             channel=channel, frame_start=start)
    for f in files[1:]:
        strip.elements.append(os.path.basename(f))
    return strip

TITLE = 3 * FPS
title = strips.new_image(name="Title", filepath="/assets/title.png", channel=3, frame_start=1, fit_method='FIT')
hold(title, TITLE)

cursor, prev = TITLE + 1, None
for i, row in enumerate(shots):
    if prev:
        cursor -= FADE                               # overlap by the fade length
    cur = add_shot(row["folder"], cursor, 1 + i % 2) # alternate channels 1 and 2
    if prev:
        strips.new_effect(name=f"Dissolve_{i}", type='GAMMA_CROSS', channel=4,
                          frame_start=head(cur), length=FADE, input1=prev, input2=cur)
    cursor, prev = tail(cur), cur

strips.new_sound(name="Mix", filepath="/audio/final_mix.wav", channel=5, frame_start=1)
scene.frame_start, scene.frame_end = 1, max(tail(s) for s in scene.sequence_editor.strips_all if s.type != 'SOUND') - 1   # picture length, not the audio's

scene.render.image_settings.media_type = 'VIDEO'
scene.render.image_settings.file_format = 'FFMPEG'
scene.render.ffmpeg.format = 'MPEG4'
scene.render.ffmpeg.codec = 'H264'
scene.render.ffmpeg.audio_codec = 'AAC'
scene.render.filepath = "/renders/final/final_cut.mp4"
bpy.ops.render.render(animation=True)
```

On Blender 5.0.1 this produced an H.264/AAC file with the expected 108 frames from two 24-frame shots and a 3-second title. The `left_handle`/`duration` branch matches the current API reference but was not run here (the installed Blender is 5.0.1). `new_effect` takes `length`, `input1` and `input2` in 5.x; the old `frame_end`, `seq1` and `seq2` are gone.

### 4. Tie it together with one entry point

> Use blender-scripting. Write pipeline.py that lists scene_*.blend files, compares each file's modification time with a pipeline_state.json from the last run, regrades and re-renders only the changed scenes, then rebuilds the edit and logs every step to pipeline.log.

Keep the state file to `{path: mtime}`, call the three scripts above as subprocesses with `blender -b`, and write a line to `pipeline.log` before and after each. Re-running the VSE script is cheap, so rebuild the edit every time and re-render only what changed.

## Real-World Example

A three-person team uses this for a short film. The director asks for a warmer grade on 23 scenes. The team changes the two color values in `apply_grade`, deletes the old node group in those scenes, and starts the pipeline in the evening. The changed scenes re-render across their four machines overnight and the edit is reassembled in the morning without anyone re-doing node setups by hand.

## Tips

- Render to multilayer EXR so the passes survive. A later regrade can then be done from the files with a compositing script that reads them, without re-rendering.
- Chunk by estimated cost, not equal frame counts, when scenes differ a lot: a particle-heavy shot needs smaller chunks than a static dialogue shot.
- Test the whole chain on one short scene before pointing it at all 47.

## Related Skills

- [blender-compositing](../skills/blender-compositing/) -- node-tree scripting for Blender 5.x
- [blender-vse-pipeline](../skills/blender-vse-pipeline/) -- strips API and VSE rendering
- [blender-render-automation](../skills/blender-render-automation/) -- render settings and batch rendering
- [blender-scripting](../skills/blender-scripting/) -- headless bpy scripting
