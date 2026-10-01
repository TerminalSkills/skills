---
name: 3dsmax-rendering
description: >-
  Scripts and configures production rendering in Autodesk 3ds Max with the
  V-Ray and Corona renderers: output size and files, render elements,
  denoising, light mix, batch and command-line rendering, and network
  rendering. Use when a user asks to set up a production render, render several
  cameras in one batch, render from the command line or on a render farm, add
  render passes for compositing, or cut render time for archviz and product
  shots.
license: Apache-2.0
compatibility: 'Windows. 3ds Max with V-Ray 7 (supports 3ds Max 2021-2027) or Corona 14; scripts run in the MAXScript Listener or through pymxs'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: design
  tags:
    - 3dsmax
    - vray
    - corona
    - rendering
    - archviz
---

# 3ds Max Rendering

## Overview

Everything in the 3ds Max Render Setup dialog can be scripted. Settings that belong to 3ds Max itself are MAXScript globals (`renderWidth`, `rendOutputFilename`) and interfaces (`batchRenderMgr`, `RenderElementMgr`); settings that belong to the renderer are properties of `renderers.current`. Chaos documents only a handful of V-Ray and Corona property names and the full list depends on the installed version, so the dependable workflow is: assign the renderer, list its properties with `showProperties`, then set them. This skill covers that workflow, render elements, denoising, light mix, batch rendering, `3dsmaxcmd`, V-Ray Standalone and network rendering.

## Instructions

### 1. Assign the renderer and inspect it

```maxscript
for c in RendererClass.classes do print c     -- every installed renderer class
renderers.current = VRay()                    -- fresh V-Ray with default settings; VRayRT() is V-Ray GPU
vr = renderers.current
vrayVersion()                                 -- #(version, build)
showProperties vr                             -- every scriptable setting with its type
showProperties vr "*noise*"                   -- filter by name pattern
```

With Corona assigned (Render Setup > Common > Assign Renderer):

```maxscript
cr = renderers.current
show cr                                       -- Corona settings and current values
showInterface CoronaRenderer.CoronaFp         -- Corona functions
CoronaRenderer.CoronaFp.getVersionString()
```

### 2. Output size, frame range and file

These are 3ds Max globals. Close the Render Setup dialog first — changes made while it is open do not stick.

```maxscript
renderSceneDialog.close()

fn setResolution preset = (
    case preset of (
        "draft":    (renderWidth = 1920; renderHeight = 1080)
        "4k":       (renderWidth = 3840; renderHeight = 2160)
        "print-a3": (renderWidth = 4961; renderHeight = 3508)   -- A3 at 300 DPI
        "print-a2": (renderWidth = 7016; renderHeight = 4961)   -- A2 at 300 DPI
        "panorama": (renderWidth = 8000; renderHeight = 4000)   -- 2:1 spherical
    )
    format "Resolution %x%\n" renderWidth renderHeight
)
setResolution "4k"

rendTimeType = 1          -- 1 single frame, 2 active segment, 3 rendStart..rendEnd, 4 rendPickupFrames
rendSaveFile = true
rendOutputFilename = @"D:\renders\lobby\lobby_cam01.exr"
max quick render          -- same as the Render button; uses the dialog settings
```

The `render()` function is different: it ignores the dialog's output file and takes everything as parameters.

```maxscript
render camera:$Cam_Lobby_01 outputwidth:1920 outputheight:1080 \
    outputfile:@"D:\renders\lobby\preview.png" vfb:false
```

### 3. V-Ray quality settings

V-Ray 7 defaults already suit most stills: Progressive image sampler (min 1, max 100 subdivs), render time 0 (run until the noise threshold is reached), GI on with Brute force primary and Light cache secondary. The main quality control is the **Noise threshold**:

| Stage | Image sampler | Noise threshold | Notes |
|---|---|---|---|
| Lighting test | Progressive | 0.1 | 640x480, override material in Global switches |
| Preview | Progressive | 0.05 | highest value the denoiser handles well |
| Default | Progressive | 0.01 | |
| Final still | Progressive or Bucket | 0.005 | no visible noise without a denoiser |
| Animation, DR | Bucket | 0.005 | Light cache preset Animation (Subdivs 3000, Retrace 8) |

Halving the noise threshold roughly doubles render time.

```maxscript
vr = renderers.current
vr.gi_on = true
vr.output_saveRawFile = true                                  -- V-Ray raw image file: multichannel .exr or .vrimg
vr.output_rawFileName = @"D:\renders\lobby\lobby_cam01.exr"
showProperties vr "imageSampler*"                             -- then set what you found, for example:
vr.imageSampler_type                                          -- integer; switch the type in the UI once and read it back
```

### 4. Render elements

Elements are added through the 3ds Max Render Element Manager. V-Ray elements are classes named as in the Render Elements list.

```maxscript
re = maxOps.GetCurRenderElementMgr()
re.RemoveAllRenderElements()
passes = #(VRayReflection, VRayRefraction, VRayRawTotalLighting, VRayRenderID,
           VRayZDepth, VRayCryptomatte, VRayLightMix, VRayDenoiser)
for cls in passes do re.AddRenderElement (cls elementname:(cls as string))
re.SetElementsActive true
format "% render elements\n" (re.NumRenderElements())

zdepth = re.GetRenderElement 4        -- index is 0-based
showProperties zdepth                 -- Zdepth min / max, clamp, invert
```

While the V-Ray frame buffer is enabled, V-Ray saves render elements only through *V-Ray raw image file* (step 3) or *Separate render channels* in Render Setup > V-Ray > Frame buffer. To drive element output from the 3ds Max Render Output field or the elements' own output paths instead, turn the V-Ray frame buffer off.

Corona elements follow the same pattern with their own names: `CShading_LightMix`, `CShading_LightSelect`, `CGeometry_ZDepth`, `CMasking_Cryptomatte`, `CESSENTIAL_Reflect`.

### 5. Denoising and light mix

**VRayDenoiser** (render element) — engines: Default V-Ray denoiser, NVIDIA AI denoiser (needs an NVIDIA GPU), Intel Open Image Denoise. Presets for the default engine: Mild (strength 0.5, radius 5), Default (1, 10), Strong (2, 15). Mode *Only generate render elements* skips denoising at render time so a sequence can be denoised afterwards with frame blending:

```bat
vdenoise -inputFile="D:\renders\walkthrough\frame_????.exr"
```

`vdenoise.exe` is in `C:\ProgramData\Autodesk\ApplicationPlugins\VRay3dsMax<year>\bin` (3ds Max 2022 and later); run it from there or by full path.

**VRayLightMix** (render element) — after rendering, set the VFB layer source to LightMix and change each light's intensity and color; *To Scene* writes the result back to the lights. Start with white lights at generous intensity: raising a dim light in the mix amplifies its noise.

**Corona** — denoising modes in Render Setup > Scene: None, Only firefly removal, NVIDIA GPU AI, Intel CPU/GPU AI, Corona High Quality, Gather data for later; *Amount* can be changed after the render. LightMix needs one `CShading_LightMix` and one `CShading_LightSelect` per controllable light (the *Setup Interactive LightMix* button creates them) and is scriptable after the first render:

```maxscript
fp = CoronaRenderer.CoronaFp
for i = 0 to fp.numLightSelectChannels() - 1 do
    format "% %\n" i (fp.getLightSelectName i)
fp.setLightSelectIntensity 0 2 1.8      -- LightMix 0, LightSelect 2, intensity 1.8
fp.setLightSelectEnabled 0 3 false
fp.getStatistic 7                       -- estimated noise in percent (0 = not available yet)
fp.saveAllElements @"D:\renders\lobby\lobby_cam01.exr"
```

Corona stops on whichever limit is hit first — Pass limit, Time limit or Noise level limit (0 disables a limit). Its GI uses a primary solver plus a secondary solver: Path tracing, or UHD Cache, which is faster and slightly less accurate.

### 6. Batch render several cameras

```maxscript
fn queueCameras outDir w h = (
    for i = batchRenderMgr.numViews to 1 by -1 do batchRenderMgr.DeleteView i
    local cams = for c in cameras where superClassOf c == camera collect c   -- skips camera targets
    for cam in cams do (
        local v = batchRenderMgr.CreateView cam
        v.name = cam.name
        v.overridePreset = true
        v.width = w
        v.height = h
        v.outputFilename = outDir + "\\" + cam.name + ".exr"
        v.enabled = true
    )
    cams.count
)
queueCameras @"D:\renders\lobby" 4000 2250
batchRenderMgr.netRender = false      -- true sends the views to Backburner
batchRenderMgr.Render()
```

### 7. Command-line rendering

`3dsmaxcmd.exe` sits in the 3ds Max install folder. Separators may be `:`, `=` or a space; the scene file comes last.

```bat
cd /d "C:\Program Files\Autodesk\3ds Max 2026"

:: One camera, one frame
3dsmaxcmd -o:"D:\renders\lobby\cam01.exr" -cam:"Cam_Lobby_01" -w:4000 -h:2250 -v:5 "D:\projects\lobby\lobby_v12.max"

:: Animation range
3dsmaxcmd -o:"D:\renders\walkthrough\frame_.exr" -cam:"Cam_Walkthrough" -start:0 -end:300 -w:1920 -h:1080 "D:\projects\lobby\lobby_v12.max"

:: Every enabled view of the Batch Render dialog
3dsmaxcmd -batchRender "D:\projects\lobby\lobby_v12.max"

:: Submit to a Backburner manager instead of rendering locally
3dsmaxcmd -submit:farm-manager01 -jobName:"lobby_walkthrough" -frames:0-300 "D:\projects\lobby\lobby_v12.max"
```

V-Ray Standalone (`vray.exe`, in the same `bin` folder as `vdenoise.exe`, or the *V-Ray Standalone command prompt* in the Start menu) renders an exported scene without 3ds Max:

```maxscript
vrayExportVRScene @"D:\renders\lobby\lobby_cam01.vrscene"    -- exports the current viewport
```

```bat
vray -sceneFile="D:\renders\lobby\lobby_cam01.vrscene" -imgFile="D:\renders\lobby\lobby_cam01.exr" -imgWidth=4000 -imgHeight=2250 -display=0
```

### 8. Network rendering and proxies

- **Backburner** distributes whole frames: `-submit` above, or `batchRenderMgr.netRender = true`.
- **V-Ray distributed rendering** splits one frame across machines. Each render server runs *V-Ray DR Spawner for 3ds Max* (TCP port 20208 with DR2, 20204 with the older DR1; a V-Ray Standalone server listens on 20207) and needs a Render Node license. `vrayEditDRSettings()` opens the server list. Use the Bucket sampler. DR2 is the default since V-Ray 7 update 3.
- **Corona distributed rendering** needs the Corona DR Server application on each node; `CoronaRenderer.CoronaFp.loadDrIpFile @"D:\farm\render-nodes.txt"` loads one IP per line. For animations use Backburner so each machine renders its own frame.
- **V-Ray proxies** keep heavy geometry out of the scene file:

```maxscript
proxies = vrayMeshExport meshFile:@"D:\assets\proxies\olive_tree.vrmesh" nodes:$Olive_Tree_01 autoCreateProxies:true
```

### pymxs equivalents

```python
from pymxs import runtime as rt

rt.renderSceneDialog.close()
rt.renderWidth, rt.renderHeight = 3840, 2160
vr = rt.renderers.current
rt.showProperties(vr)
rt.render(outputFile=r"D:\renders\lobby\preview.png", vfb=False)
```

## Examples

### Example 1: Queue every camera for an overnight 4K batch

**User prompt:** "Our lobby scene has six cameras. Set up a batch that renders each one at 4000x2250 to EXR with reflection, Z-depth and Cryptomatte passes, and start it."

```maxscript
renderSceneDialog.close()
re = maxOps.GetCurRenderElementMgr()
re.RemoveAllRenderElements()
for cls in #(VRayReflection, VRayZDepth, VRayCryptomatte, VRayDenoiser) do
    re.AddRenderElement (cls elementname:(cls as string))
re.SetElementsActive true

n = queueCameras @"D:\renders\lobby" 4000 2250      -- function from step 6
format "% views queued, % render elements\n" n (re.NumRenderElements())
batchRenderMgr.Render()
```

Result: the Listener prints `6 views queued, 4 render elements`, the Batch Render dialog lists one enabled view per camera, and `D:\renders\lobby` fills with `Cam_Lobby_01.exr` … `Cam_Lobby_06.exr` as the views finish. To get the passes on disk, turn on *V-Ray raw image file* or *Separate render channels* in the scene first (step 4) — with the V-Ray frame buffer on, V-Ray writes its elements only through those two outputs.

### Example 2: Render a walkthrough from the command line and denoise it

**User prompt:** "Render frames 0–300 of Cam_Walkthrough at 1080p on the render box without opening 3ds Max, then denoise the sequence."

Prepare the scene once and save it: a VRayDenoiser element with Mode *Only generate render elements*, the Bucket image sampler, and the V-Ray raw image file so every frame is a multichannel EXR that contains the denoiser channels.

```maxscript
vr = renderers.current
vr.output_saveRawFile = true
vr.output_rawFileName = @"D:\renders\walkthrough\frame_.exr"
```

```bat
cd /d "C:\Program Files\Autodesk\3ds Max 2026"
3dsmaxcmd -cam:"Cam_Walkthrough" -start:0 -end:300 -w:1920 -h:1080 -v:5 "D:\projects\lobby\lobby_v12.max"
"C:\ProgramData\Autodesk\ApplicationPlugins\VRay3dsMax2026\bin\vdenoise.exe" -inputFile="D:\renders\walkthrough\frame_????.exr"
```

Result: `3dsmaxcmd` prints a timestamped line per completed frame (verbosity 5) for frames 0–300, and V-Ray writes one raw EXR per frame. Check the file names in the folder first: give `vdenoise` one `?` per digit of the frame number, and add the dot (`frame_.????.exr`) if *Dot-delimited frame number* is on in the raw file dialog. It reads each frame together with its neighbours and writes a new denoised image per frame, without the flicker that per-frame denoising produces.

## Guidelines

- **Inspect before you set.** Do not guess renderer property names or the integer behind a drop-down. Use `showProperties vr "pattern*"`, or change the option in the UI once and read the property back.
- **Close Render Setup before scripting it** (`renderSceneDialog.close()`), or the dialog overwrites your values.
- **`render()` is not the Render button.** It does not use the Render Setup output file or frame range; use `max quick render`, Batch Render or `3dsmaxcmd` for production output.
- **`cameras` includes camera targets.** Filter with `superClassOf c == camera`.
- **Render to EXR.** A multichannel EXR (V-Ray raw image file) keeps every element in one file, and Cryptomatte mattes are stored that way; convert to PNG or JPEG after compositing.
- **Draft first.** Check composition and lighting at low resolution and noise threshold 0.05–0.1 before a production render.
- **Denoise animations with `vdenoise`.** The in-render denoiser and the NVIDIA AI engine work per frame and flicker.
- **`vrayExportVRScene` takes render settings from V-Ray GPU**; if V-Ray GPU is not the production renderer the `.vrscene` gets default settings.
- **Licenses.** 3ds Max, V-Ray and Corona are commercial; every V-Ray DR server needs a Render Node license, and a Corona DR master uses one interface and one render node license.
- **Not for other renderers.** Arnold, the Scanline renderer and Redshift have their own settings; only the 3ds Max parts (steps 2, 4, 6, 7) apply to them.
