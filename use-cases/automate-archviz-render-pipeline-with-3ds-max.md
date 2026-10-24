---
title: Automate an Archviz Render Pipeline with 3ds Max
slug: automate-archviz-render-pipeline-with-3ds-max
description: "Automate architectural visualization batch rendering in 3ds Max — scene setup with MAXScript, camera generation, V-Ray/Corona render settings, batch rendering across multiple views, and post-processing compositing."
skills: [3dsmax-scripting, 3dsmax-rendering]
category: design
tags: [3dsmax, archviz, rendering, vray, corona, maxscript, automation]
---

# Automate an Archviz Render Pipeline with 3ds Max

## The Problem

An architectural visualization studio produces 15-20 interior and exterior renders per project. Each project follows the same ritual: a 3D artist manually sets up 8-12 camera angles, tweaks V-Ray render settings for each view (interior shots need different light bounces than exterior), hits render, waits, moves to the next camera, adjusts settings again, renders again. A single project ties up a workstation for 2-3 days, and the artist babysits the process — checking if a render finished, starting the next one, adjusting exposure on night shots.

The post-production step adds another day: every render goes through Photoshop for color correction, lens effects, chromatic aberration, vignette, and sharpening. The same adjustments applied to every image, manually, one at a time.

For a studio handling 4-5 projects per month, this means 8-15 days of artist time spent on mechanical, repetitive work — setting cameras to known positions, typing the same render settings, and applying identical Photoshop adjustments. The actual creative decisions (composition, lighting mood, material choices) take 2-3 days per project. The automation gap is 3-4x the creative work.

## The Solution

Use the **3dsmax-scripting** skill to build the cameras from a config file with a pymxs script, and the **3dsmax-rendering** skill to queue them in Batch Render, add the denoiser and Light Mix elements, and run the whole thing without a person at the keyboard. A short Python script outside 3ds Max then tone-maps the EXRs into client JPEGs.

The pipeline does not try to script every V-Ray setting. Quality (image sampler, noise threshold, GI engines) is saved once per project in the scene or in a Render Setup preset; the script only changes what really differs between views: camera, exposure, resolution and output file. Property names of the V-Ray renderer depend on the installed version, so list them with `showProperties renderers.current "*noise*"` before scripting any of them.

## Step-by-Step Walkthrough

### Step 1: Define the project configuration

```text
I do archviz in 3ds Max with V-Ray. Every project has 8-12 camera views.
Build a pipeline that reads camera positions and exposure from a JSON file,
creates the cameras, queues one batch render per camera, and then tone-maps
the EXRs into JPEGs.
```

The config holds every view, so it can be reused on similar projects and kept in version control. Positions are in scene units (this example assumes the scene is set up in meters):

```json
{
  "project": "Lakeview Residence",
  "outputDir": "D:/Projects/Lakeview/renders",
  "resolution": { "width": 4000, "height": 2250 },
  "views": [
    {
      "name": "Cam_LivingRoom_01",
      "position": [4.2, -3.1, 1.5],
      "target": [-2.0, 5.0, 1.2],
      "fov": 75,
      "iso": 400,
      "fNumber": 2.8,
      "whiteBalanceKelvin": 6500
    },
    {
      "name": "Cam_Kitchen_Detail",
      "position": [1.8, 2.3, 1.1],
      "target": [1.8, 4.5, 0.9],
      "fov": 50,
      "iso": 200,
      "fNumber": 4.0,
      "whiteBalanceKelvin": 5500
    },
    {
      "name": "Cam_Exterior_Dusk",
      "position": [25.0, -15.0, 5.5],
      "target": [0.0, 0.0, 3.0],
      "fov": 35,
      "iso": 800,
      "fNumber": 5.6,
      "whiteBalanceKelvin": 4500
    }
  ],
  "postProcessing": {
    "contrast": 1.1,
    "saturation": 1.05,
    "sharpen": 0.3,
    "vignette": 0.15
  }
}
```

### Step 2: Create the cameras, queue the batch and render

pymxs reads the JSON with Python's `json` module, so no MAXScript JSON parser is needed. The script creates a 3ds Max Physical Camera per view (the scripting skill's camera example uses the same properties), adds one enabled Batch Render view per camera with its own size and EXR path, and starts the render.

```python
"""build_and_queue.py - run inside 3ds Max (Scripting > Run Script) or via 3dsmaxbatch."""
import json
import sys
from pathlib import Path

from pymxs import runtime as rt

CONFIG = Path("D:/Projects/Lakeview/project-config.json")
config = json.loads(CONFIG.read_text(encoding="utf-8"))
out_dir = Path(config["outputDir"])
out_dir.mkdir(parents=True, exist_ok=True)

rt.renderSceneDialog.close()  # changes made while Render Setup is open do not stick


def make_camera(view: dict):
    px, py, pz = (float(c) for c in view["position"])
    tx, ty, tz = (float(c) for c in view["target"])
    cam = rt.Physical_Camera(
        name=view["name"],
        pos=rt.Point3(px, py, pz),
        target=rt.TargetObject(pos=rt.Point3(tx, ty, tz)),
    )
    cam.specify_fov = True
    cam.fov = view["fov"]
    cam.f_number = view["fNumber"]
    cam.exposure_gain_type = 0  # 0 = manual ISO
    cam.iso = view["iso"]
    cam.white_balance_type = 1  # use the Kelvin value
    cam.white_balance_kelvin = view["whiteBalanceKelvin"]
    return cam


for i in range(rt.batchRenderMgr.numViews, 0, -1):  # start from an empty queue
    rt.batchRenderMgr.DeleteView(i)

width, height = config["resolution"]["width"], config["resolution"]["height"]
for view in config["views"]:
    cam = make_camera(view)
    batch_view = rt.batchRenderMgr.CreateView(cam)
    batch_view.name = view["name"]
    batch_view.overridePreset = True
    batch_view.width = width
    batch_view.height = height
    batch_view.outputFilename = str(out_dir / f"{view['name']}.exr").replace("/", "\\")
    batch_view.enabled = True

print(f"{rt.batchRenderMgr.numViews} views queued in {out_dir}")
rt.batchRenderMgr.netRender = False  # True sends the views to Backburner
rt.batchRenderMgr.Render()
```

### Step 3: Add the denoiser and Light Mix elements once

Render elements belong to the scene, so add them once rather than per view. V-Ray writes its elements only to the V-Ray raw image file or "Separate render channels" while the V-Ray frame buffer is on, so set the raw file output in the scene too (rendering skill, steps 3 and 4):

```maxscript
re = maxOps.GetCurRenderElementMgr()
re.RemoveAllRenderElements()
for cls in #(VRayDenoiser, VRayLightMix, VRayZDepth) do
    re.AddRenderElement (cls elementname:(cls as string))
re.SetElementsActive true

vr = renderers.current
vr.output_saveRawFile = true          -- multichannel EXR holding every element
showProperties vr "*noise*"           -- find the noise threshold property for your V-Ray version
```

Set the noise threshold per scene type in the Render Setup dialog (the rendering skill's table: about 0.005 for a final still, 0.05 for a preview) and save the scene. Halving the threshold roughly doubles the render time, so do the lighting tests at the high value.

### Step 4: Render unattended

Run the script with `3dsmaxbatch.exe`, which runs a script without the UI against a scene file, writes the Listener output to a log and exits with 0 on success (scripting skill, File I/O). Run steps 2 and 3 in the same scene: add the render elements first, then queue and render.

```bat
set MAX="C:\Program Files\Autodesk\3ds Max 2027"
%MAX%\3dsmaxbatch.exe D:\tools\build_and_queue.py -sceneFile D:\Projects\Lakeview\lakeview.max -listenerLog D:\logs\queue.log
```

On a render farm, or when you want one process per camera, use `3dsmaxcmd.exe` (documented in the rendering skill, step 7): `-o:` sets the output file, `-w:`/`-h:` the size, and `-batchRender` renders every enabled view of the Batch Render dialog. Run `3dsmaxcmd.exe -?` for the switches of your 3ds Max version before scripting it.

### Step 5: Post-process the EXRs

The script reads each EXR with OpenImageIO (`pip install OpenImageIO numpy pillow`, in a normal Python 3 outside 3ds Max), applies the ACES filmic curve, converts to sRGB, then contrast, saturation, unsharp mask and a vignette, and writes a 95% JPEG. It reads the first three channels (the beauty RGB), which is where V-Ray puts the image in a multichannel EXR.

```python
"""post_process.py - tone-map and grade the EXR renders listed in the project config."""
import json
import sys
from pathlib import Path

import numpy as np
import OpenImageIO as oiio
from PIL import Image, ImageEnhance, ImageFilter


def load_rgb(path: Path) -> np.ndarray:
    """Read the RGB channels of an EXR as a float32 array (height, width, 3)."""
    buf = oiio.ImageBuf(str(path))
    if buf.has_error:
        raise RuntimeError(buf.geterror())
    return np.asarray(buf.get_pixels(oiio.FLOAT))[:, :, :3]


def tonemap_aces(x: np.ndarray) -> np.ndarray:
    """ACES filmic approximation (Narkowicz). Input is linear, output is 0-1."""
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    return np.clip((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1)


def to_srgb(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def vignette(arr: np.ndarray, strength: float) -> np.ndarray:
    h, w = arr.shape[:2]
    y, x = np.ogrid[:h, :w]
    dist = np.hypot(x - w / 2, y - h / 2) / np.hypot(w / 2, h / 2)
    return arr * (1.0 - strength * dist**2)[:, :, np.newaxis]


def process(exr: Path, out: Path, s: dict) -> None:
    arr = to_srgb(tonemap_aces(np.maximum(load_rgb(exr), 0)))
    if s.get("vignette", 0) > 0:
        arr = vignette(arr, s["vignette"])
    img = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8))
    img = ImageEnhance.Contrast(img).enhance(s.get("contrast", 1.0))
    img = ImageEnhance.Color(img).enhance(s.get("saturation", 1.0))
    if s.get("sharpen", 0) > 0:
        img = img.filter(ImageFilter.UnsharpMask(radius=2, percent=int(s["sharpen"] * 100), threshold=3))
    img.save(out, "JPEG", quality=95, subsampling=0)
    print(f"processed {out.name} {img.size[0]}x{img.size[1]}")


def main(config_path: str) -> None:
    config = json.loads(Path(config_path).read_text(encoding="utf-8"))
    settings = config.get("postProcessing", {})
    out_dir = Path(config["outputDir"])
    final = out_dir / "final"
    final.mkdir(exist_ok=True)
    for view in config["views"]:
        exr = out_dir / f"{view['name']}.exr"
        if exr.exists():
            process(exr, final / f"{view['name']}.jpg", settings)
        else:
            print(f"skipping {view['name']}: {exr.name} not found")


if __name__ == "__main__":
    main(sys.argv[1])
```

```bat
python post_process.py D:\Projects\Lakeview\project-config.json
```

## Real-World Example

A studio lead sets up the pipeline for the Lakeview Residence project with 12 views. Writing the camera coordinates into the config takes about half an hour. Running `build_and_queue.py` creates the 12 cameras and the Batch Render queue in seconds, with the noise threshold already set in the scene for finals.

The batch starts on Friday evening on the studio's own workstation. The studio's earlier projects took 25-50 minutes per 4K view, so the queue finishes overnight; those times are this studio's, and they change with the scene, the hardware and the noise threshold. On Saturday morning `post_process.py` turns the 12 EXRs into JPEGs in the `final/` folder in a few minutes, and the artist spends Monday on composition and lighting instead of starting renders one at a time. Light Mix lets the artist change lamp brightness in the V-Ray frame buffer afterwards without rendering again.

## Related Skills

- [3dsmax-scripting](/skills/3dsmax-scripting) - scene, camera and file automation with MAXScript and pymxs
- [3dsmax-rendering](/skills/3dsmax-rendering) - Batch Render, render elements, denoising and command-line rendering
