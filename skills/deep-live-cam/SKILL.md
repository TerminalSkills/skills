---
name: deep-live-cam
description: >-
  Real-time face swap and video deepfake using a single source image. Use when: building
  face-swap applications, real-time video effects, virtual try-on features, AI video
  effects pipelines.
license: AGPL-3.0
compatibility: "Python 3.11-3.14, ffmpeg, GPU recommended (CUDA, CoreML, DirectML or OpenVINO)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: "https://github.com/hacksider/Deep-Live-Cam"
  category: data-ai
  tags:
    - deepfake
    - face-swap
    - real-time
    - video
    - computer-vision
---

# Deep-Live-Cam — Real-Time Face Swap

## Overview

Real-time face swap and video deepfake using a single source image. Supports webcam, video files, and streaming with GPU acceleration. The pipeline detects faces, extracts embeddings, swaps faces using the inswapper model, and post-processes with GFPGAN/CodeFormer for quality.

**Source:** [hacksider/Deep-Live-Cam](https://github.com/hacksider/Deep-Live-Cam)

## Instructions

### 1. Install and configure

The README targets Python 3.14 (3.11-3.14 supported; 3.10 no longer works because onnxruntime dropped it), plus git and ffmpeg. Use a virtual environment.

```bash
git clone --depth 1 https://github.com/hacksider/Deep-Live-Cam.git
cd Deep-Live-Cam
python3.14 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Download the two models into `models/` (from the project's Hugging Face repository, `hacksider/deep-live-cam`): `inswapper_128_fp16.onnx` and `gfpgan-1024.onnx`. Compare each file's SHA256 with the value shown on its Hugging Face file page (`sha256sum models/*.onnx`) before first use. Other models are in the same repository; the first run also fetches roughly 300 MB of supporting models.

GPU acceleration is chosen with `--execution-provider`. `requirements.txt` already pins `onnxruntime-gpu` on Linux/Windows and the CoreML-capable `onnxruntime` on Apple Silicon:

- NVIDIA: install CUDA Toolkit 12.8 and cuDNN 8.9.7 for CUDA 12, then `pip uninstall onnxruntime onnxruntime-gpu` and `pip install onnxruntime-gpu==1.26.0`; run with `--execution-provider cuda`.
- Apple Silicon: no extra install; `--execution-provider coreml` (remove the old `onnxruntime-silicon` fork if present, it shadows the real package).
- Windows DirectML: `pip uninstall onnxruntime onnxruntime-gpu`, `pip install onnxruntime-directml==1.21.0`, then `--execution-provider dml`.
- Intel: uninstall `onnxruntime` and `onnxruntime-gpu`, then install `onnxruntime-openvino==1.21.0` (newer than 1.21.0 must be paired with a matching `openvino` release; see the README table), then `--execution-provider openvino`.

### 2. Run face swap

**GUI mode (image, video and live webcam):**

```bash
python run.py
```

Pick a source face and a target, press Start for image/video, or Live for the webcam (the preview takes 10-30 seconds to appear). To stream, capture the preview window with OBS.

**CLI mode** starts whenever `-s/--source` is given. The README marks the CLI as unmaintained, so check `python run.py --help` on your checkout:

```bash
python run.py -s speaker_headshot.jpg -t conference_talk.mp4 -o outputs/anonymized_talk.mp4 \
  --keep-fps --execution-provider cuda --frame-processor face_swapper face_enhancer
```

### 3. Key features and flags

- `--mouth-mask` keeps the original mouth for accurate lip movement.
- `--map-faces` assigns different source faces to different people; `--many-faces` swaps every face with one source.
- `--frame-processor face_swapper face_enhancer` adds the GFPGAN enhancer (`face_enhancer_gpen256` and `face_enhancer_gpen512` are alternatives).
- `--keep-fps`, `--keep-audio`, `--video-encoder {libx264,libx265,libvpx-vp9}`, `--video-quality 0-51` (lower is better), `--det-size {160,320,640}` for detection speed, `--nsfw-filter`.

## Examples

### Example 1: Swap a face in a conference recording

```bash
python run.py -s speaker_headshot.jpg -t conference_talk.mp4 -o outputs/anonymized_talk.mp4 \
  --keep-fps --execution-provider cuda --frame-processor face_swapper face_enhancer
```

The program extracts frames, swaps and enhances each one on the GPU, and re-encodes the video with the original audio. Expect a long run for a 45-minute file; the output is `outputs/anonymized_talk.mp4`.

### Example 2: Programmatic face swap with Python

```python
import cv2
import insightface
from insightface.app import FaceAnalysis

app = FaceAnalysis(name="buffalo_l", providers=["CUDAExecutionProvider"])
app.prepare(ctx_id=0, det_size=(640, 640))

swapper = insightface.model_zoo.get_model(
    "models/inswapper_128_fp16.onnx",
    providers=["CUDAExecutionProvider"]
)

source_img = cv2.imread("actor_headshot.jpg")
target_img = cv2.imread("movie_scene_frame.jpg")

source_faces = app.get(source_img)
target_faces = app.get(target_img)

if source_faces and target_faces:
    result = swapper.get(target_img, target_faces[0], source_faces[0], paste_back=True)
    cv2.imwrite("swapped_scene.jpg", result)
```

### Example 3: Real-time webcam with mouth mask

```bash
python run.py --mouth-mask --execution-provider cuda
```

The GUI opens; choose a source face image, pick the camera, enable mouth mask in the UI if it is not already on, and press Live. Frame rate depends on the GPU.

## Guidelines

- **Always obtain consent** from the person whose face you're using
- **Label all outputs** as AI-generated/deepfake when sharing publicly
- **Legal compliance** — Many jurisdictions have laws against non-consensual deepfakes
- **Lighting matters** — Works best with even, front-facing lighting; degrades at extreme head rotations (>60°)
- **GPU recommended** — CPU mode works but is very slow
- **Model licence** — the README notes InsightFace models are for non-commercial research use; check this before any commercial product
- **Built-in content filter** — the project refuses nudity and graphic media, and may add watermarks if legally required
- **Beware lookalike sites** — the README says deeplivecam.net is the only official site; the pre-built "Ultimate" builds are paid
- **Verify results** — Heavy occlusion (masks, large sunglasses) can cause artifacts
- **Use batch mode for quality** — Real-time trades resolution for speed; use offline processing for high-res output

## References

- [Deep-Live-Cam GitHub](https://github.com/hacksider/Deep-Live-Cam)
- [InsightFace Documentation](https://insightface.ai/)
- [GFPGAN (Face Enhancement)](https://github.com/TencentARC/GFPGAN)
