---
name: airllm
description: >-
  AirLLM runs very large open language models on a small GPU (or a CPU) by loading the model one layer at a time from disk instead of holding it all in memory, at the price of slow generation. Use when the user wants to run a 70B or larger Hugging Face model locally with 4-12 GB of VRAM, asks how to fit a model that does not fit in GPU memory, or says "airllm", "layer-by-layer inference", "run Llama 70B on a small GPU", "offline batch answers from a big model".
license: Apache-2.0
compatibility: "Python 3.9+, pip, PyTorch 2.4+, transformers 4.49+ (below 6); an NVIDIA GPU is the intended target, CPU works for small models; fast SSD with free space of about the model size or more; Apple silicon needs mlx"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "airllm, local-llm, low-vram, inference, pytorch"
  repository: https://github.com/lyogavin/airllm
---

# AirLLM — run models bigger than your GPU, one layer at a time

## Overview

AirLLM (`pip install airllm`) is a Python library that loads a Hugging Face causal language model, splits its weights into one file per layer on disk, and during generation brings a single layer into GPU memory, runs it, frees it and moves to the next (with the next layer prefetched on a background thread). GPU memory use is therefore set by the size of one layer, not the whole model: the project reports Llama-class 70B models in about 4 GB of VRAM without quantizing, and far larger mixture-of-experts models in more. The README's figures are VRAM only.

The trade-off is speed. Every generated token has to pass through every layer, so every token streams essentially the whole model from disk to the GPU. Expect seconds to tens of seconds per token for 70B-class models on a consumer SSD (the README gives no tokens-per-second figure, so measure on your hardware before promising anything). Use it for offline, non-interactive jobs where memory is the limit and latency is not: batch classification, overnight summarisation, one-off questions to a big model. It is not a chat server.

It is an inference library you call from Python, with a Hugging Face-style `generate`. It does not expose an OpenAI-compatible server.

## Instructions

### Install and check the machine

```bash
python -m venv .venv && . .venv/bin/activate
pip install airllm            # pulls torch>=2.4, transformers, accelerate, safetensors, sentencepiece
pip install -U bitsandbytes   # only if you want compression='4bit' or '8bit'
python -c "import torch; print(torch.cuda.is_available())"
df -h ~/.cache/huggingface    # the model is downloaded AND re-saved layer by layer
```

For an NVIDIA GPU install a CUDA build of torch from pytorch.org first. On macOS only Apple silicon is supported and `mlx` must be installed; there only Llama-style and Mistral-style models run.

### Generate text

```python
from airllm import AutoModel

model = AutoModel.from_pretrained(
    "meta-llama/Llama-3.1-70B-Instruct",   # a Hugging Face repo id or a local folder
    max_seq_len=512,                        # default; longer context needs more memory per layer
)

prompts = ["Summarize the termination clause of a standard SaaS contract in two sentences."]
tokens = model.tokenizer(prompts, return_tensors="pt", return_attention_mask=False,
                         truncation=True, max_length=256, padding=False)

out = model.generate(
    tokens["input_ids"].to(model.device),
    max_new_tokens=60,
    use_cache=True,
    return_dict_in_generate=True,
)
print(model.tokenizer.decode(out.sequences[0]))
```

`AutoModel` reads the model's config and picks the right class, including special classes for ChatGLM, Qwen v1, Baichuan and InternLM; other standard decoder-only architectures use a generic streaming class. The first call is the slow one: the library downloads the checkpoint, writes one safetensors file per layer into a `splitted_model` folder (inside the Hugging Face cache by default), and only then starts generating. Later runs reuse those shards.

### Constructor options

| Argument | Meaning |
|---|---|
| `device` | Default `"cuda:0"`. Pass `"cpu"` to run on CPU (works, slower) |
| `max_seq_len` | Default `512` |
| `compression` | `"4bit"` or `"8bit"` block-wise weight compression; makes the shards smaller so disk loading is faster (the project says up to about 3x); needs `bitsandbytes`; disables prefetching |
| `layer_shards_saving_path` | Where to write the layer shards (put it on your fastest disk) |
| `delete_original` | `True` deletes the downloaded original checkpoint after splitting, roughly halving disk use |
| `hf_token` | Hugging Face token for gated repos such as the Meta Llama models |
| `profiling_mode` | `True` prints where time goes (disk load versus compute) |
| `prefetching` | On by default; overlaps loading the next layer with computing the current one |
| `dtype` | Defaults to the model's own dtype (usually bfloat16) |

### Pick a model and prepare disk

- Choose an instruction-tuned model that fits your task, and check its licence and whether the repo is gated (request access on Hugging Face, then pass `hf_token=os.environ["HF_TOKEN"]`, created at huggingface.co/settings/tokens).
- Plan disk for the original download plus the shards: for a 70B model in 16-bit that is about 140 GB for each unless you set `delete_original=True`. A full disk surfaces as `NotEnoughSpaceException` or a `MetadataIncompleteBuffer` safetensors error; free space and re-run.
- Test the pipeline on a small model of the same family (for example an 8B) before pulling a 70B one, and time one token.

### Measure speed before committing

```python
import time
t = time.time()
out = model.generate(tokens["input_ids"].to(model.device), max_new_tokens=3, use_cache=True,
                     return_dict_in_generate=True)
print(f"{(time.time() - t) / 3:.1f} s per token")
```

Divide your expected output length by that figure to get the real batch time. A rough bound is model size divided by disk read speed per token, for example 140 GB at 3 GB/s is about 47 s; compression and a fast NVMe drive improve it.

### Gated models and padding errors

Pass `hf_token=` for gated repos. If the tokenizer has no padding token, call it with `padding=False`. If you see "max() arg is an empty sequence", you loaded a Qwen or ChatGLM model with a Llama class: use `AutoModel`.

## Examples

### Example 1: Overnight classification of support tickets with a 70B model

Request: "We cannot send tickets to a hosted model and have one 8 GB GPU. Label 300 tickets as billing, bug or other, speed does not matter."

```python
import json, os
from airllm import AutoModel

model = AutoModel.from_pretrained("meta-llama/Llama-3.1-70B-Instruct",
                                  hf_token=os.environ["HF_TOKEN"],
                                  compression="4bit", delete_original=True,
                                  layer_shards_saving_path="/mnt/nvme/airllm")
labels = {}
for ticket in json.load(open("tickets.json")):
    prompt = f"Classify this ticket as billing, bug or other. Ticket: {ticket['text']}\nLabel:"
    ids = model.tokenizer([prompt], return_tensors="pt", return_attention_mask=False,
                          truncation=True, max_length=400, padding=False)["input_ids"]
    out = model.generate(ids.to(model.device), max_new_tokens=3, use_cache=True,
                         return_dict_in_generate=True)
    labels[ticket["id"]] = model.tokenizer.decode(out.sequences[0][ids.shape[1]:]).strip()
    json.dump(labels, open("labels.json", "w"))   # save after every ticket
```

The first run downloads and splits the model (hours on a slow link); afterwards each ticket takes a few tokens' worth of full-model passes, so 300 tickets run for hours, not minutes. Saving after each ticket lets the job resume.

### Example 2: Smoke-test the setup on a tiny model first

Request: "Check that airllm works on this machine without downloading anything big."

```bash
python -c "import airllm; print('airllm', airllm.__name__)"
python - <<'EOF'
from airllm import AutoModel
m = AutoModel.from_pretrained("./tiny-llama-4layer", device="cpu", layer_shards_saving_path="./shards", max_seq_len=64)
print(type(m).__name__)
EOF
ls shards/splitted_model | head
```

For a small local Llama folder (config, tokenizer and safetensors weights) this printed `AirLLMBaseModel`, created one `model.layers.N.safetensors` file per layer plus embeddings, norm and head files, and generated tokens on CPU. If this works, move to the real model.

## Guidelines

- Speed is the cost. Do not use AirLLM behind an interactive app or an API with users waiting; for that, use llama.cpp, Ollama or vLLM with a model that fits (a quantized smaller model is usually faster and often good enough).
- Disk is part of the budget: fast NVMe, free space of one to two model sizes, and a shard path on the fast disk.
- `compression` trades a little accuracy for speed; check outputs on a few examples. It needs `bitsandbytes`, which depends on your CUDA setup.
- Newest model families may need a recent `transformers`, and some need extra packages or a specific `transformers` version. Read the README update notes for that model and test on a small variant first.
- It is inference-focused. The project also describes LoRA training of some Qwen models through example scripts in its repository; that path is not covered here and was not verified.
- Gated models need an accepted licence and a token in an environment variable; never hard-code the token.
- Generation is not deterministic across hardware; for evaluations fix seeds and settings and record the model revision.
