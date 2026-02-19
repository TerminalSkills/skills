---
name: 3dsmax-rendering
category: design
version: 1.0.0
description: >-
  Configure and optimize rendering in 3ds Max — V-Ray and Corona render settings,
  render elements, light mix, batch rendering, network rendering, denoising,
  and post-production workflows. Use when tasks involve setting up production
  renders, optimizing render times, batch rendering multiple views, or
  configuring render farms for archviz and product visualization.
author: terminal-skills
tags: [3dsmax, vray, corona, rendering, archviz, optimization]
---

# 3ds Max Rendering

Configure production renders with V-Ray and Corona. Optimize quality vs. render time for architectural visualization, product shots, and animation.

## V-Ray Settings

### Global Illumination

```maxscript
-- V-Ray GI for interior archviz (production quality)
local vr = renderers.current  -- Assumes V-Ray is active renderer

-- Primary: Brute Force (most accurate for interiors)
vr.gi_on = true
vr.gi_primary_type = 0       -- 0=Brute Force, 2=Irradiance Map, 3=Light Cache
vr.gi_primary_subdivs = 8

-- Secondary: Light Cache (fast, good for secondary bounces)
vr.gi_secondary_type = 3     -- Light Cache
vr.lightcache_subdivs = 1500 -- Higher = cleaner but slower
vr.lightcache_storeDirectLight = true
vr.lightcache_showCalcPhase = false

-- Bounce depth
vr.options_maxDepth = 8       -- Interior: 6-12 bounces
                               -- Exterior: 4-6 bounces
                               -- Product: 4-8 bounces
```

### Image Sampler (Anti-Aliasing)

```maxscript
-- Progressive sampler (recommended for production)
vr.imageSampler_type = 3     -- Progressive
vr.progressiveMaxTime = 0     -- No time limit (noise threshold stops it)
vr.progressiveNoiseThreshold = 0.005  -- 0.005 = production, 0.01 = draft

-- Bucket sampler (for render farms — predictable time)
vr.imageSampler_type = 1     -- Adaptive
vr.twoLevel_baseSubdivs = 2
vr.twoLevel_fineSubdivs = 4
vr.imageSampler_maxSubdivs = 24  -- Higher for DOF/motion blur
```

### V-Ray Denoiser

The denoiser reduces noise in post, cutting render times by 30-50%:

```maxscript
-- Add V-Ray Denoiser render element
fn addDenoiser strength:1.0 = (
    local denoiser = VRayDenoiser()
    denoiser.enabled = true
    denoiser.mode = 1          -- 0=Only generate data, 1=Post-render denoise
    denoiser.preset = 2        -- 0=Mild, 1=Default, 2=Strong
    denoiser.strength = strength
    denoiser.radius = 10       -- Pixel radius for denoising
    denoiser
)

addDenoiser strength:0.8      -- 0.8 avoids over-smoothing on fine details
```

### V-Ray Light Mix

Adjust individual light intensities and colors in post — no re-rendering needed:

```maxscript
-- Enable Light Mix render element
fn addLightMix = (
    local lm = VRayLightMix()
    lm.enabled = true
    lm
)

-- After rendering, open V-Ray Frame Buffer → Light Mix tab
-- Adjust each light's intensity and color interactively
-- Save the configuration for batch application to other views
```

### Render Elements

```maxscript
-- Add essential render elements for compositing
fn addRenderElements = (
    -- Reflection pass
    local refl = VRayReflection()
    refl.enabled = true

    -- Refraction pass
    local refr = VRayRefraction()
    refr.enabled = true

    -- Raw lighting (before materials)
    local rawLight = VRayRawTotalLighting()
    rawLight.enabled = true

    -- Object/Material ID (for masking in compositing)
    local objId = VRayRenderID()
    objId.enabled = true

    -- Z-Depth (for DOF in post)
    local zDepth = VRayZDepth()
    zDepth.enabled = true
    zDepth.zdepth_min = 0.0
    zDepth.zdepth_max = 50.0    -- Adjust to scene scale (meters)

    -- Cryptomatte (advanced masking by object/material/asset)
    local crypto = VRayCryptomatte()
    crypto.enabled = true
    crypto.id_type = 0          -- 0=Node name, 1=Material name, 2=Object ID

    format "Added % render elements\n" 6
)
```

## Corona Settings

### Corona for Interior Archviz

```maxscript
-- Assumes Corona is the active renderer
local cr = renderers.current

-- Quality
cr.progressive_maxPasses = 0         -- Unlimited passes
cr.progressive_noiseLevel = 3        -- Noise level % (3% = production)
cr.progressive_timeLimit = 0         -- No time limit

-- GI
cr.gi_primarySolver = 0             -- UHD Cache (fast + accurate)
cr.gi_uhdPrecision = 16             -- Higher = more accurate, slower
cr.gi_secondarySolver = 2            -- Path Tracing
cr.gi_maxBounces = 25                -- Corona handles bounces differently — 25 is standard

-- Denoising
cr.denoise_mode = 1                  -- 0=None, 1=After render, 2=During render
cr.denoise_amount = 0.65             -- 0-1, 0.65 preserves detail

-- Light Mix (Corona has built-in Light Mix)
cr.lightMix_enabled = true
```

## Resolution Presets

```maxscript
-- Common archviz resolutions
fn setResolution preset = (
    case preset of (
        "draft":       (renderWidth = 1920; renderHeight = 1080)
        "hd":          (renderWidth = 2560; renderHeight = 1440)
        "4k":          (renderWidth = 3840; renderHeight = 2160)
        "production":  (renderWidth = 4000; renderHeight = 2250)  -- 16:9 at 4K+
        "print-a3":    (renderWidth = 4961; renderHeight = 3508)  -- 300 DPI A3
        "print-a2":    (renderWidth = 7016; renderHeight = 4961)  -- 300 DPI A2
        "panorama":    (renderWidth = 8000; renderHeight = 4000)  -- 2:1 for VR
        "square-ig":   (renderWidth = 3000; renderHeight = 3000)  -- Instagram
    )
    format "Resolution set to %x%\n" renderWidth renderHeight
)
```

## Batch Rendering

### Built-in Batch Render

```maxscript
-- Use 3ds Max's built-in Batch Render (Rendering → Batch Render)
fn setupBatchRender cameras outputDir = (
    -- Clear existing batch entries
    batchRenderMgr.deleteAllViews()

    for cam in cameras do (
        local idx = batchRenderMgr.createView cam
        batchRenderMgr.setViewCamera idx cam
        batchRenderMgr.setViewOutputFile idx (outputDir + "/" + cam.name + ".exr")
        batchRenderMgr.setViewEnabled idx true
        -- Each view can override resolution, frame range, etc.
    )

    -- Start batch render
    batchRenderMgr.render()
)

-- Collect all cameras and render
local allCameras = for c in cameras where classOf c != Targetobject collect c
setupBatchRender allCameras "D:/output"
```

### Headless Batch (Command Line)

```bash
# Render specific camera
3dsmaxcmd.exe "D:/scene.max" -camera "Camera01" -outputFile "D:/output/cam01.exr" ^
  -width 4000 -height 2250 -v 5

# Render animation range
3dsmaxcmd.exe "D:/scene.max" -camera "WalkthroughCam" ^
  -start 0 -end 300 -outputFile "D:/output/frame_.exr" ^
  -width 1920 -height 1080

# With V-Ray standalone (faster, less memory)
vray.exe -sceneFile="D:/scene.vrscene" -imgWidth=4000 -imgHeight=2250 ^
  -imgFile="D:/output/render.exr" -display=0
```

### Network Rendering (Backburner / V-Ray DR)

```maxscript
-- V-Ray Distributed Rendering
vr = renderers.current
vr.system_distributedRender = true
vr.system_distributedRender_port = 20207

-- Add render nodes
vr.system_drhost_number = 3
vr.system_drhost_entry 1 "192.168.1.10" 20207
vr.system_drhost_entry 2 "192.168.1.11" 20207
vr.system_drhost_entry 3 "192.168.1.12" 20207
```

## Optimization Strategies

### Speed vs Quality Balance

| Setting | Draft (30s) | Preview (5min) | Production (30min+) |
|---|---|---|---|
| Noise threshold | 0.05 | 0.02 | 0.005 |
| GI subdivs | 500 | 1000 | 2000 |
| Max subdivs | 8 | 16 | 24-32 |
| Light bounces | 4 | 6 | 8-12 |
| Resolution | 1920×1080 | 2560×1440 | 4000×2250 |
| Denoiser | Strong | Medium | Light |

### Common Optimizations

```maxscript
-- 1. Use V-Ray Proxy for heavy geometry (furniture, vegetation)
fn convertToProxy obj outputPath = (
    select obj
    local proxy = VRayMeshExport()
    proxy.fileName = outputPath
    proxy.meshType = 1     -- .vrmesh format
    proxy.autoCreateProxies = true
    proxy.exportAnimation = false
    proxy
)

-- 2. Reduce light subdivs for fill lights (not visible in reflections)
for light in lights do (
    if classOf light == VRayLight and light.multiplier < 5 then (
        light.subdivs = 8  -- Low subdivs for subtle fill lights
    )
)

-- 3. Use V-Ray displacement instead of geometry detail
-- 4. Enable adaptive lights for scenes with many lights
vr.options_light_adaptiveLights = 2  -- Full adaptive
```

## Output Formats

```maxscript
-- EXR (recommended — 32-bit HDR, lossless)
rendOutputFilename = "D:/output/render.exr"

-- Multi-channel EXR (all render elements in one file)
vr.output_splitgbuffer = false       -- Single file
vr.output_saveRawFile = true

-- PNG (8-bit, for web/preview)
rendOutputFilename = "D:/output/render.png"

-- TIFF (16-bit, for print)
rendOutputFilename = "D:/output/render.tif"
```

## Guidelines

- **Always render to EXR** — 32-bit HDR preserves all lighting data for post-production. Convert to JPEG/PNG after post-processing, not from the renderer.
- **Enable denoiser for production** — it cuts render time 30-50% with minimal quality loss. Use strength 0.6-0.8 to preserve fine detail.
- **Light Mix saves days** — adjusting lighting in post is instant. Without it, every lighting tweak means a full re-render.
- **Draft renders first** — always do a low-res draft (1080p, high noise threshold) before committing to a production render. Check composition and lighting before spending GPU hours.
- **Progressive sampler for stills** — it's simpler and gives predictable quality. Use bucket sampler only for animations and render farms.
- **Proxy everything above 100K faces** — vegetation, furniture models, and decorations should be V-Ray proxies to keep viewport responsive and memory low.
- **Cryptomatte over Object ID** — Cryptomatte generates pixel-perfect masks for any object or material without needing to assign IDs manually.
- **Separate interior and exterior lighting** — interior scenes need more GI bounces (8-12) than exterior (4-6). Over-bouncing exteriors wastes render time.
