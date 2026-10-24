---
name: comfyui
description: >-
  ComfyUI is a node-based interface and HTTP server for running Stable
  Diffusion and other diffusion models as graph workflows. Use when a user asks
  to install ComfyUI, generate images from a script through the ComfyUI API,
  queue a workflow JSON, add ControlNet or LoRA nodes, install custom nodes
  with ComfyUI-Manager, or poll for results and download the images.
license: Apache-2.0
compatibility: "Python 3.12 or 3.13 (3.14 works with some custom-node issues), PyTorch built for your GPU (CUDA, ROCm, Intel XPU) or --cpu; Linux, Windows, macOS"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/Comfy-Org/ComfyUI
  tags:
    - comfyui
    - stable-diffusion
    - image-generation
    - workflows
    - custom-nodes
---

# ComfyUI

## Overview

ComfyUI (github.com/Comfy-Org/ComfyUI, formerly comfyanonymous/ComfyUI) runs diffusion pipelines as graphs of nodes. The same graph can be built in the browser UI or submitted as JSON to its HTTP API. The server listens on `127.0.0.1:8188` by default and has no authentication, so keep it local or put an authenticating proxy in front of it.

The API format is a dict keyed by node id: each node has a `class_type` and `inputs`, where an input is either a literal or a link such as `["4", 1]` (output 1 of node 4). In the UI, export it with "Save (API Format)".

## Instructions

### Step 1: Install

Quickest: comfy-cli.

```bash
pip install comfy-cli
comfy install
comfy launch
```

Manual (Linux/Windows), as in the project README:

```bash
git clone https://github.com/Comfy-Org/ComfyUI.git
cd ComfyUI
python -m venv venv && source venv/bin/activate
pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu130   # NVIDIA
pip install -r requirements.txt
python main.py            # http://127.0.0.1:8188
```

The README recommends a cu130 or newer PyTorch build for NVIDIA 20-series and newer; AMD (ROCm), Intel (XPU) and Apple Silicon have their own commands in the README. With no GPU, `python main.py --cpu` works (slow). Windows users can instead download the portable build from the releases page.

### Step 2: Put models where nodes look for them

Checkpoints go in `models/checkpoints/`, VAEs in `models/vae/`, LoRAs in `models/loras/`, ControlNets in `models/controlnet/`, upscalers in `models/upscale_models/`. To share a model folder with another UI, copy `extra_model_paths.yaml.example` to `extra_model_paths.yaml` and edit the paths.

```bash
wget -P models/checkpoints/ \
  "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"
```

The SDXL base file is about 6.9 GB. A node's dropdown only lists files present at server start or refresh.

### Step 3: Queue a workflow and collect the result

Verified against ComfyUI 0.42.0: `POST /prompt` returns a `prompt_id`, `GET /history/{prompt_id}` stays empty until the run finishes, and `GET /view` serves the files.

```python
# txt2img.py
import time, uuid, requests

BASE = "http://127.0.0.1:8188"

workflow = {
    "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sd_xl_base_1.0.safetensors"}},
    "5": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": "mountain lake at golden hour, photorealistic", "clip": ["4", 1]}},
    "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "blurry, low quality, distorted", "clip": ["4", 1]}},
    "3": {"class_type": "KSampler", "inputs": {
        "seed": 42, "steps": 25, "cfg": 7.5, "sampler_name": "euler_ancestral", "scheduler": "normal",
        "denoise": 1.0, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
    "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
    "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "lake", "images": ["8", 0]}},
}

r = requests.post(f"{BASE}/prompt", json={"prompt": workflow, "client_id": str(uuid.uuid4())})
r.raise_for_status()                 # a bad graph returns HTTP 400 with node_errors
prompt_id = r.json()["prompt_id"]

while True:                          # poll; the websocket at /ws pushes progress if you need it live
    entry = requests.get(f"{BASE}/history/{prompt_id}").json().get(prompt_id)
    if entry:
        break
    time.sleep(1)

for node_id, out in entry["outputs"].items():
    for img in out.get("images", []):
        data = requests.get(f"{BASE}/view", params={
            "filename": img["filename"], "subfolder": img["subfolder"], "type": img["type"]})
        open(img["filename"], "wb").write(data.content)
        print("saved", img["filename"])
```

The same seed and graph give the same image; change `seed` for a new one. `GET /queue` shows running and pending jobs and `GET /object_info/<ClassName>` lists a node's inputs and the valid values for dropdowns.

### Step 4: ControlNet

Use a ControlNet trained for the same model family as the checkpoint (the SD 1.5 canny file below needs an SD 1.5 checkpoint, not SDXL). Core ComfyUI has a `Canny` node (thresholds 0.01 to 0.99), so no custom node is needed for edge maps. `ControlNetApply` is deprecated; use `ControlNetApplyAdvanced`, which takes and returns both conditionings.

```python
controlnet_nodes = {
    "10": {"class_type": "ControlNetLoader", "inputs": {"control_net_name": "control_v11p_sd15_canny.pth"}},
    "11": {"class_type": "LoadImage", "inputs": {"image": "sketch.png"}},   # file must be in the input folder
    "12": {"class_type": "Canny", "inputs": {"image": ["11", 0], "low_threshold": 0.4, "high_threshold": 0.8}},
    "13": {"class_type": "ControlNetApplyAdvanced", "inputs": {
        "positive": ["6", 0], "negative": ["7", 0], "control_net": ["10", 0], "image": ["12", 0],
        "strength": 0.8, "start_percent": 0.0, "end_percent": 1.0}},
}
# In KSampler use "positive": ["13", 0] and "negative": ["13", 1]
```

Upload the input image with `POST /upload/image` (multipart field `image`) or copy it into `input/`.

### Step 5: Custom nodes

The manager is now built into ComfyUI behind a flag. Install its dependencies and start with it enabled:

```bash
pip install -r manager_requirements.txt
python main.py --enable-manager
```

Custom nodes are Python code that runs with your user's permissions. Install only packs you have looked at, and prefer well-known ones (for example ComfyUI-Impact-Pack, rgthree-comfy).

## Examples

### Example 1: Generate five variations from a script

Request: "Render the lake prompt five times with different seeds and save the PNGs."

Wrap Step 3 in `for seed in range(100, 105):`, set `workflow["3"]["inputs"]["seed"] = seed` before each POST, and use `filename_prefix` `f"lake_{seed}"`. Result: five files such as `lake_100_00001_.png` in `output/` and in the working directory.

### Example 2: Find out why a prompt was rejected

Request: "My POST /prompt returns 400."

```console
$ curl -s -X POST http://127.0.0.1:8188/prompt -H 'Content-Type: application/json' -d @bad.json | python -m json.tool | head
{
    "error": {
        "type": "prompt_outputs_failed_validation",
        "details": "Return type mismatch between linked nodes: images, received_type(MODEL) mismatch input_type(IMAGE)"
    },
    "node_errors": { "9": { "errors": [ ... ] } }
}
```

`node_errors` names the node id and input. A `value_not_in_list` error for `ckpt_name` means the file is not in `models/checkpoints/`; check `GET /object_info/CheckpointLoaderSimple`.

## Guidelines

- Do not use `--listen` (all interfaces) on an untrusted network: the API can run arbitrary graphs and read and write files in its folders.
- Model and workflow compatibility is the usual failure: match checkpoint, VAE, LoRA and ControlNet to one model family (SD 1.5, SDXL, Flux, and so on).
- The API format differs from the UI's saved workflow JSON; export the API format for scripts.
- Large outputs and models fill disks quickly; point `--output-directory` and `extra_model_paths.yaml` at a big volume.
- Keep workflows in version control; node ids in your script must match the links in the JSON.
