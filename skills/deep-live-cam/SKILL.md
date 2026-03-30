---
name: deep-live-cam
description: >-
  Real-time face swap and video deepfake using a single source image. Use when: building
  face-swap applications, real-time video effects, virtual try-on features, AI video
  effects pipelines.
license: AGPL-3.0
compatibility: "Python 3.10+, CUDA GPU recommended"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-media
  tags:
    - deepfake
    - face-swap
    - real-time
    - video
    - ai-video
    - computer-vision
  use-cases:
    - "Build a real-time face swap application for video calls"
    - "Create a virtual try-on feature for e-commerce (hairstyles, glasses, etc.)"
    - "Build video effects pipelines with AI face manipulation"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# Deep-Live-Cam — Real-Time Face Swap

Real-time face swap and video deepfake using a single source image. Supports webcam, video files, and streaming with GPU acceleration.

**Source:** [hacksider/Deep-Live-Cam](https://github.com/hacksider/Deep-Live-Cam)

## How It Works

The pipeline consists of four stages:

1. **Face Detection** — Detect and locate faces in each frame using InsightFace (RetinaFace detector)
2. **Face Embedding** — Extract a 512-dimensional face embedding from the source image
3. **Face Swap** — Replace the target face with the source face using inswapper model, preserving pose and expression
4. **Post-Processing** — Blend edges, color-correct, and optionally enhance with GFPGAN/CodeFormer for quality

```
Source Image → Face Embedding ─┐
                                ├→ Swap Engine → Post-Processing → Output Frame
Video Frame → Face Detection ──┘
```

## Requirements

### Hardware

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU | None (CPU mode) | NVIDIA RTX 3060+ (CUDA) |
| VRAM | — | 6GB+ |
| RAM | 8GB | 16GB+ |
| CPU | Any modern x86_64 | 8+ cores for CPU mode |

### Software

- Python 3.10+
- FFmpeg
- Visual Studio 2022 Build Tools (Windows)
- CUDA Toolkit 11.8+ (for GPU acceleration)

## Installation

### 1. Clone and install

```bash
git clone https://github.com/hacksider/Deep-Live-Cam.git
cd Deep-Live-Cam
pip install -r requirements.txt
```

### 2. Download models

Download these models and place them in the `models/` directory:

- **inswapper_128_fp16.onnx** — Face swap model ([download](https://huggingface.co/hacksider/deep-live-cam/tree/main))
- **GFPGANv1.4.pth** — Face enhancement model (optional, for quality)

```bash
mkdir -p models
# Download inswapper model
wget -O models/inswapper_128_fp16.onnx "https://huggingface.co/hacksider/deep-live-cam/resolve/main/inswapper_128_fp16.onnx"
```

### 3. GPU acceleration (optional but recommended)

```bash
# For NVIDIA CUDA
pip install onnxruntime-gpu

# For AMD ROCm
pip install onnxruntime-rocm

# For Apple Silicon (CoreML)
pip install onnxruntime-coreml
```

## Usage

### GUI Mode (webcam, real-time)

```bash
python run.py
```

1. Select a source face image
2. Choose your webcam or video source
3. Click "Live" for real-time face swap

### CLI Mode — Process a video file

```bash
python run.py \
  --source path/to/source_face.jpg \
  --target path/to/target_video.mp4 \
  --output path/to/output.mp4 \
  --execution-provider cuda
```

### CLI Mode — Process a single image

```bash
python run.py \
  --source path/to/source_face.jpg \
  --target path/to/target_image.jpg \
  --output path/to/output.jpg
```

### Execution providers

```bash
# CPU (default, slowest)
python run.py --execution-provider cpu

# NVIDIA GPU
python run.py --execution-provider cuda

# Apple Silicon
python run.py --execution-provider coreml

# AMD GPU
python run.py --execution-provider rocm
```

## Key Features

### Mouth Mask

Retains the original mouth for accurate lip movement — useful for video calls and live performances:

```bash
python run.py --source face.jpg --target video.mp4 --mouth-mask
```

### Face Mapping

Use different source faces on multiple people in the same frame:

```bash
python run.py --face-mapping \
  --source face1.jpg:person1 \
  --source face2.jpg:person2 \
  --target video.mp4
```

### Quality Enhancement

Enable GFPGAN or CodeFormer for higher quality output:

```bash
python run.py --source face.jpg --target video.mp4 --enhancer gfpgan
```

## Python Integration Example

```python
"""Programmatic face swap using Deep-Live-Cam components."""

import cv2
import insightface
from insightface.app import FaceAnalysis

# Initialize face analysis
app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider"])
app.prepare(ctx_id=0, det_size=(640, 640))

# Load the face swapper model
swapper = insightface.model_zoo.get_model(
    "models/inswapper_128_fp16.onnx",
    providers=["CUDAExecutionProvider"]
)

# Load source and target images
source_img = cv2.imread("source_face.jpg")
target_img = cv2.imread("target_frame.jpg")

# Detect faces
source_faces = app.get(source_img)
target_faces = app.get(target_img)

if source_faces and target_faces:
    # Swap the first detected face
    result = swapper.get(target_img, target_faces[0], source_faces[0], paste_back=True)
    cv2.imwrite("output.jpg", result)
    print("Face swap complete!")
```

## Real-Time vs Batch Processing

| Mode | Use Case | FPS (RTX 3060) | Quality |
|------|----------|-----------------|---------|
| Real-time (webcam) | Video calls, live streams | 25-30 FPS | Good |
| Batch (video file) | Post-production, content creation | N/A (offline) | Best (with enhancer) |
| Single image | Thumbnails, profile pictures | Instant | Best |

## Ethical Considerations

⚠️ **Important:** This technology can be misused. Follow these guidelines:

1. **Consent** — Always obtain consent from the person whose face you're using
2. **Disclosure** — Label all outputs as AI-generated/deepfake when sharing publicly
3. **Legal compliance** — Many jurisdictions have laws against non-consensual deepfakes
4. **Content restrictions** — The software includes built-in NSFW content detection and blocking
5. **No impersonation** — Do not use for fraud, identity theft, or deceptive impersonation
6. **Responsible use** — Intended for creative content, entertainment, art, and legitimate business use (virtual try-on, character animation)

## Limitations

- **Lighting sensitivity** — Works best with even, front-facing lighting
- **Extreme angles** — Face detection degrades at extreme head rotations (>60°)
- **Multiple faces** — Processing multiple faces simultaneously reduces FPS
- **Glasses/occlusion** — Heavy occlusion (masks, large sunglasses) can cause artifacts
- **Resolution** — Real-time mode trades resolution for speed; use batch mode for high-res output

## References

- [Deep-Live-Cam GitHub](https://github.com/hacksider/Deep-Live-Cam)
- [InsightFace Documentation](https://insightface.ai/)
- [GFPGAN (Face Enhancement)](https://github.com/TencentARC/GFPGAN)
- [ONNX Runtime](https://onnxruntime.ai/)
