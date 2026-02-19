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

Use the **3dsmax-scripting** skill to automate scene setup, camera placement, and render settings with MAXScript, and the **3dsmax-rendering** skill for batch rendering and post-processing. The pipeline reads a project config file, generates all cameras with correct settings, queues renders with view-appropriate V-Ray/Corona settings, and runs post-processing automatically.

## Step-by-Step Walkthrough

### Step 1: Define the Project Configuration

```text
I do archviz in 3ds Max with V-Ray. Every project has 8-12 camera views with 
specific settings. Build a MAXScript pipeline that:
1. Reads camera positions and render settings from a config file
2. Creates V-Ray Physical Cameras with correct exposure for each shot type
3. Queues batch rendering with per-camera render settings
4. Runs post-processing on all rendered images
```

The project config defines every view in the project — camera position, target, lens, and render quality. Storing this as a file means it's reusable across similar projects and version-controllable:

```json
{
  "project": "Lakeview Residence",
  "outputDir": "D:/Projects/Lakeview/renders",
  "resolution": { "width": 4000, "height": 2250 },
  "views": [
    {
      "name": "living-room-01",
      "type": "interior",
      "camera": {
        "position": [4.2, -3.1, 1.5],
        "target": [-2.0, 5.0, 1.2],
        "fov": 75,
        "whiteBalance": 6500,
        "iso": 400,
        "shutterSpeed": 60,
        "fNumber": 2.8
      },
      "render": {
        "quality": "production",
        "denoiser": true,
        "lightMixEnabled": true
      }
    },
    {
      "name": "kitchen-detail",
      "type": "interior-detail",
      "camera": {
        "position": [1.8, 2.3, 1.1],
        "target": [1.8, 4.5, 0.9],
        "fov": 50,
        "whiteBalance": 5500,
        "iso": 200,
        "shutterSpeed": 125,
        "fNumber": 4.0,
        "dofEnabled": true,
        "dofDistance": 2.2
      },
      "render": {
        "quality": "production",
        "denoiser": true
      }
    },
    {
      "name": "exterior-dusk",
      "type": "exterior-night",
      "camera": {
        "position": [25.0, -15.0, 5.5],
        "target": [0.0, 0.0, 3.0],
        "fov": 35,
        "whiteBalance": 4500,
        "iso": 800,
        "shutterSpeed": 15,
        "fNumber": 5.6
      },
      "render": {
        "quality": "production",
        "denoiser": true,
        "lightMixEnabled": true
      }
    },
    {
      "name": "bathroom-01",
      "type": "interior",
      "camera": {
        "position": [-1.5, 6.2, 1.4],
        "target": [-1.5, 8.0, 1.0],
        "fov": 80,
        "whiteBalance": 6000,
        "iso": 400,
        "shutterSpeed": 60,
        "fNumber": 3.2
      },
      "render": {
        "quality": "production",
        "denoiser": true
      }
    }
  ],
  "postProcessing": {
    "enabled": true,
    "contrast": 1.1,
    "saturation": 1.05,
    "sharpen": 0.3,
    "vignette": 0.15,
    "chromaticAberration": 0.5,
    "bloomIntensity": 0.02
  }
}
```

### Step 2: Generate Cameras from Config

The MAXScript reads the config and creates V-Ray Physical Cameras with correct exposure settings for each view. Interior shots get higher ISO and wider apertures for natural light handling; exterior night shots get long exposure and warm white balance:

```maxscript
-- create_cameras.ms — Generate V-Ray Physical Cameras from project config

fn loadProjectConfig configPath = (
    local f = openFile configPath mode:"r"
    local jsonStr = ""
    while not eof f do jsonStr += readLine f + "\n"
    close f

    -- Parse JSON (3ds Max 2022+ has built-in JSON support)
    local config = dotNetObject "Newtonsoft.Json.Linq.JObject"
    config = (dotNetClass "Newtonsoft.Json.Linq.JObject").Parse jsonStr
    config
)

fn createArchvizCamera viewData index = (
    local cam = viewData.camera
    local pos = point3 cam.position[1] cam.position[2] cam.position[3]
    local tgt = point3 cam.target[1] cam.target[2] cam.target[3]

    -- Create V-Ray Physical Camera
    local vrayCam = VRayPhysicalCamera()
    vrayCam.name = viewData.name
    vrayCam.pos = pos
    vrayCam.targeted = true
    vrayCam.target.pos = tgt

    -- Lens settings
    vrayCam.specify_fov = true
    vrayCam.fov = cam.fov
    vrayCam.white_balance = color (cam.whiteBalance / 100.0 * 255) (cam.whiteBalance / 100.0 * 255) 255

    -- Exposure triangle
    vrayCam.ISO = cam.iso
    vrayCam.shutter_speed = cam.shutterSpeed
    vrayCam.f_number = cam.fNumber

    -- Depth of field (for detail shots)
    if cam.dofEnabled != undefined and cam.dofEnabled then (
        vrayCam.use_dof = true
        vrayCam.focus_distance = cam.dofDistance
        vrayCam.blades_enable = true
        vrayCam.blades_num = 9          -- 9-blade aperture for smooth bokeh
        vrayCam.blades_rotation = 15.0  -- Slight rotation for natural look
    ) else (
        vrayCam.use_dof = false
    )

    -- Vertical correction (keep verticals straight in archviz)
    vrayCam.auto_vertical_tilt_correction = 1.0

    format "Created camera: % at [%, %, %]\n" viewData.name pos.x pos.y pos.z
    vrayCam
)

fn setupAllCameras configPath = (
    local config = loadProjectConfig configPath
    local views = config.views
    local cameras = #()

    for i = 1 to views.Count do (
        local cam = createArchvizCamera views[i] i
        append cameras cam
    )

    format "Created % cameras\n" cameras.count
    cameras
)

-- Run: setupAllCameras "D:/Projects/Lakeview/project-config.json"
```

### Step 3: Configure Render Settings Per View Type

Different shot types need different render settings. Interior shots need more light bounces for accurate global illumination; exterior night shots need higher quality for clean dark areas; detail shots need more AA samples for sharp DOF edges:

```maxscript
-- render_settings.ms — Configure V-Ray render settings per view type

fn setRenderSettings viewData outputDir resolution = (
    local viewType = viewData.type
    local quality = viewData.render.quality

    -- Base resolution
    renderWidth = resolution.width
    renderHeight = resolution.height

    -- Output path
    local outputPath = outputDir + "/" + viewData.name + ".exr"
    rendOutputFilename = outputPath

    -- V-Ray render settings based on view type
    local vr = renderers.current

    -- Common settings
    vr.output_saveRawFile = true           -- Save raw V-Ray image
    vr.imageSampler_type = 3              -- Progressive sampler
    vr.twoLevel_baseSubdivs = 1
    vr.twoLevel_fineSubdivs = 4

    case viewType of (
        "interior": (
            -- Interior: more light bounces for GI, moderate quality
            vr.gi_on = true
            vr.gi_primary_type = 0        -- Brute Force primary
            vr.gi_secondary_type = 3      -- Light Cache secondary
            vr.options_maxDepth = 8        -- 8 bounces for interior GI
            vr.lightcache_subdivs = 1500
            vr.imageSampler_maxSubdivs = 24

            if quality == "production" then (
                vr.progressiveMaxTime = 0     -- No time limit
                vr.progressiveNoiseThreshold = 0.005  -- Very low noise
            )
        )
        "interior-detail": (
            -- Detail shots: highest quality AA for DOF, more bounces
            vr.gi_on = true
            vr.gi_primary_type = 0
            vr.gi_secondary_type = 3
            vr.options_maxDepth = 8
            vr.lightcache_subdivs = 2000
            vr.imageSampler_maxSubdivs = 32  -- Higher for clean DOF

            if quality == "production" then (
                vr.progressiveNoiseThreshold = 0.003  -- Lowest noise
            )
        )
        "exterior-day": (
            -- Exterior day: fewer bounces needed, sun + sky dominant
            vr.gi_on = true
            vr.gi_primary_type = 0
            vr.gi_secondary_type = 3
            vr.options_maxDepth = 5        -- 5 bounces sufficient for exterior
            vr.lightcache_subdivs = 1000
            vr.imageSampler_maxSubdivs = 20

            if quality == "production" then (
                vr.progressiveNoiseThreshold = 0.005
            )
        )
        "exterior-night": (
            -- Night: highest quality needed for clean shadows and dark areas
            vr.gi_on = true
            vr.gi_primary_type = 0
            vr.gi_secondary_type = 3
            vr.options_maxDepth = 12       -- More bounces for artificial light
            vr.lightcache_subdivs = 2000
            vr.imageSampler_maxSubdivs = 32

            if quality == "production" then (
                vr.progressiveNoiseThreshold = 0.003
            )
        )
    )

    -- V-Ray Denoiser (saves hours of render time)
    if viewData.render.denoiser then (
        -- Add V-Ray Denoiser render element
        local denoiser = VRayDenoiser()
        denoiser.enabled = true
        denoiser.mode = 1     -- Post-render denoising
        denoiser.strength = 1.0
        denoiser.radius = 10
    )

    -- Light Mix (adjust lighting in post without re-rendering)
    if viewData.render.lightMixEnabled != undefined and viewData.render.lightMixEnabled then (
        local lightMix = VRayLightMix()
        lightMix.enabled = true
    )

    format "Configured render settings for: % (type: %, quality: %)\n" viewData.name viewType quality
    outputPath
)
```

### Step 4: Batch Render All Views

The batch renderer iterates through all views, sets the active camera, configures render settings, and renders. Between renders it saves the scene state so a crash doesn't lose all progress:

```maxscript
-- batch_render.ms — Queue and execute all renders

fn batchRender configPath = (
    local config = loadProjectConfig configPath
    local outputDir = config.outputDir
    local resolution = config.resolution
    local views = config.views

    makeDir outputDir all:true  -- Create output directory

    local startTime = timeStamp()
    local results = #()

    for i = 1 to views.Count do (
        local view = views[i]
        format "\n=== Rendering view %/% : % ===\n" i views.Count view.name

        -- Find the camera by name
        local cam = getNodeByName view.name
        if cam == undefined then (
            format "WARNING: Camera '%' not found, skipping\n" view.name
            continue
        )

        -- Set as active viewport camera
        viewport.setCamera cam

        -- Configure render settings for this view type
        local outputPath = setRenderSettings view outputDir resolution

        -- Render
        local renderStart = timeStamp()
        render camera:cam outputFile:outputPath vfb:false

        local renderTime = (timeStamp() - renderStart) / 1000.0
        format "Completed: % in %.1f seconds\n" view.name renderTime

        append results #(view.name, outputPath, renderTime)

        -- Save progress after each render
        local progressFile = outputDir + "/_render_progress.txt"
        local pf = createFile progressFile
        for r in results do (
            format "% | % | %.1fs\n" r[1] r[2] r[3] to:pf
        )
        close pf
    )

    local totalTime = (timeStamp() - startTime) / 1000.0 / 60.0
    format "\n=== Batch render complete: % views in %.1f minutes ===\n" results.count totalTime

    results
)

-- Run from command line (headless batch rendering):
-- 3dsmax -silent -mxs "batchRender \"D:/Projects/Lakeview/project-config.json\""
```

### Step 5: Post-Processing Pipeline

After rendering, a Python script applies consistent post-processing to all images — color correction, lens effects, sharpening, and export to client-ready JPEGs:

```python
"""post_process.py — Batch post-processing for archviz renders."""
import json, sys
from pathlib import Path
import numpy as np

# OpenImageIO for EXR reading, Pillow for JPEG export
import OpenImageIO as oiio
from PIL import Image, ImageFilter, ImageEnhance

def load_exr(path: str) -> np.ndarray:
    """Load a 32-bit EXR file as a float numpy array.

    Args:
        path: Path to the EXR file.

    Returns:
        Float32 numpy array with shape (height, width, channels).
    """
    inp = oiio.ImageInput.open(path)
    spec = inp.spec()
    pixels = inp.read_image(oiio.FLOAT)
    inp.close()
    return pixels.reshape(spec.height, spec.width, spec.nchannels)

def tonemap_aces(hdr: np.ndarray) -> np.ndarray:
    """Apply ACES filmic tone mapping (industry standard for archviz).

    Converts HDR linear values to displayable 0-1 range with
    natural highlight rolloff and rich shadows.
    """
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    x = hdr
    mapped = (x * (a * x + b)) / (x * (c * x + d) + e)
    return np.clip(mapped, 0, 1)

def apply_vignette(img: Image.Image, strength: float = 0.15) -> Image.Image:
    """Apply a subtle vignette (darker edges) common in architectural photography.

    Args:
        img: Input PIL image.
        strength: 0.0 = no vignette, 1.0 = heavy vignette.
    """
    w, h = img.size
    # Create radial gradient mask
    Y, X = np.ogrid[:h, :w]
    cx, cy = w / 2, h / 2
    dist = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
    max_dist = np.sqrt(cx ** 2 + cy ** 2)
    mask = 1.0 - strength * (dist / max_dist) ** 2

    arr = np.array(img).astype(float)
    arr *= mask[:, :, np.newaxis]
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))

def process_render(exr_path: str, output_path: str, settings: dict):
    """Apply full post-processing chain to a single render.

    Args:
        exr_path: Path to the rendered EXR file.
        output_path: Path for the output JPEG.
        settings: Post-processing settings from project config.
    """
    # Load HDR image
    hdr = load_exr(exr_path)

    # Tone mapping (HDR → SDR)
    sdr = tonemap_aces(hdr[:, :, :3])  # Use first 3 channels (RGB)

    # Convert to 8-bit PIL image
    img = Image.fromarray((sdr * 255).astype(np.uint8))

    # Contrast adjustment
    if settings.get("contrast", 1.0) != 1.0:
        img = ImageEnhance.Contrast(img).enhance(settings["contrast"])

    # Saturation boost (subtle — archviz prefers natural colors)
    if settings.get("saturation", 1.0) != 1.0:
        img = ImageEnhance.Color(img).enhance(settings["saturation"])

    # Sharpening (unsharp mask)
    if settings.get("sharpen", 0) > 0:
        img = img.filter(ImageFilter.UnsharpMask(
            radius=2,
            percent=int(settings["sharpen"] * 100),
            threshold=3,
        ))

    # Vignette
    if settings.get("vignette", 0) > 0:
        img = apply_vignette(img, settings["vignette"])

    # Save high-quality JPEG for client delivery
    img.save(output_path, "JPEG", quality=95, subsampling=0)
    print(f"  Processed: {Path(output_path).name} ({img.size[0]}x{img.size[1]})")

def batch_post_process(config_path: str):
    """Process all renders defined in the project config.

    Args:
        config_path: Path to the project JSON config file.
    """
    with open(config_path) as f:
        config = json.load(f)

    output_dir = Path(config["outputDir"])
    pp_dir = output_dir / "final"
    pp_dir.mkdir(exist_ok=True)

    settings = config.get("postProcessing", {})
    if not settings.get("enabled", False):
        print("Post-processing disabled in config")
        return

    for view in config["views"]:
        exr_path = output_dir / f"{view['name']}.exr"
        if not exr_path.exists():
            print(f"  Skipping {view['name']} — EXR not found")
            continue

        output_path = pp_dir / f"{view['name']}.jpg"
        process_render(str(exr_path), str(output_path), settings)

    print(f"\nAll renders processed → {pp_dir}")

if __name__ == "__main__":
    batch_post_process(sys.argv[1])
```

```bash
python post_process.py "D:/Projects/Lakeview/project-config.json"
```

## Real-World Example

A studio lead sets up the pipeline for the Lakeview Residence project — 10 interior and 2 exterior views. Defining the camera positions in the config file takes 30 minutes (copying coordinates from the 3ds Max viewport). Running `setupAllCameras` creates all 12 V-Ray Physical Cameras in 2 seconds, each with correct exposure for its shot type.

The batch render starts at 6 PM on Friday. Each interior view renders in 25-40 minutes (4K, V-Ray denoiser cuts noise cleanup time in half), exterior night shots take 50 minutes each (more light bounces needed). The entire batch finishes at 2 AM Saturday — 8 hours of unattended rendering while the artist sleeps.

Saturday morning, the post-processing script runs in 3 minutes: ACES tone mapping, subtle contrast boost, sharpening, and vignette on all 12 images. The final JPEGs land in the `final/` folder, ready for client review.

What used to take 2-3 days of babysitting renders and a full day of Photoshop work now takes 30 minutes of setup and 8 hours of unattended machine time. The artist spends Monday on creative work — adjusting compositions, experimenting with lighting moods — instead of clicking "render" twelve times.
