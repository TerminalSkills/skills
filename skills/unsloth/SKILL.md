---
name: unsloth
description: >-
  Unsloth fine-tunes open LLMs such as Llama, Qwen and Gemma with LoRA or QLoRA
  about twice as fast and with far less GPU memory than a stock Hugging Face
  setup, then exports the result to GGUF for Ollama and llama.cpp or to merged
  weights for vLLM. Use it when someone wants to train a model on their own
  data on a single GPU, a Colab notebook or a workstation. Trigger phrases:
  "fine-tune Llama on my data", "QLoRA on a 16 GB GPU", "train Qwen with
  Unsloth", "export my fine-tune to GGUF", "make an Ollama model from my
  dataset", "unsloth train", "FastLanguageModel".
license: Apache-2.0
compatibility: "Python 3.11-3.13 (3.13 recommended; the CLI training backend needs 3.11+); NVIDIA GPU with CUDA capability 7.0+ (AMD and Intel via their own guides); Linux, WSL or Windows for the Python library"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["fine-tuning", "qlora", "llm-training", "gguf", "unsloth"]
  repository: https://github.com/unslothai/unsloth
---

# Unsloth — Fast LoRA and QLoRA Fine-Tuning for Open LLMs

## Overview

Unsloth is an open-source training library (plus a desktop app and web UI called Unsloth Studio) that patches Hugging Face Transformers, PEFT and TRL with hand-written Triton kernels. The same LoRA or QLoRA run needs noticeably less VRAM and finishes faster, which is what makes an 8B model trainable on a 16 GB card or a free Colab T4. There are two code entry points:

- **Python API** (the Apache-2.0 core library): `FastLanguageModel.from_pretrained` loads a model (4-bit by default), `FastLanguageModel.get_peft_model` attaches LoRA adapters, and a normal TRL `SFTTrainer` runs the training.
- **`unsloth` CLI** (runs the Studio training backend, AGPL-3.0): `unsloth train` runs the same training from flags or a YAML file, and `unsloth export` turns a checkpoint into merged weights, GGUF or a LoRA adapter.

After training, Unsloth saves in the formats people deploy: GGUF files (plus an Ollama `Modelfile` when it knows the chat template), merged 16-bit weights for `vllm serve`, or a small LoRA adapter.

Absolute minimum VRAM from the Unsloth requirements page: 8B QLoRA about 6 GB, 14B about 8.5 GB, 70B about 41 GB; 16-bit LoRA needs roughly three to four times more.

## Instructions

### Installation

Install into a fresh virtual environment. `uv` picks the right PyTorch build for the installed CUDA driver. The bare `unsloth` package covers only the Python API; the `unsloth train/export/list-checkpoints` commands import the Studio backend (FastAPI, uvicorn, gguf and more), which comes with the `studio` extra:

```bash
uv venv unsloth_env --python 3.13
source unsloth_env/bin/activate
uv pip install "unsloth[studio]" --torch-backend=auto   # CLI + Python API
# uv pip install unsloth vllm --torch-backend=auto      # Python API + vLLM serving only
```

Check the install with a command that loads the backend (`--help` alone passes even when backend packages are missing):

```bash
unsloth --version
unsloth list-checkpoints   # fresh install: "No checkpoints found."; missing extra: "needs fastapi"
```

The `unsloth[studio]` extra above already includes the Studio web UI (`unsloth studio`). The desktop app has a separate installer described at https://unsloth.ai/docs; an agent does not need it.

Gated or private models need a Hugging Face token. Create a read token at https://huggingface.co/settings/tokens (a write token if you will push models) and export it as `HF_TOKEN`; both the CLI and the save/push functions read it.

### Prepare the dataset

`unsloth train` detects three layouts in a JSONL file or Hub dataset:

- **chatml**: a `messages` (or `conversations`) column holding `{"role": ..., "content": ...}` turns
- **sharegpt**: the same column with `{"from": ..., "value": ...}` turns
- **alpaca**: `instruction`, optional `input`, and `output` columns

One chatml line looks like this:

```json
{"messages": [{"role": "system", "content": "You are the support assistant for Northwind Freight."}, {"role": "user", "content": "My pallet shows 'held at customs' since Monday. What do I do?"}, {"role": "assistant", "content": "Customs holds usually mean a missing commercial invoice. Upload it under Shipments > Documents and the broker re-files within 24 hours."}]}
```

A few hundred to a few thousand clean examples are typical for style and domain adaptation. Quality matters more than volume.

### Train from the CLI

`--output-dir` is a run name inside Unsloth's own outputs folder, not a path in the current directory: `outputs/support-llama32` lands in `~/.unsloth/studio/outputs/support-llama32` (or `$UNSLOTH_STUDIO_HOME/outputs/...`; export `UNSLOTH_STUDIO_HOME="$PWD/.unsloth"` to keep runs in the project). A leading `outputs/` is stripped, and an absolute path outside that folder is rejected. The dry run still echoes the name as typed. Preview with `--dry-run`, then drop the flag to train:

```bash
unsloth train \
  --model unsloth/Llama-3.2-3B-Instruct \
  --local-dataset data/tickets.jsonl \
  --format-type chatml \
  --train-on-completions \
  --lora-r 16 --lora-alpha 16 \
  --num-epochs 2 \
  --output-dir outputs/support-llama32 \
  --dry-run
```

Defaults shown by the dry run: LoRA training, `load_in_4bit: true`, learning rate 2e-4, batch size 2, gradient accumulation 4, `max_seq_length` 2048, all seven attention and MLP projections targeted. Keep long runs reproducible in a YAML file (flags on the command line override it):

```yaml
model: unsloth/Qwen3-8B
data:
  local_dataset:
    - data/tickets.jsonl
  format_type: chatml
training:
  max_seq_length: 4096
  num_epochs: 2
  learning_rate: 0.0002
  output_dir: outputs/support-qwen3
  train_on_completions: true
lora:
  lora_r: 16
  lora_alpha: 16
```

```bash
unsloth train -c support-lora.yaml
unsloth list-checkpoints        # absolute path and loss of every run and checkpoint
```

`--enable-wandb` with `WANDB_API_KEY` in the environment sends metrics to Weights & Biases; `--enable-tensorboard` writes TensorBoard logs.

### Train from Python

The Python API gives full control and matches the official notebooks:

```python
from unsloth import FastLanguageModel
from unsloth.chat_templates import get_chat_template, train_on_responses_only
from datasets import load_dataset
from trl import SFTConfig, SFTTrainer

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Llama-3.1-8B-Instruct",
    max_seq_length=2048,
    load_in_4bit=True,          # QLoRA; False plus load_in_16bit=True for 16-bit LoRA
)
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    lora_alpha=16,
    lora_dropout=0,             # 0 is the optimized path
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    use_gradient_checkpointing="unsloth",
    random_state=3407,
)

tokenizer = get_chat_template(tokenizer, chat_template="llama-3.1")
dataset = load_dataset("json", data_files="data/tickets.jsonl", split="train")
dataset = dataset.map(
    lambda batch: {"text": [tokenizer.apply_chat_template(m, tokenize=False)
                            for m in batch["messages"]]},
    batched=True,
)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    args=SFTConfig(
        dataset_text_field="text",
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=5,
        num_train_epochs=1,
        learning_rate=2e-4,
        optim="adamw_8bit",
        logging_steps=10,
        output_dir="outputs/support-llama31",
        report_to="none",
    ),
)
trainer = train_on_responses_only(trainer)   # loss only on assistant turns
trainer.train()
```

`train_on_responses_only` auto-detects the user and assistant markers from the chat template. Other template names include `qwen3`, `gemma-3`, `mistral`, `phi-4` and `chatml`. Use `max_steps=60` instead of epochs for a quick smoke test.

### Test, save and export

```python
FastLanguageModel.for_inference(model)
messages = [{"role": "user", "content": "Where do I upload a commercial invoice?"}]
inputs = tokenizer.apply_chat_template(messages, tokenize=True,
    add_generation_prompt=True, return_tensors="pt").to("cuda")
print(tokenizer.batch_decode(model.generate(input_ids=inputs, max_new_tokens=128))[0])

model.save_pretrained("support_lora")            # adapter only, tens of MB
tokenizer.save_pretrained("support_lora")
model.save_pretrained_merged("support_16bit", tokenizer, save_method="merged_16bit")
model.save_pretrained_gguf("support", tokenizer, quantization_method="q4_k_m")
```

`save_pretrained_gguf("support", ...)` writes to a sibling folder `support_gguf/` with a file ending in `.Q4_K_M.gguf`, plus a `Modelfile` for Ollama when the template is known. Other `quantization_method` values: `q8_0`, `q5_k_m`, `f16`, `bf16`, or a list such as `["q4_k_m", "q8_0"]`. The first GGUF export clones and builds llama.cpp, so it needs `git`, `cmake` and a C++ compiler.

The CLI does the same from a saved checkpoint (formats: `merged-16bit`, `merged-4bit`, `gguf`, `lora`). Pass the absolute checkpoint path that `unsloth list-checkpoints` prints; a relative `outputs/...` is read from the current directory or treated as a Hub repo id. A relative output directory is created under Unsloth's own exports folder, so pass an absolute path to choose the location; the command ends by printing `Saved to:` with the final path, and for GGUF the `.gguf` file and `Modelfile` sit directly in it:

```bash
RUN="$HOME/.unsloth/studio/outputs/support-llama32"   # as printed by list-checkpoints
unsloth export "$RUN" "$PWD/exports/support-llama32" --format gguf --quantization q4_k_m
unsloth export "$RUN" "$PWD/exports/support-llama32-16bit" --format merged-16bit
```

Push to the Hub with `model.push_to_hub_gguf("northwind-ml/support-llama31-gguf", tokenizer, quantization_method="q4_k_m", token=os.environ["HF_TOKEN"])` or `unsloth export ... --push-to-hub --repo-id northwind-ml/support-llama32 --private`.

## Examples

### Example 1: Turn 2,400 support tickets into an Ollama model

**User request:** "We have 2,400 resolved tickets as chat JSON. Fine-tune something small on our RTX 4070 (12 GB) and give me a model I can run in Ollama."

```bash
unsloth train --model unsloth/Llama-3.2-3B-Instruct \
  --local-dataset data/tickets.jsonl --format-type chatml \
  --train-on-completions --num-epochs 2 --output-dir outputs/support-llama32
unsloth list-checkpoints   # support-llama32 (loss: ...): ~/.unsloth/studio/outputs/support-llama32
unsloth export "$HOME/.unsloth/studio/outputs/support-llama32" \
  "$PWD/exports/support-llama32" --format gguf --quantization q4_k_m
```

```bash
cd exports/support-llama32
ollama create northwind-support -f Modelfile
ollama run northwind-support "My pallet has been held at customs since Monday."
```

**Result:** A 3B QLoRA run fits comfortably in 12 GB. `unsloth list-checkpoints` prints the run and each `checkpoint-*` with its loss and absolute path; the first line is the final adapter, which is what gets exported. The export folder holds a Q4_K_M GGUF of about 2 GB and a `Modelfile`, and `ollama run` answers in the house style.

### Example 2: Fine-tune Qwen3-8B and serve it with vLLM

**User request:** "Train Qwen3-8B on our 9,000 contract-clause pairs and serve it behind an OpenAI-compatible API on the A100 box."

```python
from unsloth import FastLanguageModel
from unsloth.chat_templates import get_chat_template, train_on_responses_only
from datasets import load_dataset
from trl import SFTConfig, SFTTrainer

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Qwen3-8B", max_seq_length=4096, load_in_4bit=True)
model = FastLanguageModel.get_peft_model(model, r=32, lora_alpha=32,
    use_gradient_checkpointing="unsloth")
tokenizer = get_chat_template(tokenizer, chat_template="qwen3")
dataset = load_dataset("json", data_files="data/clauses.jsonl", split="train")
dataset = dataset.map(lambda b: {"text": [tokenizer.apply_chat_template(m, tokenize=False)
                                          for m in b["messages"]]}, batched=True)
trainer = SFTTrainer(model=model, tokenizer=tokenizer, train_dataset=dataset,
    args=SFTConfig(dataset_text_field="text", max_seq_length=4096,
        per_device_train_batch_size=4, gradient_accumulation_steps=4,
        num_train_epochs=2, learning_rate=2e-4, optim="adamw_8bit",
        output_dir="outputs/clauses-qwen3", report_to="none"))
trainer = train_on_responses_only(trainer)
trainer.train()
model.save_pretrained_merged("clauses_qwen3_16bit", tokenizer, save_method="merged_16bit")
```

```bash
vllm serve ./clauses_qwen3_16bit --max-model-len 4096
```

**Result:** `clauses_qwen3_16bit/` holds full 16-bit safetensors (about 16 GB for 8B), which vLLM loads like any Hub model and serves on port 8000. Merging to 16-bit, not 4-bit, keeps accuracy: the docs discourage `merged_4bit`, and `save_pretrained_merged` refuses it unless you pass `save_method="merged_4bit_forced"`.

## Guidelines

- Start from Unsloth's own model uploads (`unsloth/...`, including `-bnb-4bit` variants): they download faster and carry fixed chat templates and tokenizers.
- Use the same chat template for training and inference. A mismatch is the usual cause of gibberish or endless output after export to GGUF or Ollama.
- Out of memory: first drop `per_device_train_batch_size` to 1 or 2 and raise gradient accumulation, then shorten `max_seq_length`, then lower the LoRA rank.
- Learning rate 2e-4 is the documented default; drop to 1e-4 or 5e-5 if loss drops fast and outputs start repeating the training data. One to three epochs is typical; more usually overfits.
- Evaluate on held-out prompts before exporting. A lower training loss does not prove the model got better.
- Keep `HF_TOKEN` and `WANDB_API_KEY` in the environment, never in the YAML file or the notebook. A `--password` value for Studio is visible in the process list; use `UNSLOTH_STUDIO_PASSWORD` instead.
- Unsloth Studio runs server-side tools (web search, code execution) by default. Keep it on `127.0.0.1`, or pass `--disable-tools` before exposing it with `--secure` or `-H 0.0.0.0`.
- Licensing: the Python API (`FastLanguageModel`, the `save_*` functions) is Apache-2.0; the `unsloth` CLI commands and Unsloth Studio are AGPL-3.0. Check this before bundling the CLI or Studio into a product. The base model's own license (Llama, Gemma) still applies to your fine-tune.
- When not to use it: for PEFT methods other than LoRA/QLoRA/DoRA (IA3, prefix tuning) or custom Transformers training loops, use plain PEFT (see the peft-fine-tuning skill). Unsloth is built for single-node training; for large multi-node pretraining look at frameworks built for it. If a prompt change or retrieval (RAG) fixes the problem, do that before fine-tuning.
- Unsloth releases often and pins narrow ranges of `transformers` and `trl`. Pin the `unsloth` version in `requirements.txt` for reproducible runs and upgrade on purpose.
