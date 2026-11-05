---
name: llamafactory
description: >-
  Fine-tunes open large language and vision-language models from YAML config files, with LoRA, QLoRA or full training, through the llamafactory-cli command. Use when someone asks to "fine-tune Qwen with LoRA", "train a model on my own instruction dataset", "merge a LoRA adapter", "chat with my fine-tuned model", "serve a tuned model over an OpenAI-compatible API", or "use LLaMA-Factory". Covers dataset_info.json registration, the train/chat/export/api/webui commands, QLoRA quantization and multi-GPU launches.
license: Apache-2.0
compatibility: "Python 3.11+, PyTorch with a CUDA GPU (CPU-only is not practical for training), Linux recommended"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: "fine-tuning, lora, qlora, llm, llamafactory"
  repository: https://github.com/hiyouga/LlamaFactory
---
# LlamaFactory — Config-driven fine-tuning for 100+ LLMs and VLMs

## Overview
LlamaFactory (LLaMA-Factory on GitHub, `llamafactory` on PyPI) wraps Hugging Face Transformers and PEFT behind one command, `llamafactory-cli`. A training run is described by a flat YAML file: the base model, the method (`sft`, `dpo`, `kto`, `rm`, `pt`), the tuning type (`lora`, `full`, `freeze`), the dataset names and the hyper-parameters. The same tool then chats with the result, merges the adapter into the base weights, and serves an OpenAI-style API. There is also a Gradio web UI (LLaMA Board).

This skill was written from the repository at release v0.9.5 (PyPI `llamafactory` 0.9.5, May 2026, requires Python 3.11+): the README, `data/README.md` and the files in `examples/`. Training needs a GPU, so none of the commands below were run while writing it. Verify with `llamafactory-cli help` on the machine you use.

## Instructions

### Installation
The README marks installation as mandatory and recommends installing from source so that the `examples/` and `data/` folders are on disk:

```bash
git clone --depth 1 https://github.com/hiyouga/LlamaFactory.git
cd LlamaFactory
python -m venv .venv
.venv/bin/pip install -e .
.venv/bin/pip install -r requirements/metrics.txt
.venv/bin/llamafactory-cli version
```

`pip install llamafactory` also works and installs the same `llamafactory-cli` (alias `lmf`), but then you must write your own YAML files and your own `dataset_info.json`. Install a CUDA build of PyTorch first if the default one does not see your GPU: `python -c "import torch; print(torch.cuda.is_available())"` must print `True`. Gated models such as Llama need `huggingface-cli login` first.

### Register a dataset
Datasets are looked up by name in `data/dataset_info.json` (folder set by `dataset_dir`, default `./data`). Two formats are supported: `alpaca` (default) and `sharegpt`. For alpaca, each record has `instruction`, optional `input`, and `output`; optional `system` and `history` columns exist.

```json
{
  "support_replies": {
    "file_name": "support_replies.json"
  }
}
```

Merge this entry into the existing `dataset_info.json` (keep the demo entries `identity` and `alpaca_en_demo`) and put `support_replies.json` next to it. For other column names add a `columns` map, e.g. `"columns": {"prompt": "question", "response": "answer"}`. For sharegpt-style chat data set `"formatting": "sharegpt"`, with turns in a `conversations` list using `from` (`human`, `gpt`) and `value`. Hub datasets use `hf_hub_url` instead of `file_name`.

### Train with LoRA
Copy the README's reference file `examples/train_lora/qwen3_lora_sft.yaml` and change the dataset, template and output folder:

```yaml
### model
model_name_or_path: Qwen/Qwen3-4B-Instruct-2507
trust_remote_code: true

### method
stage: sft
do_train: true
finetuning_type: lora
lora_rank: 8
lora_target: all

### dataset
dataset: support_replies
template: qwen3_nothink
cutoff_len: 2048
max_samples: 1000

### output
output_dir: saves/qwen3-4b/lora/support
logging_steps: 10
save_steps: 500
plot_loss: true
overwrite_output_dir: true
report_to: none

### train
per_device_train_batch_size: 1
gradient_accumulation_steps: 8
learning_rate: 1.0e-4
num_train_epochs: 3.0
lr_scheduler_type: cosine
warmup_ratio: 0.1
bf16: true
```

```bash
llamafactory-cli train configs/qwen3_support_lora.yaml
```

The `template` must match the model family (`qwen3_nothink`, `llama3`, ...); use the template the README model table lists for your model. Any YAML key can be overridden with `key=value` after the YAML path, for example `llamafactory-cli train configs/qwen3_support_lora.yaml num_train_epochs=1`. Checkpoints and a loss plot are written to `output_dir`. To hold out data for evaluation, add `val_size: 0.1`, `per_device_eval_batch_size: 1`, `eval_strategy: steps` and `eval_steps: 500`.

### QLoRA (quantized base model)
Add on-the-fly quantization to the model section of the LoRA file (from `examples/train_qlora/qwen3_lora_sft_otfq.yaml`):

```yaml
quantization_bit: 4        # 8 or 4 with bnb; 3 and 2 need hqq
quantization_method: bnb   # bnb, hqq or eetq
```

Pre-quantized GPTQ/AWQ/AQLM models are also covered by files in `examples/train_qlora/`. On Windows, bitsandbytes needs a pre-built wheel (see the README).

### Chat, merge, serve
Inference and export use small YAML files that point at the adapter:

```yaml
# configs/infer_support.yaml
model_name_or_path: Qwen/Qwen3-4B-Instruct-2507
adapter_name_or_path: saves/qwen3-4b/lora/support
template: qwen3_nothink
infer_backend: huggingface   # huggingface, vllm, sglang or ktransformers
trust_remote_code: true
```

```yaml
# configs/merge_support.yaml
### Do not use a quantized model or quantization_bit when merging
model_name_or_path: Qwen/Qwen3-4B-Instruct-2507
adapter_name_or_path: saves/qwen3-4b/lora/support
template: qwen3_nothink
trust_remote_code: true
export_dir: saves/qwen3_support_merged
export_size: 5
export_device: cpu
export_legacy_format: false
```

```bash
llamafactory-cli chat configs/infer_support.yaml     # terminal chat
llamafactory-cli export configs/merge_support.yaml   # merged weights in export_dir
API_HOST=127.0.0.1 API_PORT=8000 API_KEY=$LF_API_KEY llamafactory-cli api configs/infer_support.yaml infer_backend=vllm vllm_enforce_eager=true
GRADIO_SERVER_NAME=127.0.0.1 llamafactory-cli webui  # LLaMA Board (Gradio)
```

The `api` command exposes an OpenAI-style endpoint on `API_PORT` and checks the `Authorization: Bearer` header against `API_KEY` when that variable is set. In v0.9.5 `api` listens on `0.0.0.0` unless `API_HOST` is set, and `webui` and `webchat` listen on `0.0.0.0` unless `GRADIO_SERVER_NAME` is set, so set both to `127.0.0.1` unless you mean to expose the service. Other subcommands in v0.9.5: `webchat`, `env`, `version`, `help` (`eval` only raises NotImplementedError).

### Multi-GPU
`llamafactory-cli train` launches torchrun by itself when several GPUs are visible. Choose devices with `CUDA_VISIBLE_DEVICES=0,1`. Set `FORCE_TORCHRUN=1` to force it, and for DeepSpeed use the ready-made file `examples/train_lora/qwen3_lora_sft_ds3.yaml` (needs `requirements/deepspeed.txt`). Multi-node runs add `NNODES`, `NODE_RANK`, `MASTER_ADDR` and `MASTER_PORT`.

## Examples

### 1. Teach a 4B model a support-desk tone with LoRA
**Request:** "I have 1,800 reply pairs from our help desk in `support_replies.json`. Fine-tune Qwen3-4B on them with LoRA and let me try it."

```bash
cd LlamaFactory
cp data/dataset_info.json data/dataset_info.json.bak
cp ~/exports/support_replies.json data/support_replies.json
python3 - <<'EOF'
import json
p = "data/dataset_info.json"
d = json.load(open(p))
d["support_replies"] = {"file_name": "support_replies.json"}
json.dump(d, open(p, "w"), indent=2)
EOF
.venv/bin/llamafactory-cli train configs/qwen3_support_lora.yaml
.venv/bin/llamafactory-cli chat configs/infer_support.yaml
```

**Result:** the log prints the loss every 10 steps, `saves/qwen3-4b/lora/support/` holds the adapter and `training_loss.png`, and `chat` opens a prompt where the model answers in the help-desk style. Check free VRAM with `nvidia-smi` first; the README has a memory table per model size and method.

### 2. Fit an 8B model on a 24 GB card with QLoRA, then ship it
**Request:** "Train Qwen3-8B on the same data but it must fit in 24 GB, then give me a merged model I can serve."

```bash
sed -e 's#Qwen/Qwen3-4B-Instruct-2507#Qwen/Qwen3-8B#' \
    -e 's#saves/qwen3-4b/lora/support#saves/qwen3-8b/qlora/support#' \
    -e 's#template: qwen3_nothink#template: qwen3#' \
    configs/qwen3_support_lora.yaml > configs/qwen3_8b_support_qlora.yaml
printf 'quantization_bit: 4\nquantization_method: bnb\n' >> configs/qwen3_8b_support_qlora.yaml
.venv/bin/llamafactory-cli train configs/qwen3_8b_support_qlora.yaml
```

Then write a merge file that points at the unquantized `Qwen/Qwen3-8B` and the new adapter folder (without `quantization_bit`), run `llamafactory-cli export` on it, and serve `export_dir` with `llamafactory-cli api` or with vLLM.

**Result:** the adapter trains on the 4-bit base, the merge writes full-precision safetensors into `export_dir`, and the API answers OpenAI-style chat requests on port 8000 of 127.0.0.1. Appending keys with `printf` works because the YAML is flat. Qwen3-8B is the hybrid-thinking model, so it uses `template: qwen3`; the `qwen3_nothink` template belongs to the Qwen3 instruct-2507 models. Use the same `template` value in the merge file.

## Guidelines
- Always pass a YAML file to `llamafactory-cli train`; there is no `--config` option and no `python -m llamafactory.train` entry point to rely on.
- Keep `template` aligned with the model and use the same template for training, chat, export and serving.
- Merge adapters into the unquantized base model: a quantized base or `quantization_bit` in the export file is not supported.
- Start with the demo datasets (`identity,alpaca_en_demo`) and `max_samples` small to prove the setup before a long run.
- Never commit `dataset_info.json` entries or data files containing customer text to a public repository; keep `HF_TOKEN` in the environment, not in YAML.
- Model downloads are large; set `HF_HOME` to a disk with space. Models can be pulled from ModelScope instead of Hugging Face with `export USE_MODELSCOPE_HUB=1`.
- For a one-GPU Python workflow with notebooks, the [unsloth](/skills/unsloth) skill is the alternative; choose LlamaFactory when you want config-file runs, many model families, DPO/KTO/reward stages or the web UI.
- Do not use it for tiny CPU-only machines: training is not practical there. Use `ollama` or `llama-cpp` for running models instead.
